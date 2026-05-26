"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "../components/Header";

// ── Types ──────────────────────────────────────────────────────────────────

interface ResourceLink {
  title: string;
  url: string;
  type: "course" | "docs" | "book" | "practice";
}

interface MissingSkill {
  skill: string;
  importance: "high" | "medium" | "low";
  estimated_weeks: number;
  reason: string;
  resources: ResourceLink[];
}

interface ExperienceGap {
  description: string;
  suggestion: string;
}

interface RoadmapData {
  missing_skills: MissingSkill[];
  experience_gaps: ExperienceGap[];
  summary: string;
}

interface RoadmapItem {
  id: string;
  job_title: string;
  company: string;
  job_url: string;
  roadmap: RoadmapData;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

const importanceBadge: Record<string, string> = {
  high:   "border-accent-coral/20   bg-accent-coral/10   text-accent-coral",
  medium: "border-accent-amber/20   bg-accent-amber/10   text-accent-amber",
  low:    "border-accent-emerald/20 bg-accent-emerald/10 text-accent-emerald",
};

const resourceColor: Record<string, string> = {
  course:   "border-accent-cyan/20   bg-accent-cyan/8   text-accent-cyan   hover:bg-accent-cyan/15",
  docs:     "border-accent-violet/20 bg-accent-violet/8 text-accent-violet hover:bg-accent-violet/15",
  book:     "border-accent-amber/20  bg-accent-amber/8  text-accent-amber  hover:bg-accent-amber/15",
  practice: "border-[#2dd4bf]/20     bg-[#2dd4bf]/8     text-[#2dd4bf]    hover:bg-[#2dd4bf]/15",
};

// ── Skeleton ───────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="glass-card animate-pulse p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-2">
              <div className="h-5 w-2/3 rounded bg-surface-raised" />
              <div className="h-3 w-1/3 rounded bg-surface-raised" />
            </div>
            <div className="h-8 w-20 rounded bg-surface-raised" />
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full rounded bg-surface-raised" />
            <div className="h-3 w-5/6 rounded bg-surface-raised" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Roadmap card ───────────────────────────────────────────────────────────

function RoadmapCard({
  item,
  onDelete,
}: {
  item: RoadmapItem;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await fetch(`http://localhost:8000/roadmap/${item.id}`, { method: "DELETE" });
      onDelete(item.id);
    } catch {
      setIsDeleting(false);
    }
  };

  const skills: MissingSkill[] = item.roadmap?.missing_skills ?? [];
  const gaps: ExperienceGap[]  = item.roadmap?.experience_gaps ?? [];
  const summary: string         = item.roadmap?.summary ?? "";

