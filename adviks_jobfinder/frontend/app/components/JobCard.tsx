"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import SkillPills from "./SkillPills";
import { API_URL } from "../lib/api";

export interface Job {
  title: string;
  company: string;
  location: string;
  match_score: number;
  matched_skills: string[];
  missing_skills: string[];
  url: string;
  description_snippet: string;
}

interface JobCardProps {
  job: Job;
  index: number;
  resumeId: string | null;
  applyMode?: "manual" | "auto";
}

type ToastState = { type: "success" | "error"; message: string } | null;

export default function JobCard({ job, index, resumeId, applyMode = "auto" }: JobCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedToRoadmap, setSavedToRoadmap] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const pct = Math.round(job.match_score * 100);

  const scoreColor =
    pct >= 80 ? "text-accent-emerald"
    : pct >= 60 ? "text-accent-cyan"
    : pct >= 40 ? "text-accent-amber"
    : "text-accent-coral";

  const barColor =
    pct >= 80 ? "from-accent-emerald to-accent-cyan"
    : pct >= 60 ? "from-accent-cyan to-accent-violet"
    : pct >= 40 ? "from-accent-amber to-accent-cyan"
    : "from-accent-coral to-accent-amber";

  // Auto-dismiss toast after 3 s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSaveToRoadmap = async () => {
    if (!resumeId || isSaving || savedToRoadmap) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${API_URL}/roadmap/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_id: resumeId,
          job_title: job.title,
          company: job.company,
          job_description: job.description_snippet,
          job_url: job.url,
        }),
      });
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSavedToRoadmap(true);
      setToast({ type: "success", message: "Added to Roadmap" });
    } catch {
      setToast({ type: "error", message: "Failed to generate roadmap" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="glass-card overflow-hidden transition-all duration-300 hover:translate-y-[-1px] animate-slide-up"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
    >
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-[family-name:var(--font-syne)] text-base font-semibold leading-tight text-foreground">
              {job.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="font-medium text-foreground/80">{job.company}</span>
              <span className="flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {job.location}
              </span>
            </div>
          </div>

          {/* Score badge */}
          <div className="flex flex-col items-center">
            <span className={`font-[family-name:var(--font-jetbrains-mono)] text-2xl font-bold ${scoreColor}`}>
              {pct}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted">match</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-1000`}
            style={{ width: `${pct}%`, animation: "progress-fill 0.8s ease-out" }}
          />
        </div>

        {/* Skills */}
        <div className="mt-4 space-y-2">
          {job.matched_skills.length > 0 && (
            <SkillPills skills={job.matched_skills} variant="matched" size="sm" />
          )}
          {job.missing_skills.length > 0 && (
            <SkillPills skills={job.missing_skills} variant="missing" size="sm" />
          )}
        </div>

        {/* Description toggle */}
        {job.description_snippet && (
          <div className="mt-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
            >
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                className={`transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              {expanded ? "Hide" : "Show"} description
            </button>
            {expanded && (
              <p className="mt-2 text-xs leading-relaxed text-muted animate-fade-in">
                {job.description_snippet}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${
              applyMode === "manual"
                ? "rounded-lg bg-gradient-to-r from-accent-cyan to-accent-violet px-3 py-1.5 text-white shadow-lg shadow-accent-cyan/10"
                : "text-accent-cyan hover:text-accent-violet"
            }`}
          >
            {applyMode === "manual" ? "Apply manually →" : "View job posting"}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>

          <div className="flex items-center gap-2">
            {applyMode === "auto" && (
            <button
              onClick={() => {
                if (!resumeId) return;
                localStorage.setItem("apply_job_data", JSON.stringify({
                  job_title: job.title,
                  company: job.company,
                  job_description: job.description_snippet,
                  job_url: job.url,
                  resume_id: resumeId,
                }));
                const slug = job.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).substring(2, 6);
                router.push(`/apply/${slug}`);
              }}
              disabled={!resumeId}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent-cyan to-accent-violet px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-accent-cyan/10"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
              </svg>
              Auto Apply
            </button>
            )}

            {/* Save to Roadmap */}
            <button
              onClick={handleSaveToRoadmap}
              disabled={!resumeId || isSaving || savedToRoadmap}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all
                ${savedToRoadmap
                  ? "border-accent-emerald/20 bg-accent-emerald/10 text-accent-emerald cursor-default"
                  : isSaving
                    ? "border-border bg-surface text-muted cursor-wait"
                    : "border-accent-violet/20 bg-accent-violet/5 text-accent-violet hover:bg-accent-violet/10 disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
            >
              {isSaving ? (
                <>
                  <div className="h-3 w-3 rounded-full border border-muted/30 border-t-muted animate-spin" />
                  Generating...
                </>
              ) : savedToRoadmap ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Saved
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                  Save to Roadmap
                </>
              )}
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium animate-slide-up
              ${toast.type === "success"
                ? "border border-accent-emerald/20 bg-accent-emerald/8 text-accent-emerald"
                : "border border-accent-coral/20 bg-accent-coral/8 text-accent-coral"
              }`}
          >
            {toast.type === "success" ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
}
