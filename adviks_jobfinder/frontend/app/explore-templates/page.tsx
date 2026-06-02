"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "../components/Header";
import { API_URL } from "../lib/api";
import { themeForTemplate, TEMPLATE_THEMES, type TemplateMeta } from "../lib/templates";

const EXHIBIT_TAGS: Record<string, string[]> = {
  jakes_resume: ["Classic", "ATS-friendly"],
  classic_jake: ["Traditional", "Serif"],
  executive_timeline: ["Executive", "Timeline"],
  bold_header: ["Modern", "Two-tone"],
  minimalist_elegant: ["Minimal", "Elegant"],
  pure_white: ["Clean", "Simple"],
  two_column_sidebar: ["Creative", "Sidebar"],
  corporate_banking: ["Corporate", "Finance"],
  startup_compact: ["Startup", "Compact"],
  academic_cv: ["Academic", "Research"],
};

function MiniPreview({ id }: { id: string }) {
  const theme = themeForTemplate(id);
  return (
    <div
      className="relative flex h-full min-h-[220px] flex-col overflow-hidden rounded-xl border border-border bg-white shadow-inner"
      style={{ fontFamily: theme.font }}
    >
      <div
        className="h-2 w-full shrink-0"
        style={{ background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2 || theme.accent})` }}
      />
      <div className="flex flex-1 flex-col p-5">
        <div
          className="text-lg font-bold tracking-tight"
          style={{ color: theme.accent, textAlign: theme.header }}
        >
          Alex Rivera
        </div>
        <div
          className="mt-1 text-[10px] text-neutral-500"
          style={{ textAlign: theme.header }}
        >
          Software Engineer · San Francisco, CA
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-1.5 w-16 rounded bg-neutral-200" />
          <div className="h-1 w-full rounded bg-neutral-100" />
          <div className="h-1 w-11/12 rounded bg-neutral-100" />
          <div className="h-1 w-4/5 rounded bg-neutral-100" />
        </div>
        <div className="mt-auto pt-4">
          <div className="h-1 w-20 rounded" style={{ backgroundColor: theme.accent, opacity: 0.35 }} />
          <div className="mt-2 h-1 w-full rounded bg-neutral-100" />
          <div className="mt-1 h-1 w-3/4 rounded bg-neutral-100" />
        </div>
      </div>
    </div>
  );
}

export default function ExploreTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/templates`);
        if (res.ok) {
          const data = await res.json();
          const list = (data.templates || []).filter((t: TemplateMeta) => t.available !== false);
          if (list.length) {
            setTemplates(list);
          } else {
            setTemplates(
              Object.keys(TEMPLATE_THEMES).map((id) => ({
                id,
                name: id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                description: "Professional resume layout",
                available: true,
              }))
            );
          }
        }
      } catch {
        /* fallback to local themes */
        setTemplates(
          Object.keys(TEMPLATE_THEMES).map((id) => ({
            id,
            name: id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            description: "Professional resume layout",
            available: true,
          }))
        );
      }
      setLoading(false);
    })();
  }, []);

  const allTags = Array.from(
    new Set(templates.flatMap((t) => EXHIBIT_TAGS[t.id] || ["Professional"]))
  ).sort();

  const filtered =
    filter === "all"
      ? templates
      : templates.filter((t) => (EXHIBIT_TAGS[t.id] || []).includes(filter));

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div className="absolute -left-32 top-20 h-96 w-96 rounded-full bg-accent-violet/10 blur-[100px]" />
        <div className="absolute -right-20 bottom-20 h-80 w-80 rounded-full bg-accent-cyan/10 blur-[90px]" />
      </div>

      <Header />

      <main className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <section className="mb-12 text-center">
          <p className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-xs uppercase tracking-widest text-accent-cyan">
            Template Gallery
          </p>
          <h1 className="font-[family-name:var(--font-syne)] text-4xl font-bold tracking-tight sm:text-5xl">
            Explore Templates
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-muted leading-relaxed">
            Browse our curated exhibition of resume layouts. Each template is designed for one-page,
            ATS-friendly output. Pick one when you reach the edit step in Build your resume.
          </p>
          <Link
            href="/dashboard?step=4"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-violet px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02]"
          >
            Start building →
          </Link>
        </section>

        <div className="mb-8 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
              filter === "all"
                ? "bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30"
                : "border border-border text-muted hover:text-foreground"
            }`}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setFilter(tag)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                filter === tag
                  ? "bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30"
                  : "border border-border text-muted hover:text-foreground"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-accent-cyan/30 border-t-accent-cyan" />
          </div>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t, idx) => {
              const tags = EXHIBIT_TAGS[t.id] || ["Professional"];
              const theme = themeForTemplate(t.id);
              return (
                <article
                  key={t.id}
                  className="group animate-slide-up glass-card overflow-hidden transition hover:shadow-xl hover:shadow-accent-cyan/5"
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  <div className="p-4 pb-0">
                    <MiniPreview id={t.id} />
                  </div>
                  <div className="p-5">
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-muted"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold">{t.name}</h2>
                    <p className="mt-1 text-xs text-muted line-clamp-2">{t.description}</p>
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-muted">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: theme.accent }}
                      />
                      Accent {theme.layout.replace(/_/g, " ")} layout
                    </div>
                    <Link
                      href={`/dashboard?step=4`}
                      className="mt-4 block w-full rounded-lg border border-border py-2.5 text-center text-xs font-semibold text-foreground transition group-hover:border-accent-cyan group-hover:text-accent-cyan"
                    >
                      Use in Resume Builder
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
