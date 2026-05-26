"use client";

import { Job } from "./JobCard";

interface SkillGapPanelProps {
  jobs: Job[];
}

export default function SkillGapPanel({ jobs }: SkillGapPanelProps) {
  const skillCounts = new Map<string, number>();
  for (const job of jobs) {
    for (const skill of job.missing_skills) {
      skillCounts.set(skill, (skillCounts.get(skill) || 0) + 1);
    }
  }
  const sorted = Array.from(skillCounts.entries()).sort((a, b) => b[1] - a[1]);

  if (jobs.length === 0) {
    return (
      <div className="glass-card p-5">
        <h3 className="font-[family-name:var(--font-syne)] text-sm font-semibold text-foreground">
          Skill Gaps
        </h3>
        <div className="mt-6 flex flex-col items-center py-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </div>
          <p className="mt-3 text-xs text-muted">Search for internships to see your skill gaps</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-[family-name:var(--font-syne)] text-sm font-semibold text-foreground">
          Your Skill Gaps
        </h3>
        <span className="rounded-full bg-surface-raised px-2 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-muted">
          {sorted.length} skills
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-emerald/10">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-emerald">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <p className="mt-3 text-xs text-accent-emerald">No skill gaps — great match!</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {sorted.map(([skill, count], i) => {
            const maxCount = sorted[0][1];
            const widthPct = (count / maxCount) * 100;
            return (
              <div
                key={skill}
                className="group relative overflow-hidden rounded-lg bg-surface-raised/50 px-3 py-2 animate-slide-up"
                style={{ animationDelay: `${i * 30}ms`, animationFillMode: "both" }}
              >
                <div
                  className="absolute inset-y-0 left-0 bg-accent-coral/6 transition-all duration-700"
                  style={{ width: `${widthPct}%` }}
                />
                <div className="relative flex items-center justify-between">
                  <span className="font-[family-name:var(--font-jetbrains-mono)] text-xs text-foreground/80">
                    {skill}
                  </span>
                  <span className="ml-2 rounded-full bg-accent-coral/10 px-1.5 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium text-accent-coral">
                    {count} {count === 1 ? "job" : "jobs"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
