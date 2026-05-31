"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "../components/Header";
import { createClient } from "../lib/supabase";
import { API_URL } from "../lib/api";
import { getAccessToken } from "../lib/authToken";
import { themeForTemplate, type TemplateMeta } from "../lib/templates";

export default function TemplatesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [selected, setSelected] = useState("jakes_resume");
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromOnboarding, setFromOnboarding] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getAccessToken(supabase);
        const tplRes = await fetch(`${API_URL}/templates`);
        if (tplRes.ok) {
          const data = await tplRes.json();
          setTemplates((data.templates || []).filter((t: TemplateMeta) => t.available !== false));
        }
        if (!token) { setLoading(false); return; }
        const res = await fetch(`${API_URL}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const pi = data.profile?.personal_info;
          const parsed = typeof pi === "string" ? JSON.parse(pi) : pi;
          if (parsed?.resume_template) setSelected(parsed.resume_template);
        }
        const statusRes = await fetch(`${API_URL}/onboarding/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (statusRes.ok) {
          const st = await statusRes.json();
          setFromOnboarding(st.profile_complete && !st.has_template);
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, [supabase]);

  const handleSave = async (goDashboard = true) => {
    setSaving(true);
    setError(null);
    try {
      const token = await getAccessToken(supabase);
      if (!token) throw new Error("Not signed in");

      const profileRes = await fetch(`${API_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const profileData = await profileRes.json();
      const existing = profileData.profile || {};
      const pi = typeof existing.personal_info === "object" ? { ...existing.personal_info } : {};

      const res = await fetch(`${API_URL}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          personal_info: { ...pi, resume_template: selected },
          full_name: existing.full_name || pi.full_name,
          email: existing.email || pi.email,
        }),
      });
      if (!res.ok) throw new Error("Failed to save template");
      if (goDashboard) router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-screen">
      <Header />
      <main className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {fromOnboarding && (
          <div className="mb-6 rounded-xl border border-accent-emerald/20 bg-accent-emerald/5 px-4 py-3 text-sm">
            <strong>Step 2:</strong> Pick a resume template. You can change it anytime from this page or while editing a tailored resume.
          </div>
        )}
        <h1 className="mb-2 font-[family-name:var(--font-syne)] text-3xl font-bold">Templates</h1>
        <p className="mb-8 text-sm text-muted max-w-2xl">
          Choose a layout — no LaTeX, just pick and go. When you apply to jobs, AI builds a one-page resume (3 experiences, 2 projects) in this style.
          Edit the preview like Google Docs; PDF export happens automatically.
        </p>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-cyan/30 border-t-accent-cyan" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
            {templates.map((t) => {
              const theme = themeForTemplate(t.id);
              const isSel = selected === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={`glass-card p-4 text-left transition-all hover:scale-[1.02] hover:shadow-lg ${
                    isSel ? "ring-2 ring-accent-cyan border-accent-cyan/40" : ""
                  }`}
                >
                  <div
                    className="mb-3 flex h-28 flex-col justify-center rounded-lg border border-border px-3"
                    style={{ fontFamily: theme.font, borderTopColor: theme.accent, borderTopWidth: 3 }}
                  >
                    <div className="text-sm font-bold" style={{ color: theme.accent, textAlign: theme.header as "left" | "center" }}>
                      Your Name
                    </div>
                    <div className="mt-1 text-[9px] text-muted" style={{ textAlign: theme.header as "left" | "center" }}>
                      Summary · Experience · Projects
                    </div>
                  </div>
                  <h3 className="font-[family-name:var(--font-syne)] text-sm font-bold mb-1">{t.name}</h3>
                  <p className="text-xs text-muted">{t.description}</p>
                  {isSel && (
                    <span className="mt-2 inline-block rounded-full bg-accent-cyan/10 px-2 py-0.5 text-[10px] text-accent-cyan font-semibold">
                      Selected
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="mb-4 text-sm text-accent-coral">{error}</p>}

        <div className="flex justify-end gap-3">
          {!fromOnboarding && (
            <button
              onClick={() => handleSave(false)}
              disabled={saving || loading}
              className="rounded-xl border border-border px-6 py-3 text-sm font-semibold hover:bg-surface-raised disabled:opacity-50"
            >
              Save Template
            </button>
          )}
          <button
            onClick={() => handleSave(true)}
            disabled={saving || loading}
            className="rounded-xl bg-gradient-to-r from-accent-cyan to-accent-violet px-8 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : fromOnboarding ? "Continue to Dashboard →" : "Save & Go to Dashboard →"}
          </button>
        </div>
      </main>
    </div>
  );
}
