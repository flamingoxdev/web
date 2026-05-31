"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createClient } from "../lib/supabase";
import { API_URL } from "../lib/api";
import Header from "../components/Header";
import SkillPills from "../components/SkillPills";
import SearchBar, { type JobType } from "../components/SearchBar";
import StatusBar from "../components/StatusBar";
import JobCard, { Job } from "../components/JobCard";
import SkillGapPanel from "../components/SkillGapPanel";
import { fetchOnboardingStatus } from "../lib/onboarding";

type Stage = "idle" | "uploading" | "scraping" | "embedding" | "ranking" | "done" | "error";

export default function DashboardPage() {
  const [skills, setSkills] = useState<string[]>([]);
  const [profileReady, setProfileReady] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobCount, setJobCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try {
        const status = await fetchOnboardingStatus(session.access_token, API_URL);
        setProfileReady(!!status?.ready);

        const res = await fetch(`${API_URL}/profile`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const p = data.profile;
          const parsed = Array.isArray(p?.skills) ? p.skills : [];
          setSkills(parsed);
        }
      } catch (e) {
        console.error("Failed to load profile", e);
      }
    };
    load();
  }, [supabase.auth]);

  const handleSearch = useCallback(async (location: string, jobType: JobType) => {
    if (!profileReady) return;
    setIsSearching(true);
    setJobs([]);
    setStage("scraping");
    setErrorMessage("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_URL}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ location, limit: 20, job_type: jobType }),
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
  }, [profileReady]);

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
          <p className="mt-3 text-sm text-muted">
            Search jobs, then let AI tailor your profile — picking the best projects and rewriting bullets for each role.
          </p>
        </section>

        {!profileReady && (
          <section className="mx-auto mb-6 max-w-xl rounded-xl border border-accent-amber/30 bg-accent-amber/5 px-4 py-3 text-sm text-center">
            Complete your <a href="/profile" className="text-accent-cyan underline">profile</a> and pick a{" "}
            <a href="/templates" className="text-accent-cyan underline">template</a> to start searching.
          </section>
        )}

        {skills.length > 0 && (
          <section className="mx-auto mb-6 max-w-xl">
            <p className="mb-2 text-xs font-medium text-muted">Skills from your profile</p>
            <SkillPills skills={skills} />
          </section>
        )}

        <section className="mx-auto max-w-xl animate-slide-up">
          <SearchBar onSearch={handleSearch} isSearching={isSearching} disabled={!profileReady} />
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
                  <JobCard key={`${job.title}-${i}`} job={job} index={i} profileReady={profileReady} />
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

        <section className="mx-auto mt-16 max-w-3xl">
          <div className="mb-4 text-center">
            <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold">Free Job & Internship Boards</h2>
            <p className="mt-1 text-xs text-muted">
              Community-maintained lists. Find a role, then come back and tailor your resume for it.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "Summer 2027 Internships", repo: "vanshb03/Summer2027-Internships", url: "https://github.com/vanshb03/Summer2027-Internships" },
              { label: "2026 SWE College Jobs", repo: "speedyapply/2026-SWE-College-Jobs", url: "https://github.com/speedyapply/2026-SWE-College-Jobs" },
              { label: "Summer 2026 Internships", repo: "SimplifyJobs/Summer2026-Internships", url: "https://github.com/SimplifyJobs/Summer2026-Internships" },
              { label: "2026 AI College Jobs", repo: "speedyapply/2026-AI-College-Jobs", url: "https://github.com/speedyapply/2026-AI-College-Jobs" },
            ].map((b) => (
              <a
                key={b.url}
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className="glass-card group flex items-center gap-3 p-4 transition-all hover:scale-[1.01] hover:shadow-lg"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-lg">🔗</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold group-hover:text-accent-cyan transition-colors">{b.label}</span>
                  <span className="block truncate font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-muted">{b.repo}</span>
                </span>
              </a>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
