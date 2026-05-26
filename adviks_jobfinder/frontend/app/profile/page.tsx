"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "../lib/supabase";
import Header from "../components/Header";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PersonalInfo {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
}

interface WorkExperience {
  title: string;
  company: string;
  duration: string;
  description: string;
}

interface Project {
  name: string;
  description: string;
  technologies: string;
  url: string;
}

interface Education {
  degree: string;
  school: string;
  year: string;
  gpa: string;
}

type ToastState = { type: "success" | "error"; message: string } | null;

const emptyWork: WorkExperience = { title: "", company: "", duration: "", description: "" };
const emptyProject: Project = { name: "", description: "", technologies: "", url: "" };
const emptyEdu: Education = { degree: "", school: "", year: "", gpa: "" };

export default function ProfilePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const [personal, setPersonal] = useState<PersonalInfo>({
    full_name: "", email: "", phone: "", location: "", linkedin: "", github: "",
  });
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [workExperience, setWorkExperience] = useState<WorkExperience[]>([{ ...emptyWork }]);
  const [projects, setProjects] = useState<Project[]>([{ ...emptyProject }]);
  const [education, setEducation] = useState<Education[]>([{ ...emptyEdu }]);

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  }, [supabase.auth]);

  // Load profile on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load profile");
        const data = await res.json();
        const p = data.profile;

        if (p.personal_info && typeof p.personal_info === "object") {
          setPersonal(prev => ({ ...prev, ...p.personal_info }));
        }
        if (p.full_name) setPersonal(prev => ({ ...prev, full_name: p.full_name }));
        if (p.email) setPersonal(prev => ({ ...prev, email: p.email }));

        if (Array.isArray(p.skills) && p.skills.length > 0) setSkills(p.skills);
        if (Array.isArray(p.work_experience) && p.work_experience.length > 0) setWorkExperience(p.work_experience);
        if (Array.isArray(p.projects) && p.projects.length > 0) setProjects(p.projects);
        if (Array.isArray(p.education) && p.education.length > 0) setEducation(p.education);
      } catch (e) {
        console.error("Profile load error:", e);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [getToken]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!personal.full_name.trim()) newErrors.full_name = "Name is required";
    if (!personal.email.trim()) newErrors.email = "Email is required";

    if (skills.length === 0) newErrors.skills = "Add at least one skill";

    const hasWorkExp = workExperience.some(w => w.title.trim() || w.company.trim());
    if (!hasWorkExp) newErrors.work = "Add at least one work experience entry";

    const hasProject = projects.some(p => p.name.trim());
    if (!hasProject) newErrors.projects = "Add at least one project";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      setToast({ type: "error", message: "Please fill in all required fields" });
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
          location: personal.location,
          linkedin: personal.linkedin,
          github: personal.github,
          skills,
          work_experience: workExperience.filter(w => w.title.trim() || w.company.trim()),
          projects: projects.filter(p => p.name.trim()),
          education: education.filter(e => e.degree.trim() || e.school.trim()),
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setToast({ type: "success", message: "Profile saved successfully" });
    } catch {
      setToast({ type: "error", message: "Failed to save profile" });
    } finally {
      setSaving(false);
    }
  };

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) {
      setSkills(prev => [...prev, s]);
      setSkillInput("");
    }
  };

  const removeSkill = (idx: number) => {
    setSkills(prev => prev.filter((_, i) => i !== idx));
  };

  if (loading) {
    return (
      <div className="relative min-h-screen">
        <Header />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-10 w-10 rounded-full border-2 border-accent-cyan/30 border-t-accent-cyan animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      {/* Animated background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="bg-orb-1 absolute -top-32 left-[15%] h-[500px] w-[500px] rounded-full bg-[#0d1b3e]/60 blur-[120px]" />
        <div className="bg-orb-2 absolute top-[40%] -right-20 h-[420px] w-[420px] rounded-full bg-[#1a0d2e]/50 blur-[100px]" />
        <div className="bg-orb-3 absolute -bottom-20 left-[35%] h-[380px] w-[380px] rounded-full bg-[#06101a]/80 blur-[90px]" />
      </div>

      <Header />

      <main className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="mb-8 animate-slide-up">
          <h1 className="font-[family-name:var(--font-syne)] text-3xl font-bold tracking-tight text-foreground">
            My Profile
          </h1>
          <p className="mt-2 text-sm text-muted">
            Complete your profile to enable AI resume tailoring.
            <span className="text-accent-coral"> * </span>
            indicates required fields.
          </p>
        </div>

        <div className="space-y-6">
          {/* ── Personal Info ──────────────────────────────────────── */}
          <section className="glass-card p-6 animate-slide-up">
            <h2 className="mb-4 font-[family-name:var(--font-syne)] text-lg font-semibold text-foreground flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-cyan">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Personal Information
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                { key: "full_name", label: "Full Name", required: true, placeholder: "John Doe" },
                { key: "email", label: "Email", required: true, placeholder: "john@example.com" },
                { key: "phone", label: "Phone", required: false, placeholder: "+1 (555) 123-4567" },
                { key: "location", label: "Location", required: false, placeholder: "New York, NY" },
                { key: "linkedin", label: "LinkedIn URL", required: false, placeholder: "linkedin.com/in/johndoe" },
                { key: "github", label: "GitHub URL", required: false, placeholder: "github.com/johndoe" },
              ] as const).map(({ key, label, required, placeholder }) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-medium text-muted">
                    {label} {required && <span className="text-accent-coral">*</span>}
                  </label>
                  <input
                    type="text"
                    value={personal[key]}
                    onChange={e => setPersonal(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className={`w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted/40 outline-none transition-colors focus:border-accent-cyan/50 ${
                      errors[key] ? "border-accent-coral/50" : "border-border"
                    }`}
                  />
                  {errors[key] && <p className="mt-1 text-xs text-accent-coral">{errors[key]}</p>}
                </div>
              ))}
            </div>
          </section>

          {/* ── Skills ─────────────────────────────────────────────── */}
          <section className="glass-card p-6 animate-slide-up" style={{ animationDelay: "60ms" }}>
            <h2 className="mb-4 font-[family-name:var(--font-syne)] text-lg font-semibold text-foreground flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-violet">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              Skills <span className="text-accent-coral text-sm">*</span>
            </h2>
            {errors.skills && <p className="mb-2 text-xs text-accent-coral">{errors.skills}</p>}
            <div className="flex gap-2">
              <input
                type="text"
                value={skillInput}
                onChange={e => setSkillInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addSkill())}
                placeholder="Type a skill and press Enter"
                className="flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted/40 outline-none transition-colors focus:border-accent-violet/50"
              />
              <button
                onClick={addSkill}
                className="rounded-lg border border-accent-violet/20 bg-accent-violet/10 px-4 py-2.5 text-sm font-medium text-accent-violet transition-colors hover:bg-accent-violet/20"
              >
                Add
              </button>
            </div>
            {skills.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {skills.map((s, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-full border border-accent-cyan/20 bg-accent-cyan/8 px-3 py-1 text-xs font-medium text-accent-cyan"
                  >
                    {s}
                    <button
                      onClick={() => removeSkill(i)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-accent-cyan/20 transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* ── Work Experience ─────────────────────────────────────── */}
          <section className="glass-card p-6 animate-slide-up" style={{ animationDelay: "120ms" }}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold text-foreground flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-emerald">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
                Work Experience <span className="text-accent-coral text-sm">*</span>
              </h2>
              <button
                onClick={() => setWorkExperience(prev => [...prev, { ...emptyWork }])}
                className="text-xs text-accent-emerald hover:text-accent-emerald/80 transition-colors"
              >
                + Add entry
              </button>
            </div>
            {errors.work && <p className="mb-2 text-xs text-accent-coral">{errors.work}</p>}
            <div className="space-y-4">
              {workExperience.map((w, idx) => (
                <div key={idx} className="rounded-lg border border-border bg-surface/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-[family-name:var(--font-jetbrains-mono)] text-xs text-muted">#{idx + 1}</span>
                    {workExperience.length > 1 && (
                      <button
                        onClick={() => setWorkExperience(prev => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-accent-coral hover:text-accent-coral/80 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="text" value={w.title}
                      onChange={e => {
                        const updated = [...workExperience];
                        updated[idx] = { ...updated[idx], title: e.target.value };
                        setWorkExperience(updated);
                      }}
                      placeholder="Job Title"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-accent-emerald/50"
                    />
                    <input
                      type="text" value={w.company}
                      onChange={e => {
                        const updated = [...workExperience];
                        updated[idx] = { ...updated[idx], company: e.target.value };
                        setWorkExperience(updated);
                      }}
                      placeholder="Company"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-accent-emerald/50"
                    />
                  </div>
                  <input
                    type="text" value={w.duration}
                    onChange={e => {
                      const updated = [...workExperience];
                      updated[idx] = { ...updated[idx], duration: e.target.value };
                      setWorkExperience(updated);
                    }}
                    placeholder="Duration (e.g., Jun 2024 – Present)"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-accent-emerald/50"
                  />
                  <textarea
                    value={w.description}
                    onChange={e => {
                      const updated = [...workExperience];
                      updated[idx] = { ...updated[idx], description: e.target.value };
                      setWorkExperience(updated);
                    }}
                    placeholder="Description of responsibilities and achievements"
                    rows={3}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/40 outline-none resize-none focus:border-accent-emerald/50"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ── Projects ───────────────────────────────────────────── */}
          <section className="glass-card p-6 animate-slide-up" style={{ animationDelay: "180ms" }}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold text-foreground flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-amber">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                Projects <span className="text-accent-coral text-sm">*</span>
              </h2>
              <button
                onClick={() => setProjects(prev => [...prev, { ...emptyProject }])}
                className="text-xs text-accent-amber hover:text-accent-amber/80 transition-colors"
              >
                + Add project
              </button>
            </div>
            {errors.projects && <p className="mb-2 text-xs text-accent-coral">{errors.projects}</p>}
            <div className="space-y-4">
              {projects.map((p, idx) => (
                <div key={idx} className="rounded-lg border border-border bg-surface/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-[family-name:var(--font-jetbrains-mono)] text-xs text-muted">#{idx + 1}</span>
                    {projects.length > 1 && (
                      <button
                        onClick={() => setProjects(prev => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-accent-coral hover:text-accent-coral/80 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="text" value={p.name}
                      onChange={e => {
                        const updated = [...projects];
                        updated[idx] = { ...updated[idx], name: e.target.value };
                        setProjects(updated);
                      }}
                      placeholder="Project Name"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-accent-amber/50"
                    />
                    <input
                      type="text" value={p.url}
                      onChange={e => {
                        const updated = [...projects];
                        updated[idx] = { ...updated[idx], url: e.target.value };
                        setProjects(updated);
                      }}
                      placeholder="Project URL (optional)"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-accent-amber/50"
                    />
                  </div>
                  <textarea
                    value={p.description}
                    onChange={e => {
                      const updated = [...projects];
                      updated[idx] = { ...updated[idx], description: e.target.value };
                      setProjects(updated);
                    }}
                    placeholder="Project description"
                    rows={2}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/40 outline-none resize-none focus:border-accent-amber/50"
                  />
                  <input
                    type="text" value={p.technologies}
                    onChange={e => {
                      const updated = [...projects];
                      updated[idx] = { ...updated[idx], technologies: e.target.value };
                      setProjects(updated);
                    }}
                    placeholder="Technologies (comma separated)"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-accent-amber/50"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ── Education ──────────────────────────────────────────── */}
          <section className="glass-card p-6 animate-slide-up" style={{ animationDelay: "240ms" }}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold text-foreground flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-cyan">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c3 3 9 3 12 0v-5" />
                </svg>
                Education
              </h2>
              <button
                onClick={() => setEducation(prev => [...prev, { ...emptyEdu }])}
                className="text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors"
              >
                + Add entry
              </button>
            </div>
            <div className="space-y-4">
              {education.map((e, idx) => (
                <div key={idx} className="rounded-lg border border-border bg-surface/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-[family-name:var(--font-jetbrains-mono)] text-xs text-muted">#{idx + 1}</span>
                    {education.length > 1 && (
                      <button
                        onClick={() => setEducation(prev => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-accent-coral hover:text-accent-coral/80 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="text" value={e.degree}
                      onChange={ev => {
                        const updated = [...education];
                        updated[idx] = { ...updated[idx], degree: ev.target.value };
                        setEducation(updated);
                      }}
                      placeholder="Degree (e.g., B.S. Computer Science)"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-accent-cyan/50"
                    />
                    <input
                      type="text" value={e.school}
                      onChange={ev => {
                        const updated = [...education];
                        updated[idx] = { ...updated[idx], school: ev.target.value };
                        setEducation(updated);
                      }}
                      placeholder="School Name"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-accent-cyan/50"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="text" value={e.year}
                      onChange={ev => {
                        const updated = [...education];
                        updated[idx] = { ...updated[idx], year: ev.target.value };
                        setEducation(updated);
                      }}
                      placeholder="Year (e.g., 2025)"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-accent-cyan/50"
                    />
                    <input
                      type="text" value={e.gpa}
                      onChange={ev => {
                        const updated = [...education];
                        updated[idx] = { ...updated[idx], gpa: ev.target.value };
                        setEducation(updated);
                      }}
                      placeholder="GPA (optional)"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-accent-cyan/50"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Save Button ────────────────────────────────────────── */}
          <div className="flex items-center justify-between animate-slide-up" style={{ animationDelay: "300ms" }}>
            <p className="text-xs text-muted">
              <span className="text-accent-coral">*</span> Required: Skills, Work Experience, and Projects must have at least one entry.
            </p>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`rounded-xl px-8 py-3 text-sm font-semibold transition-all duration-200 ${
                saving
                  ? "border border-border bg-surface text-muted cursor-wait"
                  : "bg-gradient-to-r from-accent-cyan to-accent-violet text-background hover:opacity-90 hover:shadow-lg hover:shadow-accent-cyan/20"
              }`}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-muted/30 border-t-muted animate-spin" />
                  Saving...
                </span>
              ) : (
                "Save Profile"
              )}
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
            <div className={`flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-medium shadow-xl backdrop-blur-md ${
              toast.type === "success"
                ? "border-accent-emerald/20 bg-accent-emerald/10 text-accent-emerald"
                : "border-accent-coral/20 bg-accent-coral/10 text-accent-coral"
            }`}>
              {toast.type === "success" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              )}
              {toast.message}
            </div>
          </div>
        )}

        <footer className="mt-16 border-t border-border py-6 text-center">
          <p className="font-[family-name:var(--font-jetbrains-mono)] text-xs text-muted/50">
            InternMatch AI — powered by local embeddings
          </p>
        </footer>
      </main>
    </div>
  );
}
