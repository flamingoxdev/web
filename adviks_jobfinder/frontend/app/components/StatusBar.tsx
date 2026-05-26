"use client";

type Stage = "idle" | "uploading" | "scraping" | "embedding" | "ranking" | "done" | "error";

interface StatusBarProps {
  stage: Stage;
  jobCount?: number;
  errorMessage?: string;
}

const stages: { key: Stage; label: string }[] = [
  { key: "scraping", label: "Scraping Indeed" },
  { key: "embedding", label: "Embedding" },
  { key: "ranking", label: "Ranking" },
  { key: "done", label: "Done" },
];

function stageIndex(stage: Stage): number {
  const idx = stages.findIndex((s) => s.key === stage);
  return idx === -1 ? -1 : idx;
}

export default function StatusBar({ stage, jobCount, errorMessage }: StatusBarProps) {
  if (stage === "idle") return null;

  const currentIdx = stageIndex(stage);

  if (stage === "error") {
    return (
      <div className="animate-slide-up rounded-xl border border-accent-coral/20 bg-accent-coral/5 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-coral/10">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-accent-coral"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-accent-coral">Search failed</p>
            <p className="text-xs text-muted">{errorMessage || "Something went wrong"}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-slide-up rounded-xl border border-border bg-surface/60 px-5 py-4">
      {/* Stage pills */}
      <div className="flex items-center gap-1">
        {stages.map((s, i) => {
          const isActive = s.key === stage;
          const isComplete = currentIdx > i;
          const isPending = currentIdx < i;

          return (
            <div key={s.key} className="flex items-center">
              <div className="flex items-center gap-2">
                {/* Dot */}
                <div
                  className={`
                    relative flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-500
                    ${isComplete ? "bg-accent-emerald/20 text-accent-emerald" : ""}
                    ${isActive ? "bg-accent-cyan/20 text-accent-cyan" : ""}
                    ${isPending ? "bg-surface-raised text-muted/50" : ""}
                  `}
                >
                  {isComplete ? (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : isActive ? (
                    <div className="h-2 w-2 rounded-full bg-accent-cyan animate-pulse" />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>

                {/* Label */}
                <span
                  className={`
                    hidden text-xs font-medium sm:inline transition-colors duration-300
                    ${isComplete ? "text-accent-emerald" : ""}
                    ${isActive ? "text-accent-cyan" : ""}
                    ${isPending ? "text-muted/40" : ""}
                  `}
                >
                  {s.label}
                  {isActive && s.key === "embedding" && jobCount
                    ? ` (${jobCount} jobs)`
                    : ""}
                </span>
              </div>

              {/* Connector */}
              {i < stages.length - 1 && (
                <div className="mx-2 h-px w-6 sm:w-10">
                  <div
                    className={`h-full transition-colors duration-500 ${
                      isComplete ? "bg-accent-emerald/40" : "bg-border"
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Active shimmer bar */}
      {stage !== "done" && (
        <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-surface-raised">
          <div className="h-full w-full animate-shimmer rounded-full" />
        </div>
      )}
    </div>
  );
}
