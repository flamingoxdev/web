"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase";
import Header from "../../components/Header";

import { API_URL } from "../../lib/api";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

type FlowStage = "loading" | "tailoring" | "review" | "consent" | "submitting" | "done" | "error";

export default function ApplyPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Job data (passed via query params or localStorage)
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [resumeId, setResumeId] = useState("");

  // Flow state
  const [stage, setStage] = useState<FlowStage>("loading");
  const [template, setTemplate] = useState<Record<string, unknown> | null>(null);
  const [tailored, setTailored] = useState<Record<string, unknown> | null>(null);
  const [editableTailored, setEditableTailored] = useState<Record<string, unknown> | null>(null);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);

  // Consent
  const [consent, setConsent] = useState(false);

  // Error handling
  const [errorMessage, setErrorMessage] = useState("");

  // Auto-fill result
  const [autofillResult, setAutofillResult] = useState<Record<string, unknown> | null>(null);

  // Editing mode
  const [editingSection, setEditingSection] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  }, [supabase.auth]);

  // Load job data from localStorage on mount
  useEffect(() => {
    const jobData = localStorage.getItem("apply_job_data");
    if (jobData) {
      try {
        const parsed = JSON.parse(jobData);
        setJobTitle(parsed.job_title || "");
        setCompany(parsed.company || "");
        setJobDescription(parsed.job_description || "");
        setJobUrl(parsed.job_url || "");
        setResumeId(parsed.resume_id || localStorage.getItem("resume_id") || "");
      } catch {
        console.error("Failed to parse job data");
      }
    }

    const rid = localStorage.getItem("resume_id");
    if (rid && !resumeId) setResumeId(rid);
  }, [params, resumeId]);

  // Start tailoring once job data is loaded
  useEffect(() => {
    if (jobTitle && resumeId && stage === "loading") {
      generateTailoredResume();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobTitle, resumeId, stage]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const generateTailoredResume = async () => {
    setStage("tailoring");
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/tailor/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resume_id: resumeId,
          job_title: jobTitle,
          company,
          job_description: jobDescription,
          job_url: jobUrl,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Tailoring failed");
      }
      
      const data = await res.json();

      if (data.tailored?.error) throw new Error(data.tailored.error);

      setTemplate(data.template);
      setTailored(data.tailored);
      setEditableTailored(JSON.parse(JSON.stringify(data.tailored)));
      setStage("review");
      setMessages([
        {
          role: "system",
          content: `✨ Resume tailored for **${jobTitle}** at **${company}**. Review below and suggest changes in the chat.`,
        },
      ]);
    } catch (e: any) {
      console.error("Tailor error:", e);
      setErrorMessage(e.message || "An unknown error occurred");
      setStage("error");
    }
  };

  const handleChatSend = async () => {
    if (!chatInput.trim() || isRefining) return;
    const feedback = chatInput.trim();
    setChatInput("");

    setMessages(prev => [...prev, { role: "user", content: feedback }]);
    setIsRefining(true);

    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/tailor/refine`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_draft: editableTailored,
          feedback,
          job_title: jobTitle,
          company,
        }),
      });

      if (!res.ok) throw new Error("Refine failed");
      const data = await res.json();

      setEditableTailored(data.tailored);
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "✅ Resume updated based on your feedback. Review the changes above." },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "❌ Failed to apply changes. Please try again." },
      ]);
    } finally {
      setIsRefining(false);
    }
  };

  const handleApprove = () => {
    setStage("consent");
  };

  const handleSubmit = async () => {
    if (!consent) return;
    setStage("submitting");

    try {
      const token = await getToken();

      // Save the approved tailored resume
      await fetch(`${API_URL}/apply/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resume_id: resumeId,
          job_title: jobTitle,
          company,
          job_url: jobUrl,
          tailored_data: editableTailored,
        }),
      });

      // Launch auto-fill
      const res = await fetch(`${API_URL}/apply/autofill`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          job_url: jobUrl,
          resume_id: resumeId,
          tailored_data: editableTailored,
        }),
      });

      const result = await res.json();
      setAutofillResult(result);
      setStage("done");
    } catch {
      setStage("error");
    }
  };

  const handleEditField = (section: string, value: unknown) => {
    if (!editableTailored) return;
    setEditableTailored(prev => prev ? { ...prev, [section]: value } : null);
  };

  return (
    <div className="relative min-h-screen">
      {/* Animated background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="bg-orb-1 absolute -top-32 left-[15%] h-[500px] w-[500px] rounded-full bg-[#fc5c7d]/20 blur-[120px]" />
        <div className="bg-orb-2 absolute top-[40%] -right-20 h-[420px] w-[420px] rounded-full bg-[#f77062]/15 blur-[100px]" />
      </div>

      <Header />

      <main className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="mb-6 animate-slide-up">
          <button onClick={() => router.back()} className="mb-3 flex items-center gap-1 text-sm text-muted hover:text-foreground transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight text-foreground">
            Auto Apply: <span className="text-accent-cyan">{jobTitle}</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            at {company} {jobUrl && <span className="text-muted/50">• {new URL(jobUrl).hostname}</span>}
          </p>
        </div>

        {/* Progress steps */}
        <div className="mb-8 flex items-center gap-3 animate-slide-up" style={{ animationDelay: "60ms" }}>
          {["Tailoring", "Review & Edit", "Consent", "Submit"].map((step, i) => {
            const stageOrder = ["tailoring", "review", "consent", "submitting"];
            const currentIdx = stageOrder.indexOf(stage === "done" ? "submitting" : stage);
            const isActive = i === currentIdx;
            const isDone = i < currentIdx || stage === "done";

            return (
              <div key={step} className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                    isDone
                      ? "bg-accent-emerald/20 text-accent-emerald"
                      : isActive
                        ? "bg-accent-cyan/20 text-accent-cyan step-active"
                        : "bg-surface-raised text-muted"
                  }`}>
                    {isDone ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className={`text-xs font-medium ${isActive ? "text-foreground" : "text-muted"}`}>{step}</span>
                </div>
                {i < 3 && <div className={`h-px w-8 ${isDone ? "bg-accent-emerald/30" : "bg-border"}`} />}
              </div>
            );
          })}
        </div>

        {/* ── Loading / Tailoring State ──────────────────────────── */}
        {(stage === "loading" || stage === "tailoring") && (
          <div className="flex flex-col items-center justify-center py-20 animate-slide-up">
            <div className="animated-border rounded-2xl p-8">
              <div className="flex flex-col items-center gap-4">
                <div className="h-12 w-12 rounded-full border-2 border-accent-cyan/30 border-t-accent-cyan animate-spin" />
                <p className="font-[family-name:var(--font-syne)] text-lg font-semibold text-foreground">
                  {stage === "loading" ? "Preparing..." : "AI is tailoring your resume..."}
                </p>
                <p className="text-sm text-muted text-center max-w-sm">
                  Analyzing job requirements, searching for the best template, and crafting a personalized resume for you.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Review State ───────────────────────────────────────── */}
        {stage === "review" && editableTailored && (
          <div className="flex flex-col gap-6 lg:flex-row animate-slide-up">
            {/* Left: Tailored Resume */}
            <div className="flex-1 space-y-4 lg:w-[60%]">
              {/* Template info */}
              {template && (
                <div className="glass-card p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-violet">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    Template: <span className="text-accent-violet font-medium">{(template as Record<string, unknown>).template_name as string}</span>
                    <span className="mx-1">•</span>
                    Format: <span className="text-foreground/70">{(template as Record<string, unknown>).format as string}</span>
                    <span className="mx-1">•</span>
                    Tone: <span className="text-foreground/70">{(template as Record<string, unknown>).tone as string}</span>
                  </div>
                  {Boolean((editableTailored as Record<string, unknown>)?._grounding) && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-accent-emerald">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M9 12l2 2 4-4" />
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                      Grounded: nothing invented. All facts come from your profile and resume.
                    </p>
                  )}
                </div>
              )}

              {/* Summary */}
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-[family-name:var(--font-syne)] text-sm font-semibold text-foreground">Professional Summary</h3>
                  <button
                    onClick={() => setEditingSection(editingSection === "summary" ? null : "summary")}
                    className="text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors"
                  >
                    {editingSection === "summary" ? "Done" : "Edit"}
                  </button>
                </div>
                {editingSection === "summary" ? (
                  <textarea
                    value={editableTailored.summary as string || ""}
                    onChange={e => handleEditField("summary", e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-accent-cyan/30 bg-surface px-3 py-2 text-sm text-foreground outline-none resize-none"
                  />
                ) : (
                  <p className="text-sm leading-relaxed text-foreground/80">{editableTailored.summary as string}</p>
                )}
              </div>

              {/* Skills */}
              {editableTailored.skills && (
                <div className="glass-card p-5">
                  <h3 className="mb-3 font-[family-name:var(--font-syne)] text-sm font-semibold text-foreground">Skills</h3>
                  <div className="space-y-2">
                    {(editableTailored.skills as Record<string, string[]>).technical && (
                      <div>
                        <span className="text-xs text-muted">Technical:</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {((editableTailored.skills as Record<string, string[]>).technical || []).map((s: string, i: number) => (
                            <span key={i} className="rounded-full border border-accent-cyan/20 bg-accent-cyan/8 px-2.5 py-0.5 text-xs text-accent-cyan">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {(editableTailored.skills as Record<string, string[]>).soft && (
                      <div>
                        <span className="text-xs text-muted">Soft:</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {((editableTailored.skills as Record<string, string[]>).soft || []).map((s: string, i: number) => (
                            <span key={i} className="rounded-full border border-accent-violet/20 bg-accent-violet/8 px-2.5 py-0.5 text-xs text-accent-violet">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Work Experience */}
              {Array.isArray(editableTailored.work_experience) && (
                <div className="glass-card p-5">
                  <h3 className="mb-3 font-[family-name:var(--font-syne)] text-sm font-semibold text-foreground">Work Experience</h3>
                  <div className="space-y-4">
                    {(editableTailored.work_experience as Array<Record<string, unknown>>).map((w, i) => (
                      <div key={i} className="rounded-lg border border-border bg-surface/40 p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{w.title as string}</p>
                            <p className="text-xs text-muted">{w.company as string} • {w.duration as string}</p>
                          </div>
                        </div>
                        {Array.isArray(w.bullets) && (
                          <ul className="mt-2 space-y-1">
                            {(w.bullets as string[]).map((b, j) => (
                              <li key={j} className="flex gap-2 text-xs text-foreground/70">
                                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent-cyan/40" />
                                {b}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Projects */}
              {Array.isArray(editableTailored.projects) && (
                <div className="glass-card p-5">
                  <h3 className="mb-3 font-[family-name:var(--font-syne)] text-sm font-semibold text-foreground">Projects</h3>
                  <div className="space-y-3">
                    {(editableTailored.projects as Array<Record<string, unknown>>).map((p, i) => (
                      <div key={i} className="rounded-lg border border-border bg-surface/40 p-4">
                        <p className="text-sm font-semibold text-foreground">{p.name as string}</p>
                        <p className="mt-1 text-xs text-foreground/70">{p.description as string}</p>
                        {Array.isArray(p.technologies) && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {(p.technologies as string[]).map((t, j) => (
                              <span key={j} className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-muted">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cover Letter */}
              {editableTailored.cover_letter_draft && (
                <div className="glass-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-[family-name:var(--font-syne)] text-sm font-semibold text-foreground">Cover Letter Draft</h3>
                    <button
                      onClick={() => setEditingSection(editingSection === "cover" ? null : "cover")}
                      className="text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors"
                    >
                      {editingSection === "cover" ? "Done" : "Edit"}
                    </button>
                  </div>
                  {editingSection === "cover" ? (
                    <textarea
                      value={editableTailored.cover_letter_draft as string}
                      onChange={e => handleEditField("cover_letter_draft", e.target.value)}
                      rows={8}
                      className="w-full rounded-lg border border-accent-cyan/30 bg-surface px-3 py-2 text-sm text-foreground outline-none resize-none"
                    />
                  ) : (
                    <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
                      {editableTailored.cover_letter_draft as string}
                    </p>
                  )}
                </div>
              )}

              {/* Approve button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleApprove}
                  className="rounded-xl bg-gradient-to-r from-accent-emerald to-accent-cyan px-8 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  ✓ Approve & Continue
                </button>
                <button
                  onClick={generateTailoredResume}
                  className="rounded-xl border border-border bg-surface-raised px-6 py-3 text-sm font-medium text-muted hover:text-foreground transition-colors"
                >
                  Regenerate
                </button>
              </div>
            </div>

            {/* Right: Chat panel */}
            <div className="lg:w-[40%]">
              <div className="lg:sticky lg:top-8">
                <div className="glass-card flex flex-col" style={{ height: "calc(100vh - 220px)", minHeight: "400px" }}>
                  {/* Chat header */}
                  <div className="border-b border-border px-5 py-4">
                    <h3 className="font-[family-name:var(--font-syne)] text-sm font-semibold text-foreground flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-violet">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      Suggestions
                    </h3>
                    <p className="text-xs text-muted mt-1">Tell the AI how to improve your resume</p>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {messages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-xl px-4 py-2.5 text-xs leading-relaxed ${
                            msg.role === "user"
                              ? "bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20"
                              : msg.role === "system"
                                ? "bg-accent-violet/10 text-foreground/80 border border-accent-violet/20"
                                : "bg-surface-raised text-foreground/80 border border-border"
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {isRefining && (
                      <div className="flex justify-start">
                        <div className="rounded-xl bg-surface-raised border border-border px-4 py-3">
                          <div className="flex items-center gap-2 text-xs text-muted">
                            <div className="h-3 w-3 rounded-full border border-muted/30 border-t-muted animate-spin" />
                            Refining your resume...
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Chat input */}
                  <div className="border-t border-border px-4 py-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleChatSend()}
                        placeholder="e.g., Make the summary more impactful"
                        disabled={isRefining}
                        className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted/40 outline-none focus:border-accent-violet/50 disabled:opacity-50"
                      />
                      <button
                        onClick={handleChatSend}
                        disabled={!chatInput.trim() || isRefining}
                        className="rounded-lg bg-accent-violet/10 border border-accent-violet/20 px-3 py-2 text-xs font-medium text-accent-violet transition-colors hover:bg-accent-violet/20 disabled:opacity-40"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Consent State ──────────────────────────────────────── */}
        {stage === "consent" && (
          <div className="mx-auto max-w-lg animate-slide-up">
            <div className="glass-card p-8">
              <div className="mb-6 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-amber/10 border border-accent-amber/20">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-amber">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <h2 className="font-[family-name:var(--font-syne)] text-xl font-bold text-foreground">
                  Confirm Submission
                </h2>
                <p className="mt-2 text-sm text-muted">
                  Review and consent before auto-applying
                </p>
              </div>

              <div className="space-y-4 mb-6">
                <div className="rounded-lg border border-border bg-surface/40 p-4">
                  <p className="text-xs text-muted">Position</p>
                  <p className="text-sm font-medium text-foreground">{jobTitle} at {company}</p>
                </div>
                <div className="rounded-lg border border-border bg-surface/40 p-4">
                  <p className="text-xs text-muted">Application URL</p>
                  <a href={jobUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-accent-cyan hover:text-accent-cyan/80">
                    {jobUrl}
                  </a>
                </div>
              </div>

              <label className="mb-6 flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={e => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-accent-cyan"
                />
                <span className="text-xs leading-relaxed text-muted">
                  I consent to submit my tailored resume and personal information to this job posting.
                  I understand that Flamingo.ai will open a browser and attempt to auto-fill the application form.
                  I will review the form before final submission.
                </span>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={() => setStage("review")}
                  className="flex-1 rounded-xl border border-border bg-surface-raised px-6 py-3 text-sm font-medium text-muted hover:text-foreground transition-colors"
                >
                  Back to Review
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!consent}
                  className="flex-1 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-violet px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Submit Application
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Submitting State ───────────────────────────────────── */}
        {stage === "submitting" && (
          <div className="flex flex-col items-center justify-center py-20 animate-slide-up">
            <div className="animated-border rounded-2xl p-8">
              <div className="flex flex-col items-center gap-4">
                <div className="h-12 w-12 rounded-full border-2 border-accent-violet/30 border-t-accent-violet animate-spin" />
                <p className="font-[family-name:var(--font-syne)] text-lg font-semibold text-foreground">
                  Auto-filling application...
                </p>
                <p className="text-sm text-muted text-center max-w-sm">
                  A browser window will open. Review the filled form and submit manually.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Done State ─────────────────────────────────────────── */}
        {stage === "done" && (
          <div className="mx-auto max-w-lg animate-slide-up">
            <div className="glass-card p-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-emerald/10 border border-accent-emerald/20">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent-emerald">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h2 className="font-[family-name:var(--font-syne)] text-xl font-bold text-foreground">
                Application Processed!
              </h2>
              {autofillResult && (
                <div className="mt-4 rounded-lg border border-border bg-surface/40 p-4 text-left">
                  <p className="text-sm text-foreground">{autofillResult.message as string}</p>
                  {Array.isArray(autofillResult.fields_filled) && (autofillResult.fields_filled as string[]).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(autofillResult.fields_filled as string[]).map((f, i) => (
                        <span key={i} className="rounded bg-accent-emerald/10 px-2 py-0.5 text-xs text-accent-emerald">{f}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={() => router.push("/")}
                  className="rounded-xl border border-border bg-surface-raised px-6 py-2.5 text-sm font-medium text-muted hover:text-foreground transition-colors"
                >
                  Back to Search
                </button>
                <button
                  onClick={() => router.push("/roadmap")}
                  className="rounded-xl bg-gradient-to-r from-accent-cyan to-accent-violet px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  View Roadmap
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Error State ────────────────────────────────────────── */}
        {stage === "error" && (
          <div className="mx-auto max-w-lg animate-slide-up">
            <div className="glass-card p-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-coral/10 border border-accent-coral/20">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-coral">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <h2 className="font-[family-name:var(--font-syne)] text-xl font-bold text-foreground">
                Something went wrong
              </h2>
              <p className="mt-2 text-sm text-muted">
                {errorMessage || "The AI tailoring failed. Make sure Ollama is running and try again."}
              </p>
              <button
                onClick={() => { setStage("loading"); }}
                className="mt-6 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-violet px-8 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
