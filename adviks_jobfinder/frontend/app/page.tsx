"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createClient } from "./lib/supabase";
import Header from "./components/Header";
import ResumeUpload from "./components/ResumeUpload";
import SkillPills from "./components/SkillPills";
import SearchBar from "./components/SearchBar";
import StatusBar from "./components/StatusBar";
import JobCard, { Job } from "./components/JobCard";
import SkillGapPanel from "./components/SkillGapPanel";

type Stage = "idle" | "uploading" | "scraping" | "embedding" | "ranking" | "done" | "error";

export default function Home() {
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [isUploaded, setIsUploaded] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobCount, setJobCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    const fetchExistingResume = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      try {
        const res = await fetch("http://localhost:8000/resumes", {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.resumes && data.resumes.length > 0) {
            const latest = data.resumes[0];
            setResumeId(latest.id);
            setSkills(JSON.parse(latest.skills || "[]"));
            setIsUploaded(true);
            localStorage.setItem("resume_id", latest.id);
          }
        }
      } catch (e) {
        console.error("Failed to fetch existing resumes", e);
      }
    };
    fetchExistingResume();
  }, [supabase.auth]);

  const [autofillNotice, setAutofillNotice] = useState<string[] | null>(null);

  const handleUploadComplete = useCallback(
    (data: {
      resume_id: string;
      extracted_skills: string[];
      resume_text: string;
      autofilled_profile?: Record<string, string>;
    }) => {
      setResumeId(data.resume_id);
      setSkills(data.extracted_skills);
      setIsUploaded(true);
      localStorage.setItem("resume_id", data.resume_id);

      const filled = data.autofilled_profile
        ? Object.keys(data.autofilled_profile).filter(k => data.autofilled_profile![k])
        : [];
      setAutofillNotice(filled.length ? filled : null);
    },
    []
  );

  const handleReplaceResume = useCallback(() => {
    setResumeId(null);
    setSkills([]);
    setIsUploaded(false);
    setJobs([]);
    setStage("idle");
    setErrorMessage("");
    setAutofillNotice(null);
    localStorage.removeItem("resume_id");
  }, []);

  const handleSearch = useCallback(
    async (location: string) => {
      if (!resumeId) return;

      setIsSearching(true);
      setJobs([]);
      setStage("scraping");
      setErrorMessage("");

      try {
        const res = await fetch("http://localhost:8000/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resume_id: resumeId, location, limit: 20 }),
        });

        if (!res.ok) throw new Error("Search request failed");

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";
        let firstJob = true;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);

              if (data.status && !data.title) {
                if (data.status === "error") {
                  setStage("error");
                  setErrorMessage(data.message || "No jobs found");
                  setIsSearching(false);
                  return;
                }
                setStage(data.status as Stage);
                if (data.count) setJobCount(data.count);
                continue;
              }

              if (data.title) {
                setJobs((prev) => [...prev, data as Job]);
                setStage("done");
                if (firstJob) {
                  firstJob = false;
                  setTimeout(() => {
                    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 100);
                }
              }
            } catch {
              // Skip malformed lines
            }
          }
        }

        setStage("done");
        setIsSearching(false);
      } catch {
        setStage("error");
        setErrorMessage("Connection failed — is the backend running on :8000?");
        setIsSearching(false);
      }
    },
    [resumeId]
  );

  return (
    <div className="relative min-h-screen">
      {/* Animated background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="bg-orb-1 absolute -top-32 left-[15%] h-[500px] w-[500px] rounded-full bg-[#0d1b3e]/60 blur-[120px]" />
        <div className="bg-orb-2 absolute top-[40%] -right-20 h-[420px] w-[420px] rounded-full bg-[#1a0d2e]/50 blur-[100px]" />
        <div className="bg-orb-3 absolute -bottom-20 left-[35%] h-[380px] w-[380px] rounded-full bg-[#06101a]/80 blur-[90px]" />
      </div>

      <Header />

      <main className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Hero — shown until resume is uploaded */}
        {!isUploaded && (
          <section className="mx-auto mb-12 max-w-2xl pt-6 text-center animate-slide-up">
            <div className="animate-hero-float inline-block">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-accent-cyan/10 bg-gradient-to-br from-accent-cyan/20 to-accent-violet/20">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent-cyan">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
            </div>
            <h1 className="font-[family-name:var(--font-syne)] text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Find Your Perfect{" "}
              <span className="bg-gradient-to-r from-accent-cyan via-accent-violet to-accent-cyan bg-[length:200%_auto] bg-clip-text text-transparent">
                Internship
              </span>
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted">
              Upload your resume. Our AI searches the web, ranks matches,
              <br className="hidden sm:block" /> and shows exactly what skills you need.
            </p>
            <div className="mt-6 inline-flex animate-badge-pulse items-center gap-2 rounded-full border border-accent-emerald/20 bg-accent-emerald/5 px-4 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-emerald" />
              <span className="font-[family-name:var(--font-jetbrains-mono)] text-xs text-accent-emerald">
                Powered by local AI — no data leaves your machine
              </span>
            </div>
          </section>
        )}

        {/* Step 1: Upload */}
        <section className="mx-auto max-w-xl">
          {!isUploaded ? (
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-cyan/10 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-bold text-accent-cyan">
                1
              </span>
              <h2 className="font-[family-name:var(--font-syne)] text-sm font-semibold text-foreground">
                Upload Resume
              </h2>
            </div>
          ) : (
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-cyan/10 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-bold text-accent-cyan">
                ✓
              </span>
              <h2 className="font-[family-name:var(--font-syne)] text-sm font-semibold text-foreground">
                Active Resume
              </h2>
            </div>
          )}

          <ResumeUpload
            onUploadComplete={handleUploadComplete}
            onReplace={handleReplaceResume}
            isUploaded={isUploaded}
          />

          {autofillNotice && autofillNotice.length > 0 && (
            <div className="mt-3 rounded-lg border border-accent-cyan/20 bg-accent-cyan/5 px-4 py-3 text-xs text-accent-cyan animate-slide-up">
              We pre-filled your profile from this resume:{" "}
              <span className="font-medium">{autofillNotice.join(", ")}</span>.{" "}
              <a href="/profile" className="underline hover:text-accent-cyan/80">
                Review in Profile →
              </a>
            </div>
          )}

          {skills.length > 0 && (
            <div className="mt-4 animate-slide-up">
              <p className="mb-2 text-xs font-medium text-muted">Detected skills</p>
              <SkillPills skills={skills} />
            </div>
          )}
        </section>

        {/* Step 2: Search */}
        {isUploaded && (
          <section className="mx-auto mt-8 max-w-xl animate-slide-up">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-violet/10 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-bold text-accent-violet">
                2
              </span>
              <h2 className="font-[family-name:var(--font-syne)] text-sm font-semibold text-foreground">
                Search Internships
              </h2>
            </div>
            <SearchBar onSearch={handleSearch} isSearching={isSearching} disabled={!isUploaded} />
          </section>
        )}

        {/* Status */}
        {stage !== "idle" && (
          <section className="mx-auto mt-6 max-w-xl">
            <StatusBar stage={stage} jobCount={jobCount} errorMessage={errorMessage} />
          </section>
        )}

        {/* Results */}
        {(jobs.length > 0 || (isSearching && stage !== "error")) && (
          <section ref={resultsRef} className="mt-10">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold text-foreground">
                Results
                {jobs.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted">
                    {jobs.length} internships found
                  </span>
                )}
              </h2>
            </div>

            <div className="flex flex-col gap-6 lg:flex-row">
              {/* Job cards — 65% */}
              <div className="flex-1 space-y-4 lg:w-[65%]">
                {jobs.length === 0 && isSearching ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="glass-card animate-pulse p-5">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-2">
                            <div className="h-4 w-3/4 rounded bg-surface-raised" />
                            <div className="h-3 w-1/2 rounded bg-surface-raised" />
                          </div>
                          <div className="h-10 w-10 rounded bg-surface-raised" />
                        </div>
                        <div className="mt-3 h-1.5 w-full rounded-full bg-surface-raised" />
                        <div className="mt-4 flex gap-2">
                          <div className="h-5 w-14 rounded bg-surface-raised" />
                          <div className="h-5 w-16 rounded bg-surface-raised" />
                          <div className="h-5 w-12 rounded bg-surface-raised" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  jobs.map((job, i) => (
                    <JobCard key={`${job.title}-${job.company}-${i}`} job={job} index={i} resumeId={resumeId} />
                  ))
                )}
              </div>

              {/* Skill gap panel — 35% */}
              <div className="lg:w-[35%]">
                <div className="lg:sticky lg:top-8">
                  <SkillGapPanel jobs={jobs} />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-16 border-t border-border py-6 text-center">
          <p className="font-[family-name:var(--font-jetbrains-mono)] text-xs text-muted/50">
            InternMatch AI — powered by local embeddings
          </p>
        </footer>
      </main>
    </div>
  );
}
