"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "../lib/supabase";
import { API_URL } from "../lib/api";
import Header from "../components/Header";
import ProfileForm from "../components/ProfileForm";
import EditableResumePreview, { printResumeElement, ResumeData } from "../components/EditableResumePreview";
import { getAccessToken } from "../lib/authToken";
import { downloadResumePdf } from "../lib/downloadResumePdf";
import { themeForTemplate, TEMPLATE_THEMES } from "../lib/templates";

const STEPS = [
  { id: 1, name: "Profile Reference", desc: "Build master resume profile", icon: "👤" },
  { id: 2, name: "Job Details", desc: "Target job requirements", icon: "💼" },
  { id: 3, name: "AI Generation", desc: "Tailoring to fit exactly 1 page", icon: "✨" },
  { id: 4, name: "Export & Polish", desc: "Templates, edits, & assistant", icon: "📄" },
];

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Unified Stepper State
  const [activeStep, setActiveStep] = useState<number>(1);
  const [profileReady, setProfileReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  // Step 2 inputs
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");

  // Step 3 Loader / Cyberpunk state
  const [generationLogs, setGenerationLogs] = useState<string[]>([]);
  const [progressVal, setProgressVal] = useState(0);

  // Step 4 Workspace State
  const [generatedResume, setGeneratedResume] = useState<ResumeData | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState("jakes_resume");
  const [activeTab, setActiveTab] = useState<"templates" | "chat">("templates");
  const [resumeExpanded, setResumeExpanded] = useState(false);

  // AI Assistant Chat State
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    {
      role: "assistant",
      content: "Hello! I am Flamingo, your personal AI resume assistant. I've tailored your resume to fit perfectly on exactly one page. Would you like me to shorten any bullets, emphasize certain skills, or change the tone?",
    },
  ]);
  const [chatMessage, setChatMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync steps from URL query parameter (?step=X)
  useEffect(() => {
    const stepParam = searchParams.get("step");
    if (stepParam) {
      const stepNum = parseInt(stepParam, 10);
      if (stepNum >= 1 && stepNum <= 4) {
        // Only allow step 3/4 if we have job details / resume, else fallback
        if (stepNum === 4 && !generatedResume) {
          setActiveStep(2);
        } else {
          setActiveStep(stepNum);
        }
      }
    }
    const openChat = searchParams.get("chat");
    if (openChat === "1") {
      setActiveTab("chat");
    }
  }, [searchParams, generatedResume]);

  // Load profile state to see if complete
  const loadProfileStatus = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const token = await getAccessToken(supabase);
      if (!token) return;

      const res = await fetch(`${API_URL}/onboarding/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProfileReady(!!data.ready);
        // If not ready and activeStep is 2/3/4, force to step 1
        if (!data.ready) {
          setActiveStep(1);
        } else if (activeStep === 1 && !searchParams.get("step")) {
          // If profile is ready, auto-advance to step 2 on initial load
          setActiveStep(2);
        }
      }
    } catch (err) {
      console.error("Failed to load profile status", err);
    } finally {
      setProfileLoading(false);
    }
  }, [supabase, activeStep, searchParams]);

  useEffect(() => {
    loadProfileStatus();
  }, []);

  // Step 3: Trigger backend tailor generation
  const handleGenerate = async () => {
    if (!jobTitle || !company || !jobDescription) {
      setToastMessage("Please fill in Job Title, Company, and Job Description!");
      return;
    }

    setActiveStep(3);
    setProgressVal(10);
    setGenerationLogs(["[START] Booting Flamingo.ai Tailor Engine...", "[INFO] Analyzing job description parameters..."]);

    const logsList = [
      "[INFO] Correlating target job requirements with master profile...",
      "[PROCESS] Generating job-specific tailored professional summary statement...",
      "[PROCESS] Dynamically ranking work experiences and projects based on relevance...",
      "[PROCESS] Optimizing bullet points: adding action verbs and matching target keywords...",
      "[PROCESS] Fitting resume layouts under single-page constraints (8.5\" x 11\" bounds)...",
      "[SUCCESS] Synthesized tailored single-page layout perfectly!",
    ];

    let currentLogIndex = 0;
    const logInterval = setInterval(() => {
      if (currentLogIndex < logsList.length) {
        setGenerationLogs((prev) => [...prev, logsList[currentLogIndex]]);
        setProgressVal((prev) => Math.min(prev + 12, 90));
        currentLogIndex++;
      }
    }, 1200);

    try {
      const token = await getAccessToken(supabase);
      if (!token) throw new Error("Auth token invalid");

      const response = await fetch(`${API_URL}/tailor/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          job_title: jobTitle,
          company: company,
          job_description: jobDescription,
          job_url: jobUrl,
        }),
      });

      if (!response.ok) {
        const errObj = await response.json();
        throw new Error(errObj.detail || "Tailoring failed");
      }

      const resData = await response.json();
      clearInterval(logInterval);
      setProgressVal(100);
      setGenerationLogs((prev) => [...prev, "[SUCCESS] Unified resume JSON generated! Loading workspace..."]);

      setTimeout(() => {
        setGeneratedResume(resData.tailored);
        setActiveStep(4);
        setActiveTab("templates");
      }, 1000);
    } catch (err: any) {
      clearInterval(logInterval);
      setProgressVal(0);
      setGenerationLogs((prev) => [...prev, `[ERROR] Tailoring failed: ${err.message || err}`]);
      setToastMessage(`Error: ${err.message || "Failed to generate resume"}`);
      setTimeout(() => {
        setActiveStep(2);
      }, 3000);
    }
  };

  // AI Assistant message handler
  const handleSendMessage = async (customMsg?: string) => {
    const textToSend = customMsg || chatMessage;
    if (!textToSend.trim() || !generatedResume) return;

    if (!customMsg) setChatMessage("");

    const newHistory: Array<{ role: "user" | "assistant"; content: string }> = [
      ...chatHistory,
      { role: "user" as const, content: textToSend },
    ];
    setChatHistory(newHistory);
    setChatLoading(true);

    try {
      const token = await getAccessToken(supabase);
      if (!token) throw new Error("Auth token invalid");

      const response = await fetch(`${API_URL}/tailor/assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_draft: generatedResume,
          message: textToSend,
          job_title: jobTitle,
          company: company,
          history: chatHistory.slice(-6),
        }),
      });

      if (!response.ok) {
        throw new Error("Assistant response failed");
      }

      const resData = await response.json();
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", content: resData.reply || "I updated your draft successfully." },
      ]);

      if (resData.tailored) {
        setGeneratedResume(resData.tailored);
      }
    } catch (err: any) {
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", content: "Apologies, I encountered an issue modifying your resume. Please try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Live Inline Editing Sync
  const handleResumeChange = (newData: ResumeData) => {
    setGeneratedResume(newData);
  };

  // Download PDF Action
  const handleDownloadPdf = async () => {
    try {
      setToastMessage("Generating high-fidelity PDF document...");
      await downloadResumePdf("resume-print-area", `${company.replace(/\s+/g, "_")}_Resume.pdf`);
      setToastMessage("Resume downloaded successfully!");
    } catch (err) {
      console.error(err);
      setToastMessage("Failed to generate PDF. Trying direct browser print...");
      printResumeElement("resume-print-area");
    }
  };

  // Toast effect
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  if (profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-4 border-accent-cyan/20 border-t-accent-cyan animate-spin" />
          <p className="font-[family-name:var(--font-jetbrains-mono)] text-sm text-muted">
            Synchronizing Flamingo workspace...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-16">
      {/* Background orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 left-[15%] h-[500px] w-[500px] rounded-full bg-accent-cyan/10 blur-[120px] animate-pulse" />
        <div className="absolute top-[40%] -right-20 h-[420px] w-[420px] rounded-full bg-accent-violet/10 blur-[100px]" />
      </div>

      <Header />

      <main className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stepper Header */}
        <section className="mb-10 animate-slide-up">
          <div className="mx-auto max-w-4xl">
            <div className="flex items-center justify-between">
              {STEPS.map((step, idx) => {
                const isActive = activeStep === step.id;
                const isCompleted = activeStep > step.id || (step.id === 1 && profileReady);
                return (
                  <div key={step.id} className="flex flex-1 items-center">
                    <div className="flex flex-col items-center gap-2 relative z-10">
                      <button
                        onClick={() => {
                          if (step.id === 1 || (step.id === 2 && profileReady) || (step.id === 4 && generatedResume)) {
                            setActiveStep(step.id);
                          }
                        }}
                        disabled={step.id === 3 || (step.id === 4 && !generatedResume) || (step.id === 2 && !profileReady)}
                        className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-300
                          ${isActive
                            ? "border-accent-cyan bg-accent-cyan/20 text-accent-cyan shadow-[0_0_15px_rgba(0,184,148,0.3)] scale-110"
                            : isCompleted
                            ? "border-accent-emerald bg-accent-emerald/10 text-accent-emerald"
                            : "border-border bg-surface text-muted hover:border-muted-foreground"
                          }`}
                      >
                        <span className="text-lg">{isCompleted ? "✓" : step.icon}</span>
                      </button>
                      <div className="text-center">
                        <p className={`text-xs font-semibold tracking-tight transition-colors duration-300
                          ${isActive ? "text-accent-cyan" : "text-muted"}`}
                        >
                          {step.name}
                        </p>
                      </div>
                    </div>

                    {idx < STEPS.length - 1 && (
                      <div className="relative flex-1 h-0.5 mx-4 bg-border overflow-hidden">
                        <div
                          className={`absolute inset-0 bg-gradient-to-r from-accent-cyan to-accent-violet transition-transform duration-500 origin-left
                            ${activeStep > step.id ? "scale-x-100" : "scale-x-0"}`}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Step 1: Profile form wrapper */}
        {activeStep === 1 && (
          <section className="mx-auto max-w-4xl animate-slide-up">
            <div className="glass-card overflow-hidden">
              <div className="border-b border-border bg-surface-raised px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="font-[family-name:var(--font-syne)] text-xl font-bold tracking-tight text-foreground">
                    Master Reference Profile
                  </h2>
                  <p className="text-xs text-muted">
                    This data serves as the single source of truth. The AI never invents details.
                  </p>
                </div>
                {profileReady && (
                  <span className="flex items-center gap-1 rounded-full border border-accent-emerald/20 bg-accent-emerald/10 px-3 py-1 font-[family-name:var(--font-jetbrains-mono)] text-xs text-accent-emerald">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-emerald" />
                    complete
                  </span>
                )}
              </div>
              <div className="p-6">
                <ProfileForm
                  mode="edit"
                  onComplete={() => {
                    setProfileReady(true);
                    setToastMessage("Master Profile synchronized successfully!");
                    setActiveStep(2);
                  }}
                />
              </div>
            </div>
          </section>
        )}

        {/* Step 2: Job Description and title */}
        {activeStep === 2 && (
          <section className="mx-auto max-w-2xl animate-slide-up">
            <div className="glass-card">
              <div className="border-b border-border bg-surface-raised px-6 py-5">
                <h2 className="font-[family-name:var(--font-syne)] text-xl font-bold tracking-tight text-foreground">
                  Target Job Opportunities
                </h2>
                <p className="text-xs text-muted">
                  Input job characteristics. Flamingo will customize experience relevance, projects, and format.
                </p>
              </div>
              <div className="p-6 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted">Job Title *</label>
                    <input
                      type="text"
                      placeholder="e.g. Senior Frontend Engineer"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-accent-cyan/50"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted">Company Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Google"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-accent-cyan/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Job Link / URL (optional)</label>
                  <input
                    type="url"
                    placeholder="https://careers.google.com/jobs/..."
                    value={jobUrl}
                    onChange={(e) => setJobUrl(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-accent-cyan/50"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Job Description / Requirements *</label>
                  <textarea
                    rows={8}
                    placeholder="Paste the full job requirements, skills, and qualifications here..."
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-muted/40 outline-none focus:border-accent-cyan/50 resize-none"
                  />
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleGenerate}
                    className="w-full rounded-xl bg-gradient-to-r from-accent-cyan to-accent-violet py-3.5 text-sm font-bold text-white shadow-[0_4px_20px_rgba(108,92,231,0.25)] hover:scale-[1.01] hover:shadow-[0_4px_25px_rgba(108,92,231,0.35)] transition-all flex items-center justify-center gap-2"
                  >
                    <span>✨</span> Generate Perfect 1-Page Resume
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Step 3: Cyberpunk AI Tailoring Engine Logs */}
        {activeStep === 3 && (
          <section className="mx-auto max-w-xl animate-slide-up">
            <div className="glass-card border-accent-cyan/30 overflow-hidden">
              <div className="bg-surface-raised px-6 py-5 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-3 w-3 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-cyan opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-accent-cyan"></span>
                  </span>
                  <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold tracking-tight text-foreground">
                    Flamingo Tailoring System
                  </h2>
                </div>
                <span className="font-[family-name:var(--font-jetbrains-mono)] text-xs text-accent-cyan">{progressVal}%</span>
              </div>
              <div className="bg-neutral-950 p-6 font-[family-name:var(--font-jetbrains-mono)] text-xs space-y-2 h-[340px] overflow-y-auto scrollbar-thin scrollbar-thumb-surface text-green-400">
                {generationLogs.filter(Boolean).map((log, i) => {
                  let textClass = "text-green-400";
                  if (log && log.includes("[SUCCESS]")) textClass = "text-accent-cyan font-bold";
                  if (log && log.includes("[ERROR]")) textClass = "text-accent-coral font-bold";
                  if (log && log.includes("[START]")) textClass = "text-accent-violet font-bold";
                  return (
                    <div key={i} className={`flex gap-2 items-start ${textClass}`}>
                      <span className="text-muted/50 select-none">&gt;</span>
                      <span>{log}</span>
                    </div>
                  );
                })}
              </div>
              {/* Progress bar */}
              <div className="h-1.5 w-full bg-surface">
                <div
                  className="h-full bg-gradient-to-r from-accent-cyan to-accent-violet transition-all duration-300"
                  style={{ width: `${progressVal}%` }}
                />
              </div>
            </div>
          </section>
        )}

        {/* Step 4: Resume Workspace (Side-by-side workspace) */}
        {activeStep === 4 && generatedResume && (
          <section className={`animate-slide-up ${resumeExpanded ? '' : 'grid gap-8 lg:grid-cols-12'} items-start`}>
            {/* Left Controller Panel — hidden when expanded */}
            {!resumeExpanded && (
            <div className="lg:col-span-5 flex flex-col gap-6">
              <div className="glass-card overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-border bg-surface-raised">
                  <button
                    onClick={() => setActiveTab("templates")}
                    className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-all flex items-center justify-center gap-1.5
                      ${activeTab === "templates"
                        ? "border-accent-cyan text-accent-cyan bg-accent-cyan/5"
                        : "border-transparent text-muted hover:text-foreground"
                      }`}
                  >
                    🎨 Layout Templates
                  </button>
                  <button
                    onClick={() => setActiveTab("chat")}
                    className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-all flex items-center justify-center gap-1.5
                      ${activeTab === "chat"
                        ? "border-accent-cyan text-accent-cyan bg-accent-cyan/5"
                        : "border-transparent text-muted hover:text-foreground"
                      }`}
                  >
                    🤖 Copilot Chat
                  </button>
                </div>

                <div className="p-6">
                  {/* Templates Selector Content */}
                  {activeTab === "templates" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        {Object.entries(TEMPLATE_THEMES).map(([id, tpl]) => {
                          const isSelected = selectedTemplate === id;
                          return (
                            <button
                              key={id}
                              onClick={() => setSelectedTemplate(id)}
                              className={`glass-card p-3 text-left transition-all hover:scale-[1.02] border flex flex-col gap-1.5
                                ${isSelected
                                  ? "border-accent-cyan bg-accent-cyan/5 shadow-[0_0_12px_rgba(0,184,148,0.15)]"
                                  : "border-border hover:border-muted-foreground"
                                }`}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-3 w-3 rounded-full border border-border"
                                  style={{ backgroundColor: tpl.accent }}
                                />
                                <span className="text-xs font-bold truncate">
                                  {id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                                </span>
                              </div>
                              <p className="text-[10px] text-muted truncate">
                                Style: {tpl.layout} · Font: {tpl.font.split(",")[0].replace(/'/g, "")}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* AI Copilot Chat Content */}
                  {activeTab === "chat" && (
                    <div className="space-y-4">
                      {/* Scrolling conversation messages */}
                      <div className="h-[280px] overflow-y-auto border border-border rounded-xl p-4 bg-surface/30 space-y-3 scrollbar-thin scrollbar-thumb-surface flex flex-col">
                        {chatHistory.map((msg, i) => (
                          <div
                            key={i}
                            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs line-clamp-none
                              ${msg.role === "user"
                                ? "bg-accent-violet text-white self-end rounded-tr-none"
                                : "bg-surface border border-border text-foreground self-start rounded-tl-none"
                              }`}
                          >
                            {msg.content}
                          </div>
                        ))}
                        {chatLoading && (
                          <div className="bg-surface border border-border text-foreground self-start rounded-2xl rounded-tl-none px-4 py-2.5 text-xs flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-accent-cyan animate-bounce" />
                            <span className="h-1.5 w-1.5 rounded-full bg-accent-cyan animate-bounce [animation-delay:0.2s]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-accent-cyan animate-bounce [animation-delay:0.4s]" />
                            <span className="text-muted">Flamingo is writing...</span>
                          </div>
                        )}
                      </div>

                      {/* Chip shortcuts */}
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          "Shorten resume to fit 1 page",
                          "Emphasize technical skills",
                          "Rephrase bullet points to be stronger",
                        ].map((chip) => (
                          <button
                            key={chip}
                            disabled={chatLoading}
                            onClick={() => handleSendMessage(chip)}
                            className="text-[10px] bg-surface-raised border border-border rounded-full px-2.5 py-1 text-muted hover:text-foreground hover:border-muted-foreground transition-all"
                          >
                            ⚡ {chip}
                          </button>
                        ))}
                      </div>

                      {/* Message input */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          disabled={chatLoading}
                          value={chatMessage}
                          onChange={(e) => setChatMessage(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                          placeholder="Ask Flamingo to refine this draft..."
                          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-accent-cyan/50"
                        />
                        <button
                          disabled={chatLoading || !chatMessage.trim()}
                          onClick={() => handleSendMessage()}
                          className="rounded-lg bg-accent-cyan px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons: PDF and Print */}
              <div className="glass-card p-6 flex flex-col gap-3">
                <button
                  onClick={handleDownloadPdf}
                  className="w-full rounded-xl bg-gradient-to-r from-accent-emerald to-accent-cyan py-3.5 text-sm font-bold text-white shadow-[0_4px_15px_rgba(0,184,148,0.2)] hover:scale-[1.01] hover:shadow-[0_4px_20px_rgba(0,184,148,0.3)] transition-all flex items-center justify-center gap-2"
                >
                  📥 Download Letter PDF (1 Page)
                </button>
                <button
                  onClick={() => printResumeElement("resume-print-area")}
                  className="w-full rounded-xl border border-border bg-surface py-3 text-xs font-bold text-foreground hover:bg-surface-raised transition-all flex items-center justify-center gap-2"
                >
                  🖨 Open Print Preview
                </button>
              </div>
            </div>
            )}

            {/* Right Interactive Resume Viewer — full width when expanded */}
            <div className={`${resumeExpanded ? 'w-full' : 'lg:col-span-7'} flex flex-col gap-4 transition-all`}>
              <div className="flex items-center justify-between border border-border bg-surface-raised px-4 py-2.5 rounded-xl text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-accent-coral/25 flex items-center justify-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-coral" />
                  </span>
                  <span className="font-semibold text-muted">Letter Viewport (Fits 1 Page)</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-muted hidden sm:inline">
                    Click text to edit inline
                  </span>
                  <button
                    onClick={() => setResumeExpanded(!resumeExpanded)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all
                      ${resumeExpanded
                        ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/20'
                        : 'border-border bg-surface text-foreground hover:border-accent-cyan hover:text-accent-cyan'
                      }`}
                  >
                    {resumeExpanded ? (
                      <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg> Minimize</>
                    ) : (
                      <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg> Maximize &amp; Edit</>
                    )}
                  </button>
                </div>
              </div>

              {/* Download buttons shown inline when expanded */}
              {resumeExpanded && (
                <div className="flex gap-3">
                  <button
                    onClick={handleDownloadPdf}
                    className="flex-1 rounded-xl bg-gradient-to-r from-accent-emerald to-accent-cyan py-3 text-sm font-bold text-white shadow-[0_4px_15px_rgba(0,184,148,0.2)] hover:scale-[1.005] transition-all flex items-center justify-center gap-2"
                  >
                    📥 Download PDF
                  </button>
                  <button
                    onClick={() => printResumeElement("resume-print-area")}
                    className="rounded-xl border border-border bg-surface px-6 py-3 text-xs font-bold text-foreground hover:bg-surface-raised transition-all flex items-center justify-center gap-2"
                  >
                    🖨 Print
                  </button>
                  <button
                    onClick={() => { setResumeExpanded(false); setActiveTab('chat'); }}
                    className="rounded-xl border border-accent-violet/30 bg-accent-violet/10 px-6 py-3 text-xs font-bold text-accent-violet hover:bg-accent-violet/20 transition-all flex items-center justify-center gap-2"
                  >
                    🤖 AI Assistant
                  </button>
                </div>
              )}

              <div className={`flex justify-center border border-border rounded-2xl overflow-hidden bg-neutral-900/40 shadow-inner ${resumeExpanded ? 'p-8' : 'p-4'}`}>
                <EditableResumePreview
                  data={generatedResume}
                  onChange={handleResumeChange}
                  editable={true}
                  templateId={selectedTemplate}
                  jobTitle={jobTitle}
                />
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Floating notifications */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
          <div className="rounded-xl border border-accent-cyan/20 bg-accent-cyan/10 text-accent-cyan px-5 py-3 text-xs font-bold shadow-lg backdrop-blur-md">
            🔔 {toastMessage}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full border-4 border-accent-cyan/20 border-t-accent-cyan animate-spin" />
            <p className="font-[family-name:var(--font-jetbrains-mono)] text-sm text-muted">
              Loading Flamingo dashboard...
            </p>
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
