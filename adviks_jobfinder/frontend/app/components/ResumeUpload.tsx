"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "../lib/supabase";
import { API_URL } from "../lib/api";

interface ResumeUploadProps {
  onUploadComplete: (data: {
    resume_id: string;
    extracted_skills: string[];
    resume_text: string;
    autofilled_profile?: Record<string, string>;
  }) => void;
  onReplace?: () => void;
  isUploaded: boolean;
}

export default function ResumeUpload({
  onUploadComplete,
  onReplace,
  isUploaded,
}: ResumeUploadProps) {
  const supabase = createClient();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // When the parent flips back to "not uploaded" (e.g. after user clicked
  // Replace), clear any stale state from the previous upload.
  useEffect(() => {
    if (!isUploaded) {
      setReplacing(false);
      setUploadProgress(0);
      setError(null);
    }
  }, [isUploaded]);

  const handleFile = useCallback(
    async (file: File) => {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const isTxt = file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");
      const isTex = file.name.toLowerCase().endsWith(".tex");
      if (!isPdf && !isTxt && !isTex) {
        setError("Only PDF, TXT, or LaTeX (.tex) files are accepted");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("File must be under 10MB");
        return;
      }

      setError(null);
      setFileName(file.name);
      setIsUploading(true);
      setUploadProgress(0);

      // Simulate progress during upload
      const progressInterval = setInterval(() => {
        setUploadProgress((p) => Math.min(p + 8, 90));
      }, 150);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const { data: { session } } = await supabase.auth.getSession();
        const headers: HeadersInit = session
          ? { Authorization: `Bearer ${session.access_token}` }
          : {};

        const res = await fetch(`${API_URL}/upload`, {
          method: "POST",
          headers,
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `Upload failed (HTTP ${res.status})`);
        }

        const data = await res.json();
        clearInterval(progressInterval);
        setUploadProgress(100);

        setTimeout(() => {
          setIsUploading(false);
          setReplacing(false);
          onUploadComplete(data);
        }, 400);
      } catch (e) {
        clearInterval(progressInterval);
        setIsUploading(false);
        setReplacing(false);
        setUploadProgress(0);
        setError(
          e instanceof Error
            ? e.message
            : "Upload failed — restart the backend (Ctrl+C, then uvicorn again)"
        );
      }
    },
    [onUploadComplete, supabase.auth]
  );

  const handleReplaceClick = useCallback(() => {
    setReplacing(true);
    replaceInputRef.current?.click();
  }, []);

  const onReplaceFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) {
        setReplacing(false);
        return;
      }
      // Upload in-place — do NOT notify parent until success (avoids UI vanishing).
      setReplacing(true);
      handleFile(file);
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  if (isUploaded) {
    return (
      <div className="glass-card flex items-center gap-3 px-5 py-4 animate-fade-in">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-emerald/10">
          {replacing ? (
            <div className="h-5 w-5 rounded-full border-2 border-accent-emerald/30 border-t-accent-emerald animate-spin" />
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent-emerald"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            {fileName || "Resume on file"}
          </p>
          <p className="text-xs text-muted">
            {replacing ? "Uploading replacement…" : "Resume parsed successfully"}
          </p>
        </div>
        <button
          onClick={handleReplaceClick}
          disabled={replacing}
          className="text-xs text-muted hover:text-foreground transition-colors border border-border px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          Replace Resume
        </button>
        <input
          ref={replaceInputRef}
          type="file"
          accept=".pdf,.txt,.tex,application/pdf,text/plain"
          onChange={onReplaceFileSelect}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div className="animate-slide-up">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative cursor-pointer overflow-hidden rounded-xl border-2 border-dashed
          transition-all duration-300
          ${
            isDragging
              ? "border-accent-cyan bg-accent-cyan/5 scale-[1.01]"
              : "border-border hover:border-muted"
          }
          ${isUploading ? "pointer-events-none" : ""}
        `}
      >
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          {isUploading ? (
            <>
              <div className="mb-4 h-12 w-12 rounded-full border-2 border-accent-cyan/30 border-t-accent-cyan animate-spin" />
              <p className="font-[family-name:var(--font-jetbrains-mono)] text-sm text-accent-cyan">
                Parsing resume...
              </p>
              <div className="mt-4 h-1 w-48 overflow-hidden rounded-full bg-surface-raised">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent-cyan to-accent-violet transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-surface-raised">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-muted"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <p className="text-sm font-medium text-foreground">
                Drop your resume here
              </p>
              <p className="mt-1 text-xs text-muted">
                PDF, TXT, or LaTeX (.tex), up to 10MB
              </p>
              <button
                type="button"
                className="mt-4 rounded-lg bg-surface-raised px-4 py-2 text-xs font-medium text-muted transition-colors hover:bg-border hover:text-foreground"
              >
                Browse files
              </button>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.tex,application/pdf,text/plain"
          onChange={onFileSelect}
          className="hidden"
        />
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-accent-coral/20 bg-accent-coral/5 px-4 py-2.5 animate-slide-up">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="shrink-0 text-accent-coral"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <p className="text-xs text-accent-coral">{error}</p>
        </div>
      )}
    </div>
  );
}
