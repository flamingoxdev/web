"use client";

import { useEffect, useRef } from "react";

interface ResumeData {
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
  };
  summary?: string;
  skills?: {
    technical?: string[];
    soft?: string[];
  };
  work_experience?: Array<{
    title?: string;
    company?: string;
    location?: string;
    duration?: string;
    bullets?: string[] | string;
  }>;
  projects?: Array<{
    name?: string;
    description?: string;
    technologies?: string[] | string;
    url?: string;
    highlights?: string[] | string;
  }>;
  education?: Array<{
    degree?: string;
    school?: string;
    location?: string;
    year?: string;
    gpa?: string;
    relevant_coursework?: string[] | string;
  }>;
}

// Defensive coercion: backend / older records sometimes store these as a
// comma-separated string instead of an array. Never trust the shape.
function toArray(value: string[] | string | undefined | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string") {
    return value
      .split(/[,\n;•]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

interface ResumePreviewProps {
  data: ResumeData;
  templateId?: string;
  className?: string;
}

export default function ResumePreview({
  data,
  templateId = "jakes",
  className = "",
}: ResumePreviewProps) {
  const { contact = {}, summary, skills, work_experience = [], projects = [], education = [] } = data;

  const allTech = skills?.technical || [];
  const allSoft = skills?.soft || [];
  const allSkills = [...allTech, ...allSoft];

  return (
    <div
      className={`resume-preview bg-white text-[#2a1523] font-sans ${className}`}
      style={{
        width: "100%",
        maxWidth: "800px",
        minHeight: "1000px",
        padding: "40px 48px",
        fontSize: "10.5pt",
        lineHeight: "1.45",
        fontFamily: "'Times New Roman', Georgia, serif",
        boxShadow: "0 4px 32px rgba(0,0,0,0.12)",
        borderRadius: "4px",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <header style={{ textAlign: "center", borderBottom: "2px solid #2a1523", paddingBottom: "8px", marginBottom: "10px" }}>
        {contact.name && (
          <h1 style={{ fontSize: "22pt", fontWeight: 700, margin: "0 0 4px", letterSpacing: "0.5px" }}>
            {contact.name}
          </h1>
        )}
        <div style={{ fontSize: "9.5pt", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "6px" }}>
          {contact.phone && <span>{contact.phone}</span>}
          {contact.phone && contact.email && <span>·</span>}
          {contact.email && (
            <a href={`mailto:${contact.email}`} style={{ color: "#2a1523", textDecoration: "underline" }}>
              {contact.email}
            </a>
          )}
          {(contact.phone || contact.email) && contact.linkedin && <span>·</span>}
          {contact.linkedin && (
            <a href={contact.linkedin} style={{ color: "#2a1523", textDecoration: "underline" }}>
              {contact.linkedin.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          )}
          {contact.linkedin && contact.github && <span>·</span>}
          {contact.github && (
            <a href={contact.github} style={{ color: "#2a1523", textDecoration: "underline" }}>
              {contact.github.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          )}
          {(contact.linkedin || contact.github) && contact.location && <span>·</span>}
          {contact.location && <span>{contact.location}</span>}
        </div>
      </header>

      {/* ── Summary ─────────────────────────────────────────────── */}
      {summary && (
        <Section title="Summary">
          <p style={{ margin: 0, textAlign: "justify" }}>{summary}</p>
        </Section>
      )}

      {/* ── Education ───────────────────────────────────────────── */}
      {education.length > 0 && (
        <Section title="Education">
          {education.map((ed, i) => (
            <div key={i} style={{ marginBottom: i < education.length - 1 ? "8px" : 0 }}>
              <EntryHeader
                left={<><strong>{ed.school}</strong>{ed.location ? `, ${ed.location}` : ""}</>}
                right={ed.year}
              />
              <EntryHeader
                left={<em>{ed.degree}{ed.gpa ? ` · GPA: ${ed.gpa}` : ""}</em>}
                right=""
              />
              {toArray(ed.relevant_coursework).length > 0 && (
                <p style={{ margin: "2px 0 0 0", fontSize: "9.5pt" }}>
                  <strong>Relevant Coursework:</strong> {toArray(ed.relevant_coursework).join(", ")}
                </p>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* ── Experience ──────────────────────────────────────────── */}
      {work_experience.length > 0 && (
        <Section title="Experience">
          {work_experience.map((job, i) => (
            <div key={i} style={{ marginBottom: i < work_experience.length - 1 ? "10px" : 0 }}>
              <EntryHeader
                left={<><strong>{job.company}</strong>{job.location ? `, ${job.location}` : ""}</>}
                right={job.duration}
              />
              <EntryHeader left={<em>{job.title}</em>} right="" />
              {toArray(job.bullets).length > 0 && (
                <ul style={{ margin: "3px 0 0 0", paddingLeft: "16px" }}>
                  {toArray(job.bullets).map((b, bi) => (
                    <li key={bi} style={{ marginBottom: "2px" }}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* ── Projects ────────────────────────────────────────────── */}
      {projects.length > 0 && (
        <Section title="Projects">
          {projects.map((proj, i) => (
            <div key={i} style={{ marginBottom: i < projects.length - 1 ? "8px" : 0 }}>
              <EntryHeader
                left={
                  <>
                    <strong>{proj.name}</strong>
                    {toArray(proj.technologies).length > 0 && (
                      <span style={{ fontWeight: 400 }}> | {toArray(proj.technologies).join(", ")}</span>
                    )}
                  </>
                }
                right={proj.url ? (
                  <a href={proj.url} style={{ color: "#2a1523", textDecoration: "underline", fontSize: "9pt" }}>
                    {proj.url.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                ) : ""}
              />
              {proj.description && (
                <p style={{ margin: "2px 0 0 0", fontSize: "9.5pt" }}>{proj.description}</p>
              )}
              {toArray(proj.highlights).length > 0 && (
                <ul style={{ margin: "3px 0 0 0", paddingLeft: "16px" }}>
                  {toArray(proj.highlights).map((h, hi) => (
                    <li key={hi} style={{ marginBottom: "2px" }}>{h}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* ── Skills ──────────────────────────────────────────────── */}
      {allSkills.length > 0 && (
        <Section title="Technical Skills">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9.5pt" }}>
            <tbody>
              {allTech.length > 0 && (
                <tr>
                  <td style={{ width: "140px", fontWeight: 600, verticalAlign: "top", paddingBottom: "3px" }}>Languages:</td>
                  <td>{allTech.slice(0, 8).join(", ")}</td>
                </tr>
              )}
              {allTech.length > 8 && (
                <tr>
                  <td style={{ width: "140px", fontWeight: 600, verticalAlign: "top", paddingBottom: "3px" }}>Frameworks:</td>
                  <td>{allTech.slice(8, 16).join(", ")}</td>
                </tr>
              )}
              {allTech.length > 16 && (
                <tr>
                  <td style={{ width: "140px", fontWeight: 600, verticalAlign: "top", paddingBottom: "3px" }}>Tools / Platforms:</td>
                  <td>{allTech.slice(16).join(", ")}</td>
                </tr>
              )}
              {allSoft.length > 0 && (
                <tr>
                  <td style={{ width: "140px", fontWeight: 600, verticalAlign: "top" }}>Soft Skills:</td>
                  <td>{allSoft.join(", ")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "14px" }}>
      <h2
        style={{
          fontSize: "11pt",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.8px",
          borderBottom: "1px solid #2a1523",
          paddingBottom: "2px",
          marginBottom: "7px",
          marginTop: 0,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function EntryHeader({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "10.5pt" }}>
      <span>{left}</span>
      <span style={{ fontSize: "9.5pt", whiteSpace: "nowrap", marginLeft: "8px" }}>{right}</span>
    </div>
  );
}
