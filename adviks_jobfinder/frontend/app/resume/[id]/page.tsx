"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "../../components/Header";
import ResumePreview from "../../components/ResumePreview";
import ATSScorePanel from "../../components/ATSScorePanel";
import { API_URL } from "../../lib/api";
import { createClient } from "../../lib/supabase";

type ActiveTab = "preview" | "ats" | "optimize";

interface TailoredResume {
  contact?: object;
  summary?: string;
  skills?: { technical?: string[]; soft?: string[] };
  work_experience?: object[];
  projects?: object[];
  education?: object[];
}

export default function ResumeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const resumeId = params?.id as string;

  const [activeTab, setActiveTab] = useState<ActiveTab>("preview");

  // Resume data
  const [resumeSkills, setResumeSkills] = useState<string[]>([]);
  const [resumeText, setResumeText] = useState("");

  // Profile (for preview)
  const [profileData, setProfileData] = useState<TailoredResume | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // ATS
  const [atsReport, setAtsReport] = useState<object | null>(null);
  const [loadingAts, setLoadingAts] = useState(false);

  // Optimize
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [tailored, setTailored] = useState<TailoredResume | null>(null);
  const [loadingTailor, setLoadingTailor] = useState(false);
  const [tailorError, setTailorError] = useState("");

  const getHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  };

  // Load resume + profile on mount
  useEffect(() => {
    if (!resumeId) return;
    const load = async () => {
      setLoadingProfile(true);
      try {
        const headers = await getHeaders();
        // Load profile for preview
        const pRes = await fetch(`${API_URL}/profile`, { headers });
        if (pRes.ok) {
          const pData = await pRes.json();
          const p = pData.profile || {};
          // Parse JSON fields
          for (const f of ["personal_info", "skills", "work_experience", "projects", "education"]) {
            if (typeof p[f] === "string") {
              try { p[f] = JSON.parse(p[f]); } catch { /* ignore */ }
            }
          }
          const pi = p.personal_info || {};
          setProfileData({
            contact: {
              name: p.full_name || pi.full_name || "",
              email: p.email || pi.email || "",
              phone: p.phone || pi.phone || "",
              location: p.location || pi.location || "",
              linkedin: p.linkedin || pi.linkedin || "",
              github: p.github || pi.github || "",
            },
            summary: "",
            skills: {
              technical: Array.isArray(p.skills) ? p.skills.filter((_: unknown, i: number) => i < 16) : [],
              soft: [],
            },
            work_experience: Array.isArray(p.work_experience) ? p.work_experience : [],
            projects: Array.isArray(p.projects) ? p.projects : [],
            education: Array.isArray(p.education) ? p.education : [],
          });
        }
        // Load skills from resume
        const rRes = await fetch(`${API_URL}/resumes`, { headers });
        if (rRes.ok) {
          const rData = await rRes.json();
          const found = (rData.resumes || []).find((r: { id: string }) => r.id === resumeId);
          if (found) {
            const s = typeof found.skills === "string" ? JSON.parse(found.skills) : found.skills || [];
            setResumeSkills(s);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingProfile(false);
      }
    };
    load();
  }, [resumeId]);

  // Fetch ATS when tab is opened
  useEffect(() => {
    if (activeTab !== "ats" || atsReport) return;
    const fetchAts = async () => {
      setLoadingAts(true);
      try {
        const headers = await getHeaders();
        const res = await fetch(`${API_URL}/resume/analyze`, {
          method: "POST",
          headers,
          body: JSON.stringify({ resume_id: resumeId }),
        });
        if (res.ok) {
          const data = await res.json();
          setAtsReport(data.report);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingAts(false);
      }
    };
    fetchAts();
  }, [activeTab, resumeId, atsReport]);

  const handleTailor = async () => {
    if (!jobTitle) { setTailorError("Please enter a job title"); return; }
    setLoadingTailor(true);
    setTailorError("");
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_URL}/tailor/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          resume_id: resumeId,
          job_title: jobTitle,
          company,
          job_description: jobDescription,
          job_url: jobUrl,
        }),
      });
      if (!res.ok) throw new Error("Tailoring failed");
      const data = await res.json();
      setTailored(data.tailored);
    } catch (e: unknown) {
      setTailorError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingTailor(false);
    }
  };

  const displayData: TailoredResume = tailored || profileData || {};

  const TABS: { id: ActiveTab; label: string; icon: string }[] = [
    { id: "preview",  label: "Preview",      icon: "👁️" },
    { id: "ats",      label: "ATS Score",     icon: "📊" },
    { id: "optimize", label: "Optimize",      icon: "🎯" },
  ];

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="bg-orb-1 absolute -top-24 left-[10%] h-[420px] w-[420px] rounded-full bg-[#fc5c7d]/12 blur-[110px]" />
        <div className="bg-orb-2 absolute top-[40%] right-0 h-[360px] w-[360px] rounded-full bg-[#f77062]/10 blur-[100px]" />
      </div>

      <Header />

      <main className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Page header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button
              onClick={() => router.push("/resume")}
              className="mb-2 flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
            >
              ← Back to Resume Hub
            </button>
            <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold">
              Resume
              <span className="ml-2 font-mono text-sm font-normal text-muted">#{resumeId}</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {resumeSkills.slice(0, 3).map(s => (
              <span key={s} className="hidden sm:inline-flex rounded-full bg-accent-cyan/8 border border-accent-cyan/15 px-2.5 py-0.5 text-xs text-accent-cyan">
                {s}
              </span>
            ))}
            {resumeSkills.length > 3 && (
              <span className="hidden sm:inline-flex rounded-full bg-surface-raised border border-border px-2.5 py-0.5 text-xs text-muted">
                +{resumeSkills.length - 3} skills
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex border-b border-border overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-accent-cyan text-accent-cyan"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Preview tab ───────────────────────────────────────────────── */}
        {activeTab === "preview" && (
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="flex-1 overflow-auto">
              {loadingProfile ? (
                <div className="glass-card h-[600px] animate-pulse" />
              ) : (
                <div className="overflow-hidden rounded-xl shadow-xl">
                  <ResumePreview data={displayData} />
                </div>
              )}
            </div>
            <div className="lg:w-72 space-y-4 shrink-0">
              {tailored && (
                <div className="glass-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-2 w-2 rounded-full bg-accent-emerald" />
                    <span className="text-xs font-semibold text-accent-emerald">Tailored Version Active</span>
                  </div>
                  <p className="text-xs text-muted">
                    Showing AI-optimized version for <strong>{jobTitle}</strong>
                    {company ? ` at ${company}` : ""}.
                  </p>
                  <button
                    onClick={() => setTailored(null)}
                    className="mt-3 text-xs text-muted hover:text-foreground transition-colors"
                  >
                    Show original →
                  </button>
                </div>
              )}
              <div className="glass-card p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Quick Actions</p>
                <button onClick={() => setActiveTab("ats")} className="w-full text-left flex items-center gap-2 rounded-lg border border-border p-3 text-xs hover:border-accent-cyan/30 hover:bg-accent-cyan/5 transition-all">
                  <span>📊</span> Check ATS Score
                </button>
                <button onClick={() => setActiveTab("optimize")} className="w-full text-left flex items-center gap-2 rounded-lg border border-border p-3 text-xs hover:border-accent-violet/30 hover:bg-accent-violet/5 transition-all">
                  <span>🎯</span> Optimize for a Job
                </button>
                <button
                  onClick={() => window.print()}
                  className="w-full text-left flex items-center gap-2 rounded-lg border border-border p-3 text-xs hover:border-accent-emerald/30 hover:bg-accent-emerald/5 transition-all"
                >
                  <span>🖨️</span> Print / Save PDF
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── ATS tab ───────────────────────────────────────────────────── */}
        {activeTab === "ats" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <ATSScorePanel report={atsReport as Parameters<typeof ATSScorePanel>[0]["report"]} isLoading={loadingAts} />
            </div>
            <div className="glass-card p-6">
              <h3 className="font-[family-name:var(--font-syne)] text-sm font-bold mb-4">Resume Preview</h3>
              {loadingProfile ? (
                <div className="h-80 animate-pulse bg-surface-raised rounded-lg" />
              ) : (
                <div className="overflow-auto max-h-[600px] rounded-lg border border-border">
                  <ResumePreview data={displayData} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Optimize tab ─────────────────────────────────────────────── */}
        {activeTab === "optimize" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="glass-card p-6">
                <h3 className="font-[family-name:var(--font-syne)] text-sm font-bold mb-4">Target Job Details</h3>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">Job Title *</label>
                    <input
                      value={jobTitle}
                      onChange={e => setJobTitle(e.target.value)}
                      placeholder="e.g. Software Engineering Intern"
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-accent-cyan/40 focus:outline-none focus:ring-1 focus:ring-accent-cyan/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">Company</label>
                    <input
                      value={company}
                      onChange={e => setCompany(e.target.value)}
                      placeholder="e.g. Google"
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-accent-cyan/40 focus:outline-none focus:ring-1 focus:ring-accent-cyan/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">Job URL</label>
                    <input
                      value={jobUrl}
                      onChange={e => setJobUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-accent-cyan/40 focus:outline-none focus:ring-1 focus:ring-accent-cyan/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">Job Description</label>
                    <textarea
                      value={jobDescription}
                      onChange={e => setJobDescription(e.target.value)}
                      placeholder="Paste the full job description here…"
                      rows={8}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm resize-none focus:border-accent-cyan/40 focus:outline-none focus:ring-1 focus:ring-accent-cyan/20"
                    />
                  </div>
                  <button
                    onClick={handleTailor}
                    disabled={loadingTailor || !jobTitle}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-violet py-3 text-sm font-semibold text-white shadow-lg shadow-accent-cyan/20 transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {loadingTailor ? (
                      <><div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />AI Optimizing…</>
                    ) : "✨ Optimize Resume"}
                  </button>
                  {tailorError && <p className="text-xs text-accent-coral">{tailorError}</p>}
                </div>
              </div>

              {tailored && (
                <div className="glass-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="h-2 w-2 rounded-full bg-accent-emerald animate-pulse" />
                    <span className="text-xs font-semibold text-accent-emerald">Resume Optimized!</span>
                  </div>
                  <p className="text-xs text-muted mb-3">
                    AI has tailored your resume for <strong>{jobTitle}</strong>.
                    Switch to Preview tab to see the result.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setActiveTab("preview")} className="text-xs text-accent-cyan hover:underline">
                      View Preview →
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              {tailored ? (
                <div className="overflow-auto max-h-[700px] rounded-xl border border-border shadow-lg">
                  <ResumePreview data={tailored} />
                </div>
              ) : (
                <div className="glass-card h-full min-h-[400px] flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-4xl mb-3">🎯</div>
                    <p className="text-sm text-muted">Fill in the job details and click<br />"Optimize Resume" to see the tailored version.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
