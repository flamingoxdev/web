"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SkillPills from "./SkillPills";
import { applySingle, type DiscoverJob } from "../lib/api";
import { createClient } from "../lib/supabase";
import { getAccessToken } from "../lib/authToken";

export type Job = DiscoverJob;

interface JobCardProps {
  job: Job;
  index: number;
  profileReady: boolean;
  emailApplyEnabled?: boolean;
}

export default function JobCard({ job, index, profileReady, emailApplyEnabled = false }: JobCardProps) {
  const router = useRouter();
  const supabase = createClient();
  const [expanded, setExpanded] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  const pct = Math.min(
    100,
    Math.round((job.ai_score ?? job.match_score * 10) * (job.ai_score ? 10 : 1))
  );

  const scoreColor =
    pct >= 80 ? "text-accent-emerald"
    : pct >= 60 ? "text-accent-cyan"
    : pct >= 40 ? "text-accent-amber"
    : "text-accent-coral";

  const canQuickApply = job.auto_apply_eligible ?? (
    job.apply_method === "greenhouse" ||
    (job.apply_method === "email" && emailApplyEnabled)
  );

  const barColor =
    pct >= 80 ? "from-accent-emerald to-accent-cyan"
    : pct >= 60 ? "from-accent-cyan to-accent-violet"
    : pct >= 40 ? "from-accent-amber to-accent-cyan"
    : "from-accent-coral to-accent-amber";

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
            {job.apply_method && (
              <span className="mt-1 rounded-full bg-surface-raised px-2 py-0.5 text-[9px] uppercase text-muted">
                {job.apply_method}
              </span>
            )}
          </div>
        </div>

        {job.ai_reason && (
          <p className="mt-2 text-xs text-muted">{job.ai_reason}</p>
        )}

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
            className="text-accent-cyan hover:text-accent-violet inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
          >
            View job posting
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>

          <div className="flex items-center gap-2">
            {canQuickApply && (
              <button
                onClick={async () => {
                  if (!profileReady || applying) return;
                  setApplying(true);
                  setApplyMsg(null);
                  try {
                    const token = await getAccessToken(supabase);
                    const result = await applySingle(token, job);
                    setApplyMsg(result.status === "applied" ? "Applied!" : result.error || result.status);
                  } catch (e) {
                    setApplyMsg(e instanceof Error ? e.message : "Apply failed");
                  } finally {
                    setApplying(false);
                  }
                }}
                disabled={!profileReady || applying}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent-emerald/40 bg-accent-emerald/10 px-3 py-1.5 text-xs font-semibold text-accent-emerald disabled:opacity-40"
              >
                {applying ? "Applying…" : "Quick Apply"}
              </button>
            )}
            <button
              onClick={() => {
                if (!profileReady) return;
                localStorage.setItem("latex_job_data", JSON.stringify({
                  job_title: job.title,
                  company: job.company,
                  job_description: job.description_snippet,
                  job_url: job.url,
                }));
                router.push(`/resume/latex`);
              }}
              disabled={!profileReady}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent-cyan to-accent-violet px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-accent-cyan/10"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
              </svg>
              Auto Create Resume
            </button>
            {applyMsg && <span className="text-[10px] text-muted">{applyMsg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
