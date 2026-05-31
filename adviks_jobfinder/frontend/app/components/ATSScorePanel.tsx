"use client";

import { useState } from "react";

interface ATSReport {
  ats_score: number;
  grade: string;
  sections: Record<string, boolean>;
  issues: Array<{ severity: "high" | "medium" | "low"; message: string }>;
  improvements: string[];
  missing_sections: string[];
  stats: {
    action_verbs: number;
    quantified_bullets: number;
    total_bullets: number;
    word_count: number;
    skills_count: number;
  };
}

interface ATSScorePanelProps {
  report: ATSReport;
  isLoading?: boolean;
}

const SEV_COLORS = {
  high: { bg: "bg-red-50 border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-700", dot: "bg-red-500" },
  medium: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  low: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
};

const GRADE_CONFIG = {
  A: { color: "#16a085", label: "Excellent" },
  B: { color: "#27ae60", label: "Good" },
  C: { color: "#f39c12", label: "Fair" },
  D: { color: "#e67e22", label: "Needs Work" },
  F: { color: "#e63946", label: "Poor" },
};

function CircularProgress({ score, grade }: { score: number; grade: string }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const filled = circ * (score / 100);
  const cfg = GRADE_CONFIG[grade as keyof typeof GRADE_CONFIG] || GRADE_CONFIG.C;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="140" height="140" className="drop-shadow-sm" viewBox="0 0 140 140">
        {/* Track */}
        <circle cx="70" cy="70" r={r} fill="none" stroke="#f0e8eb" strokeWidth="12" />
        {/* Fill */}
        <circle
          cx="70" cy="70" r={r}
          fill="none"
          stroke={cfg.color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
          strokeDashoffset={circ * 0.25}
          style={{ transition: "stroke-dasharray 1s ease-out" }}
        />
        {/* Score text */}
        <text x="70" y="65" textAnchor="middle" fontSize="28" fontWeight="700" fill={cfg.color} fontFamily="monospace">
          {score}
        </text>
        <text x="70" y="82" textAnchor="middle" fontSize="11" fill="#8b6470">
          / 100
        </text>
      </svg>
      <div className="text-center">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold"
          style={{ background: cfg.color + "20", color: cfg.color }}
        >
          Grade {grade} · {cfg.label}
        </span>
      </div>
    </div>
  );
}

function StatBadge({ label, value, max, color }: { label: string; value: number; max?: number; color: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-mono text-sm font-semibold" style={{ color }}>
        {value}{max ? `/${max}` : ""}
      </span>
    </div>
  );
}

export default function ATSScorePanel({ report, isLoading }: ATSScorePanelProps) {
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <div className="glass-card p-6 space-y-4 animate-pulse">
        <div className="h-4 w-32 rounded bg-surface-raised" />
        <div className="mx-auto h-[140px] w-[140px] rounded-full bg-surface-raised" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 rounded-lg bg-surface-raised" />
          ))}
        </div>
      </div>
    );
  }

  if (!report) return null;

  const visibleIssues = showAll ? report.issues : report.issues.slice(0, 3);

  return (
    <div className="glass-card p-6 space-y-5 animate-slide-up">
      <h3 className="font-[family-name:var(--font-syne)] text-sm font-bold uppercase tracking-wider text-muted">
        ATS Score Analysis
      </h3>

      {/* Score circle */}
      <div className="flex justify-center">
        <CircularProgress score={report.ats_score} grade={report.grade} />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatBadge
          label="Action Verbs"
          value={report.stats.action_verbs}
          color={report.stats.action_verbs >= 10 ? "#16a085" : report.stats.action_verbs >= 5 ? "#f39c12" : "#e63946"}
        />
        <StatBadge
          label="Quantified Bullets"
          value={report.stats.quantified_bullets}
          max={report.stats.total_bullets}
          color={report.stats.quantified_bullets >= report.stats.total_bullets * 0.5 ? "#16a085" : "#f39c12"}
        />
        <StatBadge
          label="Word Count"
          value={report.stats.word_count}
          color={report.stats.word_count >= 300 && report.stats.word_count <= 800 ? "#16a085" : "#f39c12"}
        />
        <StatBadge
          label="Skills Found"
          value={report.stats.skills_count}
          color={report.stats.skills_count >= 10 ? "#16a085" : "#f39c12"}
        />
      </div>

      {/* Section checklist */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Sections</p>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(report.sections).map(([name, present]) => (
            <div
              key={name}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium border ${
                present
                  ? "border-accent-emerald/20 bg-accent-emerald/5 text-accent-emerald"
                  : "border-accent-coral/20 bg-accent-coral/5 text-accent-coral"
              }`}
            >
              <span>{present ? "✓" : "✗"}</span>
              <span className="capitalize">{name.replace("_", " ")}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Issues */}
      {report.issues.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Issues ({report.issues.length})
          </p>
          <div className="space-y-2">
            {visibleIssues.map((issue, i) => {
              const sev = SEV_COLORS[issue.severity];
              return (
                <div
                  key={i}
                  className={`rounded-lg border p-3 text-xs leading-relaxed ${sev.bg} ${sev.text}`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${sev.dot}`} />
                    <div>
                      <span className={`mr-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${sev.badge}`}>
                        {issue.severity}
                      </span>
                      {issue.message}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {report.issues.length > 3 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-2 text-xs text-accent-cyan hover:underline"
            >
              {showAll ? "Show less" : `Show ${report.issues.length - 3} more`}
            </button>
          )}
        </div>
      )}

      {/* Improvements */}
      {report.improvements.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            💡 Top Improvements
          </p>
          <ul className="space-y-1.5">
            {report.improvements.slice(0, 4).map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted">
                <span className="mt-0.5 text-accent-cyan">→</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
