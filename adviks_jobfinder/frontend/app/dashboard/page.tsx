"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createClient } from "../lib/supabase";
import { API_URL } from "../lib/api";
import Header from "../components/Header";
import ResumeUpload from "../components/ResumeUpload";
import SkillPills from "../components/SkillPills";
import SearchBar, { type JobType } from "../components/SearchBar";
import StatusBar from "../components/StatusBar";
import JobCard, { Job } from "../components/JobCard";
import SkillGapPanel from "../components/SkillGapPanel";

type Stage = "idle" | "uploading" | "scraping" | "embedding" | "ranking" | "done" | "error";
type ApplyMode = "manual" | "auto";

export default function DashboardPage() {
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [isUploaded, setIsUploaded] = useState(false);
  const [applyMode, setApplyMode] = useState<ApplyMode>("auto");
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
        const res = await fetch(`${API_URL}/resumes`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.resumes?.length > 0) {
            const latest = data.resumes[0];
            setResumeId(latest.id);
            const parsed = typeof latest.skills === "string" ? JSON.parse(latest.skills) : latest.skills;
            setSkills(parsed || []);
            setIsUploaded(true);
          }
        }
      } catch (e) {
        console.error("Failed to fetch resumes", e);
      }
    };
    fetchExistingResume();
  }, [supabase.auth]);

  const handleSearch = useCallback(async (location: string, jobType: JobType) => {
    if (!resumeId) return;
    setIsSearching(true);
    setJobs([]);
    setStage("scraping");
    setErrorMessage("");

    try {
      const res = await fetch(`${API_URL}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_id: resumeId, location, limit: 20, job_type: jobType }),
      });
      if (!res.ok) throw new Error("Search failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

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
                setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
              }
            }
          } catch { /* skip */ }
        }
      }
      setStage("done");
      setIsSearching(false);
    } catch {
      setStage("error");
      setErrorMessage("Connection failed — is the backend running on :8000?");
      setIsSearching(false);
    }
  }, [resumeId]);

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="bg-orb-1 absolute -top-32 left-[15%] h-[500px] w-[500px] rounded-full bg-[#fc5c7d]/20 blur-[120px]" />
        <div className="bg-orb-2 absolute top-[40%] -right-20 h-[420px] w-[420px] rounded-full bg-[#f77062]/15 blur-[100px]" />
      </div>

      <Header />

      <main className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="mx-auto mb-10 max-w-2xl text-center animate-slide-up">
          <h1 className="font-[family-name:var(--font-syne)] text-4xl font-bold tracking-tight">
            Find & Apply with{" "}
            <span className="bg-gradient-to-r from-accent-cyan to-accent-violet bg-clip-text text-transparent">
              Flamingo.ai
            </span>
          </h1>
          <p className="mt-3 text-sm text-muted">Choose how you want to apply, then search jobs or internships.</p>
        </section>

        {/* Apply mode */}
        <section className="mx-auto mb-8 max-w-xl glass-card p-5 animate-slide-up">
          <h2 className="mb-3 font-[family-name:var(--font-syne)] text-sm font-semibold">Application mode</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setApplyMode("manual")}
              className={`rounded-xl border px-4 py-4 text-left transition-all ${
                applyMode === "manual"
                  ? "border-accent-cyan bg-accent-cyan/10"
                  : "border-border hover:border-muted"
              }`}
            >
              <p className="text-sm font-semibold text-foreground">Manual apply</p>
              <p className="mt-1 text-xs text-muted">Open job links yourself; we tailor your resume.</p>
            </button>
            <button
              onClick={() => setApplyMode("auto")}
              className={`rounded-xl border px-4 py-4 text-left transition-all ${
                applyMode === "auto"
                  ? "border-accent-violet bg-accent-violet/10"
                  : "border-border hover:border-muted"
              }`}
            >
              <p className="text-sm font-semibold text-foreground">Auto apply</p>
              <p className="mt-1 text-xs text-muted">AI fills forms in a browser using your profile.</p>
            </button>
          </div>
        </section>

        {isUploaded && skills.length > 0 && (
          <section className="mx-auto mb-6 max-w-xl">
            <p className="mb-2 text-xs font-medium text-muted">Your skills</p>
            <SkillPills skills={skills} />
            <p className="mt-2 text-xs text-muted">
              <a href="/profile" className="text-accent-cyan underline">Edit profile</a>
              {" · "}
              Replace resume below
            </p>
            <div className="mt-4">
              <ResumeUpload
                isUploaded={true}
                onUploadComplete={(d) => {
                  setResumeId(d.resume_id);
                  setSkills(d.extracted_skills);
                }}
                onReplace={() => {
                  setResumeId(null);
                  setJobs([]);
                  setIsUploaded(false);
                }}
              />
            </div>
          </section>
        )}

        <section className="mx-auto max-w-xl animate-slide-up">
          <SearchBar onSearch={handleSearch} isSearching={isSearching} disabled={!isUploaded} />
        </section>

        {stage !== "idle" && (
          <section className="mx-auto mt-6 max-w-xl">
            <StatusBar stage={stage} jobCount={jobCount} errorMessage={errorMessage} />
          </section>
        )}

        {(jobs.length > 0 || (isSearching && stage !== "error")) && (
          <section ref={resultsRef} className="mt-10">
            <h2 className="mb-6 font-[family-name:var(--font-syne)] text-lg font-bold">
              Results {jobs.length > 0 && <span className="text-sm font-normal text-muted">({jobs.length})</span>}
            </h2>
            <div className="flex flex-col gap-6 lg:flex-row">
              <div className="flex-1 space-y-4 lg:w-[65%]">
                {jobs.map((job, i) => (
                  <JobCard key={`${job.title}-${i}`} job={job} index={i} resumeId={resumeId} applyMode={applyMode} />
                ))}
              </div>
              <div className="lg:w-[35%]">
                <div className="lg:sticky lg:top-8">
                  <SkillGapPanel jobs={jobs} />
                </div>
              </div>
            </div>
          </section>
        )}

        <footer className="mt-16 border-t border-border py-6 text-center">
          <p className="font-[family-name:var(--font-jetbrains-mono)] text-xs text-muted/50">Flamingo.ai</p>
        </footer>
      </main>
    </div>
  );
}