  return (
    <div className="glass-card overflow-hidden animate-slide-up">
      {/* Card header */}
      <div className="flex items-start gap-4 p-5">
        <div className="min-w-0 flex-1">
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold text-foreground">
            {item.job_title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="font-medium text-foreground/70">{item.company}</span>
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[11px]">
              Saved {formatDate(item.created_at)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* View on Indeed */}
          {item.job_url && (
            <a
              href={item.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs text-muted hover:text-foreground transition-colors"
            >
              Indeed
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            title="Delete roadmap"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-accent-coral/10 hover:text-accent-coral transition-colors disabled:opacity-40"
          >
            {isDeleting ? (
              <div className="h-4 w-4 rounded-full border border-muted/30 border-t-muted animate-spin" />
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
            )}
          </button>

          {/* Expand/collapse */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-raised hover:text-foreground transition-colors"
          >
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              className={`transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* Card body */}
      {expanded && (
        <div className="border-t border-border px-5 pb-6 pt-5 space-y-6 animate-fade-in">

          {/* Summary */}
          {summary && (
            <div className="rounded-xl border border-accent-cyan/10 bg-accent-cyan/5 p-4">
              <p className="text-sm leading-relaxed text-foreground/80">{summary}</p>
            </div>
          )}

          {/* Skills to Learn */}
          {skills.length > 0 && (
            <section>
              <h3 className="mb-3 font-[family-name:var(--font-syne)] text-sm font-semibold text-foreground">
                Skills to Learn
                <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-normal text-muted">
                  {skills.length}
                </span>
              </h3>
              <div className="space-y-3">
                {skills.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border bg-surface-raised/40 p-4"
                  >
                    {/* Skill header */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-[family-name:var(--font-syne)] text-sm font-semibold text-foreground">
                        {s.skill}
                      </span>
                      {s.importance && (
                        <span
                          className={`rounded-md border px-2 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium capitalize ${
                            importanceBadge[s.importance] ?? importanceBadge.medium
                          }`}
                        >
                          {s.importance}
                        </span>
                      )}
                      {s.estimated_weeks != null && (
                        <span className="rounded-md border border-border bg-surface px-2 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-muted">
                          ~{s.estimated_weeks}w
                        </span>
                      )}
                    </div>

                    {/* Reason */}
                    {s.reason && (
                      <p className="mt-2 text-xs leading-relaxed text-muted">{s.reason}</p>
                    )}

                    {/* Resources */}
                    {s.resources?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {s.resources.map((r, j) => (
                          <a
                            key={j}
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                              resourceColor[r.type] ?? resourceColor.course
                            }`}
                          >
                            {r.type === "course"   && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>}
                            {r.type === "docs"     && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
                            {r.type === "book"     && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>}
                            {r.type === "practice" && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>}
                            {r.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Experience Gaps */}
          {gaps.length > 0 && (
            <section>
              <h3 className="mb-3 font-[family-name:var(--font-syne)] text-sm font-semibold text-foreground">
                Experience Gaps
                <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-normal text-muted">
                  {gaps.length}
                </span>
              </h3>
              <div className="space-y-2">
                {gaps.map((g, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border bg-surface-raised/40 p-4"
                  >
                    <p className="text-sm font-medium text-foreground">{g.description}</p>
                    {g.suggestion && (
                      <p className="mt-1 text-xs italic leading-relaxed text-muted">{g.suggestion}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function RoadmapPage() {
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [roadmaps, setRoadmaps] = useState<RoadmapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Read resume_id from localStorage on mount
  useEffect(() => {
    const id = localStorage.getItem("resume_id");
    setResumeId(id);
    if (!id) {
      setLoading(false);
      return;
    }
    fetch(`http://localhost:8000/roadmap/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load roadmaps");
        return r.json();
      })
      .then((data) => setRoadmaps(data.roadmaps ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = (id: string) => {
    setRoadmaps((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="relative min-h-screen">
      {/* Animated background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="bg-orb-1 absolute -top-32 left-[15%] h-[500px] w-[500px] rounded-full bg-[#0d1b3e]/60 blur-[120px]" />
        <div className="bg-orb-2 absolute top-[40%] -right-20 h-[420px] w-[420px] rounded-full bg-[#1a0d2e]/50 blur-[100px]" />
        <div className="bg-orb-3 absolute -bottom-20 left-[35%] h-[380px] w-[380px] rounded-full bg-[#06101a]/80 blur-[90px]" />
      </div>

      <Header />

      <main className="relative mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="mb-8 animate-slide-up">
          <h1 className="font-[family-name:var(--font-syne)] text-3xl font-bold tracking-tight text-foreground">
            My Roadmap
          </h1>
          <p className="mt-2 text-sm text-muted">
            Your personalized learning plan for each saved job
          </p>
        </div>

        {/* No resume state */}
        {!loading && !resumeId && (
          <div className="glass-card flex flex-col items-center gap-4 py-16 text-center animate-slide-up">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-surface-raised">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No resume uploaded yet</p>
              <p className="mt-1 text-xs text-muted">Upload a resume first to use the roadmap</p>
            </div>
            <Link
              href="/"
              className="mt-2 rounded-lg bg-gradient-to-r from-accent-cyan to-accent-violet px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
            >
              Upload Resume
            </Link>
          </div>
        )}

        {/* Loading */}
        {loading && <Skeleton />}

        {/* Error */}
        {!loading && error && (
          <div className="glass-card flex items-center gap-3 p-5 animate-slide-up">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-coral/10">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-coral">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <p className="text-sm text-accent-coral">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && resumeId && roadmaps.length === 0 && (
          <div className="glass-card flex flex-col items-center gap-4 py-16 text-center animate-slide-up">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-surface-raised">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted">
                <path d="M3 3h7v7H3z" />
                <path d="M14 3h7v7h-7z" />
                <path d="M14 14h7v7h-7z" />
                <path d="M3 14h7v7H3z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No roadmaps yet</p>
              <p className="mt-1 text-xs text-muted">
                Find internships and save jobs to build your roadmap.
              </p>
            </div>
            <Link
              href="/"
              className="mt-2 rounded-lg bg-gradient-to-r from-accent-cyan to-accent-violet px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
            >
              Find Internships
            </Link>
          </div>
        )}

        {/* Roadmap cards */}
        {!loading && !error && roadmaps.length > 0 && (
          <div className="space-y-5">
            {roadmaps.map((item) => (
              <RoadmapCard key={item.id} item={item} onDelete={handleDelete} />
            ))}
          </div>
        )}

        <footer className="mt-16 border-t border-border py-6 text-center">
          <p className="font-[family-name:var(--font-jetbrains-mono)] text-xs text-muted/50">
            InternMatch AI — powered by local embeddings
          </p>
        </footer>
      </main>
    </div>
  );
}
