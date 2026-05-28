"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "../lib/supabase";
import { API_URL } from "../lib/api";
import { validateProfile } from "../lib/onboarding";
import {
  emptyPersonal,
  VISA_OPTIONS,
  YES_NO,
  type PersonalInfo,
  type WorkExperience,
  type Project,
  type Education,
} from "../lib/profileTypes";

const emptyWork: WorkExperience = { title: "", company: "", duration: "", description: "" };
const emptyProject: Project = { name: "", description: "", technologies: "", url: "" };
const emptyEdu: Education = { degree: "", school: "", year: "", gpa: "" };

type ToastState = { type: "success" | "error"; message: string } | null;

interface ProfileFormProps {
  mode: "onboarding" | "edit";
  onComplete?: () => void;
}

export default function ProfileForm({ mode, onComplete }: ProfileFormProps) {
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

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  }, [supabase.auth]);

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `Failed to load profile (${res.status})`);
        }
        const data = await res.json();
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
      } catch (e) {
        console.error("Profile load error:", e);
        setToast({
          type: "error",
          message: e instanceof Error ? e.message : "Could not load profile — restart the backend",
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [getToken]);

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
          work_experience: workExperience.filter((w) => w.title.trim() || w.company.trim()),
          projects: projects.filter((p) => p.name.trim()),
          education: education.filter((e) => e.degree.trim() || e.school.trim()),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Save failed");
      }
      setToast({ type: "success", message: mode === "onboarding" ? "Profile saved — next: upload resume" : "Profile saved" });
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
          <strong>Step 2 of 4:</strong> Tell us about yourself. Job applications ask for address, visa status, work authorization, and more — we collect it once so auto-fill works everywhere.
        </div>
      )}

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
        <h2 className="mb-4 font-[family-name:var(--font-syne)] text-lg font-semibold">Work Authorization & Visa</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("visa_status", "Visa / citizenship status", true, "", "select", VISA_OPTIONS)}
          {field("work_authorization", "Legally authorized to work in the US?", true, "", "select", YES_NO.filter((x) => x !== "Prefer not to say"))}
          {field("require_sponsorship", "Will you require sponsorship now or in the future?", true, "", "select", YES_NO.filter((x) => x !== "Prefer not to say"))}
          {field("expected_graduation", "Expected graduation date", true, "May 2026")}
          {field("start_date", "Earliest start date", true, "June 2026")}
          {field("willing_to_relocate", "Willing to relocate?", false, "", "select", YES_NO)}
          {field("salary_expectation", "Salary expectation (optional)", false, "$25/hr or $80,000/yr")}
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

      <section className="glass-card p-6">
        <h2 className="mb-2 font-[family-name:var(--font-syne)] text-lg font-semibold">Voluntary EEO (optional)</h2>
        <p className="mb-4 text-xs text-muted">Many applications ask these — optional here but helps auto-fill.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("gender", "Gender", false, "", "select", [...YES_NO, "Non-binary", "Other"])}
          {field("ethnicity", "Race / ethnicity", false, "", "select", ["Prefer not to say", "Hispanic or Latino", "White", "Black or African American", "Asian", "Native American", "Pacific Islander", "Two or more races"])}
          {field("veteran_status", "Veteran status", false, "", "select", ["Prefer not to say", "Not a veteran", "Protected veteran", "Active duty"])}
          {field("disability_status", "Disability status", false, "", "select", ["Prefer not to say", "No disability", "Yes, I have a disability"])}
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
          <button onClick={() => setWorkExperience((p) => [...p, { ...emptyWork }])} className="text-xs text-accent-emerald">+ Add</button>
        </div>
        {errors.work && <p className="mb-2 text-xs text-accent-coral">{errors.work}</p>}
        {workExperience.map((w, idx) => (
          <div key={idx} className="mb-4 rounded-lg border border-border bg-surface/40 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={w.title} onChange={(e) => { const u = [...workExperience]; u[idx] = { ...u[idx], title: e.target.value }; setWorkExperience(u); }} placeholder="Job title" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <input value={w.company} onChange={(e) => { const u = [...workExperience]; u[idx] = { ...u[idx], company: e.target.value }; setWorkExperience(u); }} placeholder="Company" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            </div>
            <input value={w.duration} onChange={(e) => { const u = [...workExperience]; u[idx] = { ...u[idx], duration: e.target.value }; setWorkExperience(u); }} placeholder="Duration" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <textarea value={w.description} onChange={(e) => { const u = [...workExperience]; u[idx] = { ...u[idx], description: e.target.value }; setWorkExperience(u); }} placeholder="What you did" rows={2} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm resize-none" />
          </div>
        ))}
      </section>

      <section className="glass-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">Projects <span className="text-accent-coral text-sm">*</span></h2>
          <button onClick={() => setProjects((p) => [...p, { ...emptyProject }])} className="text-xs text-accent-amber">+ Add</button>
        </div>
        {errors.projects && <p className="mb-2 text-xs text-accent-coral">{errors.projects}</p>}
        {projects.map((p, idx) => (
          <div key={idx} className="mb-4 rounded-lg border border-border bg-surface/40 p-4 space-y-3">
            <input value={p.name} onChange={(e) => { const u = [...projects]; u[idx] = { ...u[idx], name: e.target.value }; setProjects(u); }} placeholder="Project name" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <textarea value={p.description} onChange={(e) => { const u = [...projects]; u[idx] = { ...u[idx], description: e.target.value }; setProjects(u); }} placeholder="Description" rows={2} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm resize-none" />
            <input value={p.technologies} onChange={(e) => { const u = [...projects]; u[idx] = { ...u[idx], technologies: e.target.value }; setProjects(u); }} placeholder="Technologies" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          </div>
        ))}
      </section>

      <section className="glass-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">Education</h2>
          <button onClick={() => setEducation((p) => [...p, { ...emptyEdu }])} className="text-xs text-accent-cyan">+ Add</button>
        </div>
        {education.map((e, idx) => (
          <div key={idx} className="mb-4 rounded-lg border border-border bg-surface/40 p-4 grid gap-3 sm:grid-cols-2">
            <input value={e.degree} onChange={(ev) => { const u = [...education]; u[idx] = { ...u[idx], degree: ev.target.value }; setEducation(u); }} placeholder="Degree" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input value={e.school} onChange={(ev) => { const u = [...education]; u[idx] = { ...u[idx], school: ev.target.value }; setEducation(u); }} placeholder="School" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input value={e.year} onChange={(ev) => { const u = [...education]; u[idx] = { ...u[idx], year: ev.target.value }; setEducation(u); }} placeholder="Year" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input value={e.gpa} onChange={(ev) => { const u = [...education]; u[idx] = { ...u[idx], gpa: ev.target.value }; setEducation(u); }} placeholder="GPA" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          </div>
        ))}
      </section>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-gradient-to-r from-accent-cyan to-accent-violet px-8 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving..." : mode === "onboarding" ? "Save & Continue to Resume →" : "Save Profile"}
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
