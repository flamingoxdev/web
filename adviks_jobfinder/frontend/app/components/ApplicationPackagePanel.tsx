"use client";

import { useState } from "react";

interface Package {
  id?: number;
  cover_letter?: string;
  professional_bio?: string;
  linkedin_summary?: string;
  recruiter_message?: string;
  job_title?: string;
  company?: string;
}

interface ApplicationPackagePanelProps {
  pkg: Package;
  isLoading?: boolean;
  onUpdate?: (field: string, value: string) => void;
}

type TabId = "cover_letter" | "professional_bio" | "linkedin_summary" | "recruiter_message";

const TABS: { id: TabId; label: string; icon: string; limit?: number }[] = [
  { id: "cover_letter",      label: "Cover Letter",      icon: "📄", },
  { id: "professional_bio",  label: "Professional Bio",  icon: "👤", },
  { id: "linkedin_summary",  label: "LinkedIn Summary",  icon: "💼", limit: 300 },
  { id: "recruiter_message", label: "Recruiter DM",      icon: "💬", },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent-cyan/40 hover:text-accent-cyan"
    >
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

function DownloadButton({ text, filename }: { text: string; filename: string }) {
  const download = () => {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      onClick={download}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent-violet/40 hover:text-accent-violet"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Download
    </button>
  );
}

function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent-emerald/40 hover:text-accent-emerald"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
      Print
    </button>
  );
}

export default function ApplicationPackagePanel({
  pkg,
  isLoading,
  onUpdate,
}: ApplicationPackagePanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("cover_letter");
  const [editMode, setEditMode] = useState(false);
  const [localContent, setLocalContent] = useState<Record<TabId, string>>({
    cover_letter: pkg.cover_letter || "",
    professional_bio: pkg.professional_bio || "",
    linkedin_summary: pkg.linkedin_summary || "",
    recruiter_message: pkg.recruiter_message || "",
  });

  // Sync if pkg updates
  if (
    pkg.cover_letter !== localContent.cover_letter ||
    pkg.professional_bio !== localContent.professional_bio ||
    pkg.linkedin_summary !== localContent.linkedin_summary ||
    pkg.recruiter_message !== localContent.recruiter_message
  ) {
    setLocalContent({
      cover_letter: pkg.cover_letter || "",
      professional_bio: pkg.professional_bio || "",
      linkedin_summary: pkg.linkedin_summary || "",
      recruiter_message: pkg.recruiter_message || "",
    });
  }

  const activeContent = localContent[activeTab];
  const activeTabMeta = TABS.find(t => t.id === activeTab)!;

  if (isLoading) {
    return (
      <div className="glass-card overflow-hidden animate-pulse">
        <div className="flex border-b border-border">
          {TABS.map(t => (
            <div key={t.id} className="flex-1 h-11 bg-surface-raised" />
          ))}
        </div>
        <div className="p-5 space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-4 rounded bg-surface-raised" style={{ width: `${60 + i * 8}%` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden animate-slide-up">
      {/* Header */}
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-[family-name:var(--font-syne)] text-sm font-bold">Application Package</h3>
            {pkg.job_title && (
              <p className="mt-0.5 text-xs text-muted">
                for <span className="text-foreground">{pkg.job_title}</span>
                {pkg.company && <span> at <span className="text-foreground">{pkg.company}</span></span>}
              </p>
            )}
          </div>
          <button
            onClick={() => setEditMode(!editMode)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              editMode
                ? "border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan"
                : "border-border bg-surface-raised text-muted hover:text-foreground"
            }`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            {editMode ? "Done Editing" : "Edit"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 min-w-[90px] items-center justify-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "border-b-2 border-accent-cyan text-accent-cyan bg-accent-cyan/5"
                : "text-muted hover:text-foreground hover:bg-surface-raised"
            }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-5">
        {editMode ? (
          <div>
            <textarea
              value={activeContent}
              onChange={e => {
                const val = activeTabMeta.limit
                  ? e.target.value.slice(0, activeTabMeta.limit)
                  : e.target.value;
                setLocalContent(prev => ({ ...prev, [activeTab]: val }));
                onUpdate?.(activeTab, val);
              }}
              className="w-full rounded-lg border border-border bg-surface p-3 text-xs leading-relaxed text-foreground focus:border-accent-cyan/50 focus:outline-none focus:ring-1 focus:ring-accent-cyan/20 resize-none"
              rows={14}
            />
            {activeTabMeta.limit && (
              <p className="mt-1 text-right text-xs text-muted">
                {activeContent.length} / {activeTabMeta.limit}
              </p>
            )}
          </div>
        ) : (
          <div className="max-h-[360px] overflow-y-auto">
            <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground font-sans">
              {activeContent || <span className="text-muted italic">No content generated.</span>}
            </pre>
          </div>
        )}

        {/* Action bar */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {activeContent && <CopyButton text={activeContent} />}
          {activeContent && (
            <DownloadButton
              text={activeContent}
              filename={`${activeTabMeta.id}-${pkg.company || "application"}.txt`}
            />
          )}
          {activeTab === "cover_letter" && <PrintButton />}
        </div>
      </div>
    </div>
  );
}
