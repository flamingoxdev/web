"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase";
import { API_URL } from "../../lib/api";
import { getAccessToken } from "../../lib/authToken";
import EditableResumePreview, { type ResumeData } from "../../components/EditableResumePreview";
import ResumeEditorAI from "../../components/ResumeEditorAI";
import { themeForTemplate, type TemplateMeta } from "../../lib/templates";

const EDITOR_CACHE_KEY = "resume_editor_state";

interface EditorCache {
  jobKey: string;
  tailored: ResumeData;
  latexCode: string;
  templateId: string;
  jobTitle: string;
  company: string;
}

function jobCacheKey(jobData: Record<string, unknown>): string {
  return [
    jobData.job_title || "",
    jobData.company || "",
    jobData.job_url || jobData.url || jobData.job_id || "",
  ].join("|");
}

function loadEditorCache(jobKey: string): EditorCache | null {
  try {
    const raw = sessionStorage.getItem(EDITOR_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EditorCache;
    if (parsed.jobKey === jobKey && parsed.tailored) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function saveEditorCache(state: EditorCache) {
  try {
    sessionStorage.setItem(EDITOR_CACHE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

export default function ResumeEditorPage() {
  const router = useRouter();
  const supabase = createClient();
  const [tailored, setTailored] = useState<ResumeData | null>(null);
  const [latexCode, setLatexCode] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [templateId, setTemplateId] = useState("jakes_resume");
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [loadingMsg, setLoadingMsg] = useState("Initializing...");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSwitchingTpl, setIsSwitchingTpl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobKeyRef = useRef("");
  const initStarted = useRef(false);

  const persistCache = useCallback(
    (data: ResumeData, latex: string, tpl: string, jt: string, co: string) => {
      if (!jobKeyRef.current) return;
      saveEditorCache({
        jobKey: jobKeyRef.current,
        tailored: data,
        latexCode: latex,
        templateId: tpl,
        jobTitle: jt,
        company: co,
      });
    },
    []
  );

  const fetchLatex = useCallback(async (data: ResumeData, tpl: string, token: string) => {
    const res = await fetch(`${API_URL}/tailor/latex`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tailored_json: data, job_title: jobTitle, template_id: tpl }),
    });
    if (!res.ok) throw new Error("Failed to sync LaTeX");
    const j = await res.json();
    return j.latex as string;
  }, [jobTitle]);

  const syncLatexFromPreview = useCallback((data: ResumeData, tpl: string) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      try {
        const token = await getAccessToken(supabase);
        if (!token) return;
        const latex = await fetchLatex(data, tpl, token);
        setLatexCode(latex);
        persistCache(data, latex, tpl, jobTitle, company);
      } catch (e) {
        console.error("LaTeX sync failed", e);
      }
    }, 600);
  }, [fetchLatex, supabase, persistCache, jobTitle, company]);

  const handlePreviewChange = useCallback((updated: ResumeData) => {
    setTailored(updated);
    syncLatexFromPreview(updated, templateId);
  }, [syncLatexFromPreview, templateId]);

  const handleResumeUpdate = useCallback((updated: ResumeData) => {
    setTailored(updated);
    syncLatexFromPreview(updated, templateId);
  }, [syncLatexFromPreview, templateId]);

  const applyTemplate = async (tpl: string) => {
    if (!tailored || tpl === templateId) return;
    setIsSwitchingTpl(true);
    setTemplateId(tpl);
    setError(null);
    try {
      const token = await getAccessToken(supabase);
      const latex = await fetchLatex(tailored, tpl, token);
      setLatexCode(latex);
      persistCache(tailored, latex, tpl, jobTitle, company);
      const profileRes = await fetch(`${API_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (profileRes.ok) {
        const pd = await profileRes.json();
        const existing = pd.profile || {};
        const pi = typeof existing.personal_info === "object" ? { ...existing.personal_info } : {};
        await fetch(`${API_URL}/profile`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            personal_info: { ...pi, resume_template: tpl },
            full_name: existing.full_name,
            email: existing.email,
          }),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Template switch failed");
    } finally {
      setIsSwitchingTpl(false);
    }
  };

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    const init = async () => {
      const dataStr = localStorage.getItem("latex_job_data");
      if (!dataStr) {
        setError("No job selected. Go to Dashboard and pick a job.");
        setLoadingMsg("");
        return;
      }
      const jobData = JSON.parse(dataStr);
      const jt = jobData.job_title || "";
      const co = jobData.company || "";
      const key = jobCacheKey(jobData);
      jobKeyRef.current = key;
      setJobTitle(jt);
      setCompany(co);

      const token = await getAccessToken(supabase);
      if (!token) {
        setError("Please sign in.");
        setLoadingMsg("");
        return;
      }

      const cached = loadEditorCache(key);
      if (cached) {
        setTailored(cached.tailored);
        setLatexCode(cached.latexCode);
        setTemplateId(cached.templateId);
        setLoadingMsg("");
        try {
          const tplRes = await fetch(`${API_URL}/templates`);
          if (tplRes.ok) {
            const td = await tplRes.json();
            setTemplates(td.templates || []);
          }
        } catch {
          /* non-fatal */
        }
        return;
      }

      try {
        const tplRes = await fetch(`${API_URL}/templates`);
        if (tplRes.ok) {
          const td = await tplRes.json();
          setTemplates(td.templates || []);
        }

        let tpl = "jakes_resume";
        const profileRes = await fetch(`${API_URL}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (profileRes.ok) {
          const pd = await profileRes.json();
          const pi = pd.profile?.personal_info;
          const parsed = typeof pi === "string" ? JSON.parse(pi) : pi;
          if (parsed?.resume_template) tpl = parsed.resume_template;
          setTemplateId(tpl);
        }

        setLoadingMsg("AI is tailoring your one-page resume…");
        const genRes = await fetch(`${API_URL}/tailor/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(jobData),
        });
        if (!genRes.ok) {
          const err = await genRes.json().catch(() => ({}));
          throw new Error(err.detail || "Tailoring failed");
        }
        const genData = await genRes.json();
        setTailored(genData.tailored);
        const latex = await fetchLatex(genData.tailored, tpl, token);
        setLatexCode(latex);
        persistCache(genData.tailored, latex, tpl, jt, co);
        setLoadingMsg("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load resume");
        setLoadingMsg("");
      }
    };
    init();
  }, [supabase, fetchLatex, persistCache]);

  const handleDownload = async () => {
    setIsDownloading(true);
    setError(null);
    try {
      const { downloadResumePdf } = await import("../../lib/downloadResumePdf");
      await downloadResumePdf("resume-print-area");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setIsDownloading(false);
    }
  };

  if (loadingMsg && !tailored) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f0f0f2]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-accent-cyan border-t-transparent" />
          <p className="font-[family-name:var(--font-syne)] text-lg font-bold">{loadingMsg}</p>
          <p className="mt-2 text-sm text-muted">Picking your 2 best projects and 3 most recent roles…</p>
        </div>
      </div>
    );
  }

  const theme = themeForTemplate(templateId);

  return (
    <div className="flex h-screen flex-col bg-[#f0f0f2]">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#ddd] bg-white px-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="text-xs text-[#666] hover:text-[#111]">
            ← Dashboard
          </button>
          <span className="text-[#ccc]">|</span>
          <h1 className="text-sm font-semibold text-[#222]">
            Resume Editor
            {jobTitle && <span className="ml-1 font-normal text-[#888]">for {jobTitle}</span>}
          </h1>
        </div>
        <button
          onClick={handleDownload}
          disabled={isDownloading || !tailored}
          className="rounded-lg bg-gradient-to-r from-accent-cyan to-accent-violet px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {isDownloading ? "Generating PDF…" : "⬇ Download PDF"}
        </button>
      </header>

      {error && (
        <div className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-center text-xs text-red-600">
          {error}
        </div>
      )}

      <div className="shrink-0 border-b border-[#ddd] bg-white px-3 py-2">
        <p className="mb-1.5 text-[10px] uppercase tracking-wider text-[#999]">Templates — click to switch layout</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(templates.length ? templates : [{ id: templateId, name: templateId, description: "" }]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t.id)}
              disabled={isSwitchingTpl}
              className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-all hover:scale-[1.02] hover:shadow-md ${
                templateId === t.id
                  ? "border-accent-cyan bg-accent-cyan/10 ring-1 ring-accent-cyan"
                  : "border-[#ddd] bg-[#fafafa] hover:border-accent-cyan/50"
              }`}
            >
              <span className="block text-xs font-semibold text-[#222]">{t.name}</span>
              <span className="block max-w-[140px] truncate text-[10px] text-[#888]">{t.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-[#eee] bg-white px-4 py-1.5 text-[10px] text-[#888]">
            Edit like Google Docs — click any text to change it. Changes apply to this job&apos;s resume only, not your profile.
          </div>
          {tailored ? (
              <EditableResumePreview
                key={templateId}
                data={tailored}
                templateId={templateId}
                theme={theme}
                jobTitle={jobTitle}
                printId="resume-print-area"
                onChange={handlePreviewChange}
                editable
              />
          ) : null}
        </div>

        <div className="w-[280px] shrink-0">
          <ResumeEditorAI
            resume={tailored}
            jobTitle={jobTitle}
            company={company}
            onResumeUpdate={handleResumeUpdate}
          />
        </div>
      </div>
    </div>
  );
}
