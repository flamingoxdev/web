"use client";

import type { ReactNode } from "react";
import type { TemplateTheme } from "../lib/templates";

export interface PreviewSections {
  summary: ReactNode;
  education: ReactNode;
  experience: ReactNode;
  projects: ReactNode;
  skills: ReactNode;
}

interface LayoutProps {
  theme: TemplateTheme;
  name: ReactNode;
  contactLine: ReactNode;
  jobTagline?: string;
  /** Startup template: summary lives in the header, not as a bottom section */
  headerSummary?: ReactNode;
  sections: PreviewSections;
}

function SectionHeading({
  title,
  accent,
  accent2,
  style = "default",
}: {
  title: string;
  accent: string;
  accent2?: string;
  style?: "default" | "timeline" | "sidebar" | "startup" | "elegant" | "creative";
}) {
  if (style === "timeline") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, marginTop: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent2 || accent, flexShrink: 0 }} />
        <h2 style={{ margin: 0, fontSize: "11pt", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.6px" }}>
          {title}
        </h2>
      </div>
    );
  }
  if (style === "startup") {
    return (
      <div style={{ marginBottom: 8, marginTop: 12 }}>
        <h2 style={{ margin: 0, fontSize: "12pt", fontWeight: 700, color: accent2 || "#2D3436", display: "inline" }}>
          {title}
        </h2>
        <span style={{ display: "inline-block", width: "55%", height: 2, background: accent, marginLeft: 8, verticalAlign: "middle" }} />
      </div>
    );
  }
  if (style === "elegant") {
    return (
      <div style={{ marginBottom: 8, marginTop: 12 }}>
        <h2 style={{ margin: 0, fontSize: "11pt", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {title}
        </h2>
        <div style={{ height: 2, background: accent2 || accent, marginTop: 4, opacity: 0.85 }} />
      </div>
    );
  }
  if (style === "sidebar") {
    return (
      <div style={{ marginBottom: 6, marginTop: 10 }}>
        <div style={{ height: 2, background: accent, marginBottom: 4 }} />
        <h2 style={{ margin: 0, fontSize: "11pt", fontWeight: 700, color: "#fff" }}>{title}</h2>
      </div>
    );
  }
  if (style === "creative") {
    return (
      <div style={{ marginBottom: 6, marginTop: 10 }}>
        <span style={{ display: "inline-block", background: accent, color: "#fff", fontSize: "9pt", fontWeight: 700, padding: "2px 8px", borderRadius: 2 }}>
          {title}
        </span>
      </div>
    );
  }
  return (
    <h2
      style={{
        fontSize: "10pt",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.7px",
        borderBottom: `1px solid ${accent}`,
        paddingBottom: 2,
        marginBottom: 8,
        marginTop: 0,
        color: accent,
      }}
    >
      {title}
    </h2>
  );
}

function wrap(title: string, node: ReactNode, theme: TemplateTheme, style: Parameters<typeof SectionHeading>[0]["style"]) {
  if (!node) return null;
  return (
    <section style={{ marginBottom: 14 }}>
      <SectionHeading title={title} accent={theme.accent} accent2={theme.accent2} style={style} />
      {node}
    </section>
  );
}

export function TemplatePreviewLayout({ theme, name, contactLine, jobTagline, headerSummary, sections }: LayoutProps) {
  const { layout, accent, accent2, banner, sidebar, header, textMuted } = theme;

  if (layout === "bold_header") {
    return (
      <>
        <div style={{ background: banner || "#212F3C", color: "#fff", margin: "-0.55in -0.6in 16px", padding: "20px 24px 18px", textAlign: "center" }}>
          <div style={{ fontSize: "20pt", fontWeight: 700, marginBottom: 4 }}>{name}</div>
          {jobTagline && <div style={{ color: accent, fontSize: "11pt", marginBottom: 8 }}>{jobTagline}</div>}
          <div style={{ fontSize: "8.5pt", opacity: 0.95 }}>{contactLine}</div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: "0 0 34%", background: sidebar || "#EBF5FB", marginLeft: -8, padding: "12px 10px", borderRadius: 4 }}>
            {wrap("Education", sections.education, theme, "default")}
            {wrap("Technical Skills", sections.skills, theme, "default")}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {wrap("Summary", sections.summary, theme, "default")}
            {wrap("Experience", sections.experience, theme, "default")}
            {wrap("Projects", sections.projects, theme, "default")}
          </div>
        </div>
      </>
    );
  }

  if (layout === "executive_timeline") {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "22pt", fontWeight: 700, color: accent, lineHeight: 1.1 }}>{name}</div>
            <div style={{ width: 80, height: 3, background: accent2, margin: "6px 0" }} />
            {jobTagline && <div style={{ color: textMuted, fontSize: "10pt" }}>{jobTagline}</div>}
          </div>
          <div style={{ textAlign: "right", fontSize: "8.5pt", color: textMuted, lineHeight: 1.6 }}>{contactLine}</div>
        </div>
        <div style={{ height: 2, background: accent, marginBottom: 2 }} />
        <div style={{ height: 3, background: accent2, marginBottom: 14 }} />
        {wrap("Summary", sections.summary, theme, "timeline")}
        {wrap("Education", sections.education, theme, "timeline")}
        {wrap("Experience", sections.experience, theme, "timeline")}
        {wrap("Projects", sections.projects, theme, "timeline")}
        {wrap("Technical Skills", sections.skills, theme, "timeline")}
      </>
    );
  }

  if (layout === "sidebar") {
    return (
      <div style={{ display: "flex", margin: "-0.55in -0.6in", minHeight: "calc(11in - 0.5in)" }}>
        <div style={{ flex: "0 0 32%", background: sidebar || "#1A1A2E", color: "#fff", padding: "20px 14px" }}>
          <div style={{ fontSize: "16pt", fontWeight: 700, marginBottom: 12, lineHeight: 1.2 }}>{name}</div>
          <div style={{ fontSize: "8.5pt", color: "#aaa", lineHeight: 1.7, marginBottom: 16 }}>{contactLine}</div>
          {wrap("Skills", sections.skills, theme, "sidebar")}
          {wrap("Education", sections.education, theme, "sidebar")}
        </div>
        <div style={{ flex: 1, padding: "20px 18px", background: "#fff" }}>
          {wrap("Summary", sections.summary, theme, "default")}
          {wrap("Experience", sections.experience, theme, "default")}
          {wrap("Projects", sections.projects, theme, "default")}
        </div>
      </div>
    );
  }

  if (layout === "startup") {
    const startupSection = (title: string, node: ReactNode) => {
      if (!node) return null;
      return (
        <section style={{ marginBottom: 5 }}>
          <div style={{ marginBottom: 3, marginTop: 2 }}>
            <h2 style={{ margin: 0, fontSize: "10.5pt", fontWeight: 700, color: accent2 || "#2D3436", display: "inline" }}>
              {title}
            </h2>
            <span
              style={{
                display: "inline-block",
                width: "48%",
                height: 2,
                background: accent,
                marginLeft: 6,
                verticalAlign: "middle",
              }}
            />
          </div>
          {node}
        </section>
      );
    };

    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 5, gap: 10 }}>
          <div style={{ flex: "0 0 62%", minWidth: 0 }}>
            <div style={{ fontSize: "16pt", fontWeight: 700, color: accent2, lineHeight: 1.15 }}>{name}</div>
            {jobTagline && (
              <div style={{ color: accent, fontSize: "10pt", fontWeight: 600, marginTop: 2, lineHeight: 1.2 }}>{jobTagline}</div>
            )}
            {headerSummary && (
              <div style={{ fontSize: "8.5pt", color: textMuted || "#636E72", marginTop: 3, lineHeight: 1.32 }}>{headerSummary}</div>
            )}
          </div>
          <div style={{ flex: "0 0 34%", textAlign: "right", fontSize: "8pt", color: textMuted || "#636E72", lineHeight: 1.45 }}>
            {contactLine}
          </div>
        </div>
        <div style={{ height: 2, background: accent, marginBottom: 6 }} />
        {startupSection("Experience", sections.experience)}
        {startupSection("Projects", sections.projects)}
        {startupSection("Education", sections.education)}
        {startupSection("Technical Skills", sections.skills)}
      </>
    );
  }

  if (layout === "elegant") {
    return (
      <>
        <div style={{ margin: "-0.55in -0.6in 16px" }}>
          <div style={{ height: 8, background: accent }} />
          <div style={{ height: 3, background: accent2 }} />
        </div>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: "20pt", fontWeight: 700, color: accent, letterSpacing: "0.5px" }}>{name}</div>
          {jobTagline && <div style={{ color: textMuted || "#555", fontSize: "9.5pt", marginTop: 4 }}>{jobTagline}</div>}
          <div style={{ fontSize: "8.5pt", color: textMuted || "#999", marginTop: 6 }}>{contactLine}</div>
        </div>
        {wrap("Summary", sections.summary, theme, "elegant")}
        {wrap("Education", sections.education, theme, "elegant")}
        {wrap("Experience", sections.experience, theme, "elegant")}
        {wrap("Projects", sections.projects, theme, "elegant")}
        {wrap("Skills", sections.skills, theme, "elegant")}
      </>
    );
  }

  if (layout === "corporate") {
    return (
      <>
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div style={{ fontSize: "18pt", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "1px" }}>{name}</div>
          <div style={{ fontSize: "9pt", color: accent2, marginTop: 6 }}>{contactLine}</div>
        </div>
        <div style={{ height: 2, background: accent, marginBottom: 14 }} />
        {wrap("Summary", sections.summary, theme, "default")}
        {wrap("Education", sections.education, theme, "default")}
        {wrap("Professional Experience", sections.experience, theme, "default")}
        {wrap("Projects", sections.projects, theme, "default")}
        {wrap("Skills", sections.skills, theme, "default")}
      </>
    );
  }

  if (layout === "creative") {
    return (
      <div style={{ display: "flex", margin: "-0.55in -0.6in", minHeight: "calc(11in - 0.5in)" }}>
        <div style={{ flex: "0 0 32%", background: sidebar || "#2D3436", color: "#fff", padding: "16px 12px" }}>
          <div style={{ marginBottom: 12 }}>{name}</div>
          <div style={{ fontSize: "8pt", color: "#ccc", lineHeight: 1.6, marginBottom: 12 }}>{contactLine}</div>
          {wrap("Skills", sections.skills, theme, "creative")}
        </div>
        <div style={{ flex: 1, padding: "16px 14px" }}>
          {wrap("Summary", sections.summary, theme, "default")}
          {wrap("Experience", sections.experience, theme, "creative")}
          {wrap("Projects", sections.projects, theme, "creative")}
          {wrap("Education", sections.education, theme, "default")}
        </div>
      </div>
    );
  }

  if (layout === "academic") {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: "20pt", fontWeight: 700, color: "#222" }}>{name}</div>
            {jobTagline && <div style={{ color: textMuted, fontStyle: "italic", fontSize: "10pt", marginTop: 4 }}>{jobTagline}</div>}
          </div>
          <div style={{ textAlign: "right", fontSize: "8.5pt", color: textMuted, lineHeight: 1.7 }}>{contactLine}</div>
        </div>
        {wrap("Summary", sections.summary, theme, "default")}
        {wrap("Education", sections.education, theme, "default")}
        {wrap("Research & Experience", sections.experience, theme, "default")}
        {wrap("Projects", sections.projects, theme, "default")}
        {wrap("Technical Skills", sections.skills, theme, "default")}
      </>
    );
  }

  return (
    <>
      <header style={{ textAlign: header, borderBottom: `2px solid ${accent}`, paddingBottom: 8, marginBottom: 12 }}>
        <div style={{ fontSize: "17pt", fontWeight: 700, marginBottom: 4 }}>{name}</div>
        <div style={{ fontSize: "9pt", display: "flex", flexWrap: "wrap", justifyContent: header === "left" ? "flex-start" : "center", gap: "4px 6px" }}>
          {contactLine}
        </div>
      </header>
      {wrap("Summary", sections.summary, theme, "default")}
      {wrap("Education", sections.education, theme, "default")}
      {wrap("Experience", sections.experience, theme, "default")}
      {wrap("Projects", sections.projects, theme, "default")}
      {wrap("Technical Skills", sections.skills, theme, "default")}
    </>
  );
}
