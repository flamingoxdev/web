"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase";
import { API_URL } from "../lib/api";
import { getAccessToken, handleAuthFailure } from "../lib/authToken";
import { validateProfile } from "../lib/onboarding";
import {
  emptyPersonal,
  type PersonalInfo,
  type WorkExperience,
  type Project,
  type Education,
  sortByRecency,
  isBlankWork,
  isBlankProject,
  isBlankEducation,
} from "../lib/profileTypes";
import ResumeUpload from "./ResumeUpload";

const emptyWork: WorkExperience = {
  title: "", company: "", location: "", start_date: "", end_date: "", duration: "", description: "",
};
const emptyProject: Project = {
  name: "", description: "", technologies: "", url: "", start_date: "", end_date: "",
};
const emptyEdu: Education = { degree: "", school: "", location: "", year: "", gpa: "", honors: "", distinction: "" };

const addBtnClass =
  "rounded-lg border border-border bg-surface-raised px-3 py-1 text-xs font-medium transition-all hover:border-accent-cyan hover:bg-accent-cyan/10 hover:text-accent-cyan hover:scale-105";

type ToastState = { type: "success" | "error"; message: string } | null;

interface ProfileFormProps {
  mode: "onboarding" | "edit";
  onComplete?: () => void;
}

export default function ProfileForm({ mode, onComplete }: ProfileFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [personal, setPersonal] = useState<PersonalInfo>(emptyPersonal());
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [workExperience, setWorkExperience] = useState<WorkExperience[]>([{ ...emptyWork }]);
  const [projects, setProjects] = useState<Project[]>([{ ...emptyProject }]);
  const [education, setEducation] = useState<Education[]>([{ ...emptyEdu }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hasResume, setHasResume] = useState(false);
  const [extractedSkills, setExtractedSkills] = useState<string[]>([]);

  const getToken = useCallback(async () => {
    return getAccessToken(supabase);
  }, [supabase]);

  useEffect(() => {
    let active = true;

    const load = async (token: string) => {
      if (!token) {
        if (active) {
          setLoading(false);
          await handleAuthFailure(supabase, router);
        }
        return;
      }

      try {
        const res = await fetch(`${API_URL}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          if (active) await handleAuthFailure(supabase, router);
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `Failed to load profile (${res.status})`);
        }
        const data = await res.json();
        if (!active) return;
        const p = data.profile;
        const pi = typeof p.personal_info === "object" ? p.personal_info : {};
        setPersonal((prev) => ({
          ...prev,
          ...pi,
          full_name: p.full_name || pi.full_name || prev.full_name,
          email: p.email || pi.email || prev.email,
          phone: p.phone || pi.phone || prev.phone,
          location: p.location || pi.location || prev.location,
          linkedin: p.linkedin || pi.linkedin || prev.linkedin,
          github: p.github || pi.github || prev.github,
        }));
        if (Array.isArray(p.skills) && p.skills.length) setSkills(p.skills);
        if (Array.isArray(p.work_experience) && p.work_experience.length) setWorkExperience(p.work_experience);
        if (Array.isArray(p.projects) && p.projects.length) setProjects(p.projects);
        if (Array.isArray(p.education) && p.education.length) setEducation(p.education);

        const statusRes = await fetch(`${API_URL}/onboarding/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (statusRes.ok) {
          const st = await statusRes.json();
          if (active) setHasResume(Boolean(st.has_resume));
        }
      } catch (e) {
        if (!active) return;
        console.error("Profile load error:", e);
        setToast({
          type: "error",
          message: e instanceof Error ? e.message : "Could not load profile — restart the backend",
        });
      } finally {
        if (active) setLoading(false);
      }
    };

    const init = async () => {
      const token = await getToken();
      await load(token);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.access_token && active) {
        setLoading(true);
        await load(session.access_token);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [getToken, supabase, router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSave = async () => {
    const validation = validateProfile(personal, skills, workExperience, projects);
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      setToast({ type: "error", message: "Please complete all required fields" });
      return;
    }

    setSaving(true);
    try {
      const token = await getToken();
      if (!token) {
        await handleAuthFailure(supabase, router);
        return;
      }
      const res = await fetch(`${API_URL}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          personal_info: personal,
          full_name: personal.full_name,
          email: personal.email,
          phone: personal.phone,
          location: personal.location || `${personal.city}, ${personal.state}`,
          linkedin: personal.linkedin,
          github: personal.github,
          skills,
          work_experience: sortByRecency(workExperience.filter((w) => w.title.trim() || w.company.trim()) as any),
          projects: sortByRecency(projects.filter((p) => p.name.trim()) as any),
          education: sortByRecency(education.filter((e) => e.degree.trim() || e.school.trim()) as any, ["year"] as any),
        }),
      });
      if (res.status === 401) {
        await handleAuthFailure(supabase, router);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Save failed");
      }
      setToast({ type: "success", message: mode === "onboarding" ? "Profile saved — next: choose a template" : "Profile saved" });
      window.scrollTo({ top: 0, behavior: "smooth" });
      onComplete?.();
    } catch (e) {
      setToast({ type: "error", message: e instanceof Error ? e.message : "Failed to save profile" });
    } finally {
      setSaving(false);
    }
  };

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) {
      setSkills((prev) => [...prev, s]);
      setSkillInput("");
    }
  };

  const field = (
    key: keyof PersonalInfo,
    label: string,
    required = false,
    placeholder = "",
    type: "text" | "select" = "text",
    options: string[] = []
  ) => (
    <div key={key}>
      <label className="mb-1 block text-xs font-medium text-muted">
        {label} {required && <span className="text-accent-coral">*</span>}
      </label>
      {type === "select" ? (
        <select
          value={personal[key]}
          onChange={(e) => setPersonal((prev) => ({ ...prev, [key]: e.target.value }))}
          className={`w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent-cyan/50 ${
            errors[key] ? "border-accent-coral/50" : "border-border"
          }`}
        >
          <option value="">Select...</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={personal[key]}
          onChange={(e) => setPersonal((prev) => ({ ...prev, [key]: e.target.value }))}
          placeholder={placeholder}
          className={`w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-accent-cyan/50 ${
            errors[key] ? "border-accent-coral/50" : "border-border"
          }`}
        />
      )}
      {errors[key] && <p className="mt-1 text-xs text-accent-coral">{errors[key]}</p>}
    </div>
  );

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-accent-cyan/30 border-t-accent-cyan animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {mode === "onboarding" && (
        <div className="rounded-xl border border-accent-cyan/20 bg-accent-cyan/5 px-4 py-3 text-sm text-foreground">
          <strong>Step 1 — Profile:</strong> Upload your resume PDF or fill in your details below. Flamingo uses this for tailoring and auto-apply.
        </div>
      )}

      <section className="glass-card p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">Upload Resume</h2>
            <p className="mt-1 text-xs text-muted">
              PDF recommended for auto-apply. We parse skills and pre-fill your profile.
            </p>
          </div>
          {hasResume && (
            <span className="shrink-0 rounded-full border border-accent-emerald/20 bg-accent-emerald/10 px-3 py-1 text-[10px] font-semibold text-accent-emerald">
              PDF ready
            </span>
          )}
        </div>
        <ResumeUpload
          isUploaded={hasResume}
          onReplace={() => setHasResume(false)}
          onUploadComplete={async (data) => {
            setHasResume(true);
            if (data.extracted_skills?.length) {
              setExtractedSkills(data.extracted_skills);
              setSkills((prev) => {
                const merged = [...prev];
                for (const s of data.extracted_skills) {
                  if (!merged.includes(s)) merged.push(s);
                }
                return merged;
              });
            }
            setToast({
              type: "success",
              message: "Resume uploaded — review and save your profile below",
            });
            const token = await getToken();
            if (token) {
              const res = await fetch(`${API_URL}/profile`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                const profileData = await res.json();
                const p = profileData.profile;
                const pi = typeof p.personal_info === "object" ? p.personal_info : {};
                setPersonal((prev) => ({
                  ...prev,
                  ...pi,
                  full_name: p.full_name || pi.full_name || prev.full_name,
                  email: p.email || pi.email || prev.email,
                  phone: p.phone || pi.phone || prev.phone,
                  location: p.location || pi.location || prev.location,
                  linkedin: p.linkedin || pi.linkedin || prev.linkedin,
                  github: p.github || pi.github || prev.github,
                }));
                if (Array.isArray(p.skills) && p.skills.length) setSkills(p.skills);
                if (Array.isArray(p.work_experience) && p.work_experience.length) setWorkExperience(p.work_experience);
                if (Array.isArray(p.projects) && p.projects.length) setProjects(p.projects);
                if (Array.isArray(p.education) && p.education.length) setEducation(p.education);
              }
            }
          }}
        />
        {extractedSkills.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {extractedSkills.slice(0, 12).map((s) => (
              <span key={s} className="rounded-full bg-accent-violet/10 px-2 py-0.5 text-[10px] text-accent-violet">
                {s}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="glass-card p-6">
        <h2 className="mb-4 font-[family-name:var(--font-syne)] text-lg font-semibold">Basic Information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("full_name", "Legal full name", true, "Jane Doe")}
          {field("preferred_name", "Preferred / first name", false, "Jane")}
          {field("email", "Email", true, "jane@email.com")}
          {field("phone", "Phone", true, "+1 (555) 123-4567")}
        </div>
      </section>

      <section className="glass-card p-6">
        <h2 className="mb-4 font-[family-name:var(--font-syne)] text-lg font-semibold">Address</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("street_address", "Street address", true, "123 Main St, Apt 4")}</div>
          {field("city", "City", true)}
          {field("state", "State / Province", true, "CA")}
          {field("zip_code", "ZIP / Postal code", true, "94105")}
          {field("country", "Country", true, "United States")}
        </div>
      </section>



      <section className="glass-card p-6">
        <h2 className="mb-4 font-[family-name:var(--font-syne)] text-lg font-semibold">Links & Portfolio</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("linkedin", "LinkedIn", false, "linkedin.com/in/jane")}
          {field("github", "GitHub", false, "github.com/jane")}
          {field("portfolio_url", "Portfolio / website", false, "jane.dev")}
        </div>
      </section>



      {/* Skills */}
      <section className="glass-card p-6">
        <h2 className="mb-4 font-[family-name:var(--font-syne)] text-lg font-semibold">Skills <span className="text-accent-coral text-sm">*</span></h2>
        {errors.skills && <p className="mb-2 text-xs text-accent-coral">{errors.skills}</p>}
        <div className="flex gap-2">
          <input
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
            placeholder="Python, React, SQL..."
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent-violet/50"
          />
          <button onClick={addSkill} className="rounded-lg bg-accent-violet/10 px-4 py-2 text-sm text-accent-violet">Add</button>
        </div>
        {skills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {skills.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full border border-accent-cyan/20 bg-accent-cyan/8 px-3 py-1 text-xs text-accent-cyan">
                {s}
                <button onClick={() => setSkills((p) => p.filter((_, j) => j !== i))} className="opacity-60 hover:opacity-100">×</button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Work, Projects, Education - condensed from original */}
      <section className="glass-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">Work Experience <span className="text-accent-coral text-sm">*</span></h2>
          <button
            type="button"
            onClick={() => {
              const last = workExperience[workExperience.length - 1];
              if (last && isBlankWork(last)) return;
              setWorkExperience((p) => [...p, { ...emptyWork }]);
            }}
            className={addBtnClass}
          >
            + Add
          </button>
        </div>
        {errors.work && <p className="mb-2 text-xs text-accent-coral">{errors.work}</p>}
        {workExperience.map((w, idx) => (
          <div key={idx} className="mb-4 rounded-lg border border-border bg-surface/40 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={w.title} onChange={(e) => { const u = [...workExperience]; u[idx] = { ...u[idx], title: e.target.value }; setWorkExperience(u); }} placeholder="Job title *" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <input value={w.company} onChange={(e) => { const u = [...workExperience]; u[idx] = { ...u[idx], company: e.target.value }; setWorkExperience(u); }} placeholder="Company *" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <input value={w.location} onChange={(e) => { const u = [...workExperience]; u[idx] = { ...u[idx], location: e.target.value }; setWorkExperience(u); }} placeholder="Location (e.g. San Francisco, CA)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <input value={w.start_date} onChange={(e) => { const u = [...workExperience]; u[idx] = { ...u[idx], start_date: e.target.value }; setWorkExperience(u); }} placeholder="Start date (e.g. Jun 2024)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <input value={w.end_date} onChange={(e) => { const u = [...workExperience]; u[idx] = { ...u[idx], end_date: e.target.value }; setWorkExperience(u); }} placeholder="End date or Present" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            </div>
            <textarea value={w.description} onChange={(e) => { const u = [...workExperience]; u[idx] = { ...u[idx], description: e.target.value }; setWorkExperience(u); }} placeholder="What you did — one bullet per line (e.g. Built X using Y; Led team of 3…)" rows={4} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm resize-none" />
          </div>
        ))}
      </section>

      <section className="glass-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">Projects <span className="text-accent-coral text-sm">*</span></h2>
          <button
            type="button"
            onClick={() => {
              const last = projects[projects.length - 1];
              if (last && isBlankProject(last)) return;
              setProjects((p) => [...p, { ...emptyProject }]);
            }}
            className={addBtnClass}
          >
            + Add
          </button>
        </div>
        {errors.projects && <p className="mb-2 text-xs text-accent-coral">{errors.projects}</p>}
        {projects.map((p, idx) => (
          <div key={idx} className="mb-4 rounded-lg border border-border bg-surface/40 p-4 space-y-3">
            <input value={p.name} onChange={(e) => { const u = [...projects]; u[idx] = { ...u[idx], name: e.target.value }; setProjects(u); }} placeholder="Project name *" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <textarea value={p.description} onChange={(e) => { const u = [...projects]; u[idx] = { ...u[idx], description: e.target.value }; setProjects(u); }} placeholder="What you built and the impact — be specific *" rows={3} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm resize-none" />
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={p.technologies} onChange={(e) => { const u = [...projects]; u[idx] = { ...u[idx], technologies: e.target.value }; setProjects(u); }} placeholder="Technologies (React, Python, AWS…)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <input value={p.url} onChange={(e) => { const u = [...projects]; u[idx] = { ...u[idx], url: e.target.value }; setProjects(u); }} placeholder="GitHub / demo URL (optional)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={p.start_date} onChange={(e) => { const u = [...projects]; u[idx] = { ...u[idx], start_date: e.target.value }; setProjects(u); }} placeholder="Start date (optional)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <input value={p.end_date} onChange={(e) => { const u = [...projects]; u[idx] = { ...u[idx], end_date: e.target.value }; setProjects(u); }} placeholder="End date (optional)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            </div>
          </div>
        ))}
      </section>

      <section className="glass-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">Education</h2>
          <button
            type="button"
            onClick={() => {
              const last = education[education.length - 1];
              if (last && isBlankEducation(last)) return;
              setEducation((p) => [...p, { ...emptyEdu }]);
            }}
            className={addBtnClass}
          >
            + Add
          </button>
        </div>
        {education.map((e, idx) => (
          <div key={idx} className="mb-4 rounded-lg border border-border bg-surface/40 p-4 grid gap-3 sm:grid-cols-2">
            <input value={e.degree} onChange={(ev) => { const u = [...education]; u[idx] = { ...u[idx], degree: ev.target.value }; setEducation(u); }} placeholder="Degree (e.g. B.S. Computer Science)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input value={e.school} onChange={(ev) => { const u = [...education]; u[idx] = { ...u[idx], school: ev.target.value }; setEducation(u); }} placeholder="School" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input value={e.location} onChange={(ev) => { const u = [...education]; u[idx] = { ...u[idx], location: ev.target.value }; setEducation(u); }} placeholder="Location" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input value={e.year} onChange={(ev) => { const u = [...education]; u[idx] = { ...u[idx], year: ev.target.value }; setEducation(u); }} placeholder="Graduation year" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input value={e.gpa} onChange={(ev) => { const u = [...education]; u[idx] = { ...u[idx], gpa: ev.target.value }; setEducation(u); }} placeholder="GPA (optional)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input value={e.honors} onChange={(ev) => { const u = [...education]; u[idx] = { ...u[idx], honors: ev.target.value }; setEducation(u); }} placeholder="Honors (e.g. Dean's List)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input value={e.distinction} onChange={(ev) => { const u = [...education]; u[idx] = { ...u[idx], distinction: ev.target.value }; setEducation(u); }} placeholder="Distinction (e.g. Summa Cum Laude)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm sm:col-span-2" />
          </div>
        ))}
      </section>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-gradient-to-r from-accent-cyan to-accent-violet px-8 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving..." : mode === "onboarding" ? "Save & Choose Template →" : "Save Profile"}
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
          <div className={`rounded-xl border px-5 py-3 text-sm ${
            toast.type === "success" ? "border-accent-emerald/20 bg-accent-emerald/10 text-accent-emerald" : "border-accent-coral/20 bg-accent-coral/10 text-accent-coral"
          }`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
