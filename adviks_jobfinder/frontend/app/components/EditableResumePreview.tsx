"use client";

import { useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { TemplatePreviewLayout } from "./TemplatePreviewLayout";
import { themeForTemplate, type TemplateTheme } from "../lib/templates";

export interface ResumeData {
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
  };
  summary?: string;
  skills?: { technical?: string[]; soft?: string[] };
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
    honors?: string;
    distinction?: string;
    relevant_coursework?: string[] | string;
  }>;
}

export interface PreviewTheme {
  accent: string;
  header: string;
  font: string;
}

function toArray(value: string[] | string | undefined | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string") {
    return value.split(/[,\n;•]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

const FONT_SIZES = ["8pt", "9pt", "9.5pt", "10pt", "11pt", "12pt"] as const;

interface EditableResumePreviewProps {
  data: ResumeData;
  onChange?: (data: ResumeData) => void;
  editable?: boolean;
  className?: string;
  printId?: string;
  templateId?: string;
  theme?: TemplateTheme | PreviewTheme;
  jobTitle?: string;
}

function Editable({
  value,
  editable,
  className,
  style,
  onEdit,
  tag: Tag = "span",
}: {
  value: string;
  editable: boolean;
  className?: string;
  style?: React.CSSProperties;
  onEdit: (v: string) => void;
  tag?: "span" | "p" | "h1" | "li" | "em" | "strong" | "div";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (!ref.current || focused.current) return;
    if (ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  }, [value]);

  return (
    <Tag
      ref={(el: HTMLElement | null) => { ref.current = el; }}
      contentEditable={editable}
      suppressContentEditableWarning
      className={editable ? `outline-none focus:ring-1 focus:ring-accent-cyan/40 rounded-sm ${className || ""}` : className}
      style={style}
      onFocus={() => { focused.current = true; }}
      onBlur={(e) => {
        focused.current = false;
        onEdit((e.currentTarget.textContent || "").trim());
      }}
    >
      {value}
    </Tag>
  );
}

export default function EditableResumePreview({
  data,
  onChange,
  editable = true,
  className = "",
  printId = "resume-print-area",
  templateId = "jakes_resume",
  theme: themeProp,
  jobTitle = "",
}: EditableResumePreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef<HTMLDivElement>(null);
  const tplTheme = themeProp && "layout" in themeProp ? themeProp : themeForTemplate(templateId);
  const accent = tplTheme.accent || "#2a1523";
  const textMuted = tplTheme.textMuted || "#636E72";
  const fontFamily = tplTheme.font || "'Times New Roman', Georgia, serif";
  const isStartup = tplTheme.layout === "startup";
  const { contact = {}, summary, skills, work_experience = [], projects = [], education = [] } = data;
  const allTech = skills?.technical || [];
  const allSoft = skills?.soft || [];
  const canEdit = editable && !!onChange;

  const patch = useCallback(
    (partial: Partial<ResumeData>) => {
      onChange?.({ ...data, ...partial });
    },
    [data, onChange]
  );

  const getActiveEditable = useCallback((): HTMLElement | null => {
    const sel = window.getSelection();
    const active = sel?.anchorNode
      ? sel.anchorNode.nodeType === Node.TEXT_NODE
        ? sel.anchorNode.parentElement
        : (sel.anchorNode as HTMLElement)
      : null;
    const target = active?.closest("[contenteditable=true]") as HTMLElement | null;
    if (!target || !rootRef.current?.contains(target)) return null;
    return target;
  }, []);

  const exec = (cmd: string, val?: string) => {
    const target = getActiveEditable();
    if (target) {
      target.focus();
      document.execCommand(cmd, false, val);
    }
  };

  const applyFontSize = (fontSize: string) => {
    if (!canEdit || !fontSize) return;
    const target = getActiveEditable();
    if (!target) return;
    target.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    if (sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const span = document.createElement("span");
      span.style.fontSize = fontSize;
      span.appendChild(document.createTextNode("\u200B"));
      range.insertNode(span);
      range.setStart(span.firstChild!, 1);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }

    const range = sel.getRangeAt(0);
    if (!target.contains(range.commonAncestorContainer)) return;
    const span = document.createElement("span");
    span.style.fontSize = fontSize;
    try {
      range.surroundContents(span);
    } catch {
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
    }
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    newRange.collapse(false);
    sel.addRange(newRange);
  };

  const applyList = (mode: "bullet" | "number" | "add-bullet" | "remove") => {
    if (!canEdit || !rootRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    let node: Node | null = sel.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const ce = (node as HTMLElement | null)?.closest("[contenteditable=true]") as HTMLElement | null;
    if (!ce || !rootRef.current.contains(ce)) return;

    const expBlock = ce.closest("[data-exp-index]");
    if (expBlock) {
      const expIdx = Number(expBlock.getAttribute("data-exp-index"));
      const li = ce.closest("li");
      const list = ce.closest("ul, ol");
      if (!Number.isNaN(expIdx) && li && list) {
        const bullets = [...toArray(work_experience[expIdx]?.bullets)];
        const allLis = Array.from(list.querySelectorAll(":scope > li"));
        const at = Math.max(0, allLis.indexOf(li));

        if (mode === "add-bullet") {
          bullets.splice(at + 1, 0, "");
          const next = [...work_experience];
          next[expIdx] = { ...next[expIdx], bullets };
          patch({ work_experience: next });
          return;
        }
        if (mode === "remove" && bullets.length > 1) {
          bullets.splice(at, 1);
          const next = [...work_experience];
          next[expIdx] = { ...next[expIdx], bullets };
          patch({ work_experience: next });
          return;
        }
        if (mode === "number" || mode === "bullet") {
          const parent = list.parentElement;
          if (parent) {
            const replacement = document.createElement(mode === "number" ? "ol" : "ul");
            replacement.innerHTML = list.innerHTML;
            replacement.style.cssText = list.getAttribute("style") || (list as HTMLElement).style.cssText;
            parent.replaceChild(replacement, list);
          }
          return;
        }
      }
    }

    ce.focus();
    if (mode === "bullet") {
      document.execCommand("insertUnorderedList");
      return;
    }
    if (mode === "number") {
      document.execCommand("insertOrderedList");
      return;
    }
    if (mode === "remove") {
      document.execCommand("outdent");
      return;
    }
    if (mode === "add-bullet") {
      if (ce.tagName === "SPAN") {
        document.execCommand("insertText", false, "\n• ");
      } else {
        document.execCommand("insertUnorderedList");
      }
    }
  };

  const fitOnePage = useCallback(() => {
    const container = rootRef.current;
    const inner = scaleRef.current;
    if (!container || !inner) return;
    
    // Reset any previous transforms
    inner.style.transform = "none";
    inner.style.width = "100%";
    
    const baseSize = isStartup ? 9.5 : 10;
    container.style.fontSize = `${baseSize}pt`;
    container.style.lineHeight = isStartup ? "1.32" : "1.45";
    
    requestAnimationFrame(() => {
      let needed = inner.scrollHeight;
      const verticalPadding = isStartup ? 96 : 106;
      const avail = container.clientHeight - verticalPadding;
      
      if (needed > avail && avail > 0) {
        const scale = avail / needed;
        inner.style.transform = `scale(${scale})`;
        inner.style.transformOrigin = "top center";
      }
    });
  }, [isStartup]);

  useLayoutEffect(() => {
    fitOnePage();
    const ro = new ResizeObserver(() => fitOnePage());
    if (scaleRef.current) ro.observe(scaleRef.current);
    if (rootRef.current) ro.observe(rootRef.current);
    return () => ro.disconnect();
  }, [data, templateId, jobTitle, fitOnePage]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {canEdit && (
        <div className="sticky top-0 z-20 flex shrink-0 flex-wrap items-center gap-1 border-b border-[#ddd] bg-white px-3 py-2 shadow-sm print:hidden">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-[#888]">Edit</span>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); exec("bold"); }} className="rounded px-2 py-1 text-xs font-bold hover:bg-gray-100" title="Bold">B</button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); exec("italic"); }} className="rounded px-2 py-1 text-xs italic hover:bg-gray-100" title="Italic">I</button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); exec("underline"); }} className="rounded px-2 py-1 text-xs underline hover:bg-gray-100" title="Underline">U</button>
          <span className="mx-1 text-[#ccc]">|</span>
          <label className="flex items-center gap-1 text-xs text-[#666]">
            <span className="text-[10px] uppercase tracking-wide text-[#888]">Size</span>
            <select
              defaultValue=""
              className="rounded border border-[#ddd] bg-white px-1.5 py-0.5 text-xs text-[#333]"
              title="Text size"
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => {
                applyFontSize(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="" disabled>—</option>
              {FONT_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <span className="ml-auto text-[10px] text-muted font-medium">
            💡 Use the AI Assistant on the left for writing edits & free responses · Preview = 1 Page PDF
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto bg-[#e8e8ea] px-4 py-6 sm:px-8">
        <div
          ref={rootRef}
          id={printId}
          className={`resume-preview mx-auto bg-white text-[#2a1523] ${className}`}
          style={{
            width: "8.5in",
            height: "11in",
            maxWidth: "8.5in",
            padding: isStartup ? "0.5in 0.55in" : "0.55in 0.6in",
            fontSize: isStartup ? "9.5pt" : "10pt",
            lineHeight: isStartup ? 1.32 : 1.45,
            fontFamily,
            boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
            borderRadius: "2px",
            boxSizing: "border-box",
            overflow: "hidden",
            overflowWrap: "break-word",
            wordBreak: "break-word",
          }}
        >
          <div ref={scaleRef}>
          <TemplatePreviewLayout
            theme={tplTheme}
            jobTagline={jobTitle || undefined}
            headerSummary={
              isStartup ? (
                <Editable
                  tag="div"
                  value={summary || "Professional summary tailored to this job will appear here."}
                  editable={canEdit}
                  style={{ margin: 0 }}
                  onEdit={(v) => patch({ summary: v })}
                />
              ) : undefined
            }
            name={
              tplTheme.layout === "creative" ? (
                (() => {
                  const parts = (contact.name || "Your Name").trim().split(/\s+/);
                  const first = parts[0] || "Your";
                  const last = parts.slice(1).join(" ");
                  return (
                    <>
                      <div style={{ background: tplTheme.accent, padding: "6px 8px", fontSize: "14pt", fontWeight: 700, marginBottom: 2 }}>{first}</div>
                      {last && <div style={{ background: tplTheme.accent2, padding: "6px 8px", fontSize: "14pt", fontWeight: 700 }}>{last}</div>}
                    </>
                  );
                })()
              ) : (
                <Editable
                  tag="h1"
                  value={contact.name || "Your Name"}
                  editable={canEdit}
                  style={{ fontSize: "inherit", fontWeight: 700, margin: 0, lineHeight: 1.2, display: "inline" }}
                  onEdit={(v) => patch({ contact: { ...contact, name: v } })}
                />
              )
            }
            contactLine={
              isStartup ? (
                <>
                  {contact.phone && (
                    <div>
                      <Editable value={contact.phone} editable={canEdit} onEdit={(v) => patch({ contact: { ...contact, phone: v } })} />
                    </div>
                  )}
                  {contact.email && (
                    <div>
                      <Editable value={contact.email} editable={canEdit} onEdit={(v) => patch({ contact: { ...contact, email: v } })} />
                    </div>
                  )}
                  {contact.linkedin && (
                    <div>
                      <Editable
                        value={contact.linkedin.replace(/^https?:\/\/(www\.)?/, "")}
                        editable={canEdit}
                        onEdit={(v) => patch({ contact: { ...contact, linkedin: v } })}
                      />
                    </div>
                  )}
                  {contact.github && (
                    <div>
                      <Editable
                        value={contact.github.replace(/^https?:\/\/(www\.)?/, "")}
                        editable={canEdit}
                        onEdit={(v) => patch({ contact: { ...contact, github: v } })}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  {contact.phone && <Editable value={contact.phone} editable={canEdit} onEdit={(v) => patch({ contact: { ...contact, phone: v } })} />}
                  {contact.phone && contact.email && <span> · </span>}
                  {contact.email && <Editable value={contact.email} editable={canEdit} onEdit={(v) => patch({ contact: { ...contact, email: v } })} />}
                  {(contact.phone || contact.email) && contact.linkedin && <span> · </span>}
                  {contact.linkedin && (
                    <Editable
                      value={contact.linkedin.replace(/^https?:\/\/(www\.)?/, "")}
                      editable={canEdit}
                      onEdit={(v) => patch({ contact: { ...contact, linkedin: v } })}
                    />
                  )}
                </>
              )
            }
            sections={{
              summary: isStartup ? null : (
                <Editable
                  tag="div"
                  value={summary || "Professional summary tailored to this job will appear here."}
                  editable={canEdit}
                  style={{ margin: 0, textAlign: "justify", minHeight: "1.2em" }}
                  onEdit={(v) => patch({ summary: v })}
                />
              ),
              education:
                education.length > 0
                  ? education.map((ed, i) =>
                      isStartup ? (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                            fontSize: "9pt",
                            marginBottom: i < education.length - 1 ? 2 : 0,
                          }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <Editable
                              tag="strong"
                              value={ed.school || ""}
                              editable={canEdit}
                              onEdit={(v) => {
                                const next = [...education];
                                next[i] = { ...ed, school: v };
                                patch({ education: next });
                              }}
                            />
                            {ed.degree && (
                              <>
                                {" — "}
                                <Editable
                                  tag="span"
                                  value={ed.degree}
                                  editable={canEdit}
                                  onEdit={(v) => {
                                    const next = [...education];
                                    next[i] = { ...ed, degree: v };
                                    patch({ education: next });
                                  }}
                                />
                              </>
                            )}
                          </span>
                          <Editable
                            value={ed.year || ""}
                            editable={canEdit}
                            style={{ color: accent, fontSize: "8.5pt", flexShrink: 0 }}
                            onEdit={(v) => {
                              const next = [...education];
                              next[i] = { ...ed, year: v };
                              patch({ education: next });
                            }}
                          />
                        </div>
                      ) : (
                        <div key={i} style={{ marginBottom: i < education.length - 1 ? "8px" : 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <Editable
                              tag="strong"
                              value={ed.school || ""}
                              editable={canEdit}
                              onEdit={(v) => {
                                const next = [...education];
                                next[i] = { ...ed, school: v };
                                patch({ education: next });
                              }}
                            />
                            <Editable
                              value={ed.year || ""}
                              editable={canEdit}
                              onEdit={(v) => {
                                const next = [...education];
                                next[i] = { ...ed, year: v };
                                patch({ education: next });
                              }}
                            />
                          </div>
                          <Editable
                            tag="em"
                            value={`${ed.degree || ""}${ed.gpa ? ` · GPA: ${ed.gpa}` : ""}${ed.honors ? ` · ${ed.honors}` : ""}${ed.distinction ? ` · ${ed.distinction}` : ""}`}
                            editable={canEdit}
                            onEdit={(v) => {
                              const next = [...education];
                              next[i] = { ...ed, degree: v };
                              patch({ education: next });
                            }}
                          />
                        </div>
                      )
                    )
                  : null,
              experience:
                work_experience.length > 0
                  ? work_experience.map((job, i) =>
                      isStartup ? (
                        <div key={i} data-exp-index={i} style={{ marginBottom: i < work_experience.length - 1 ? 4 : 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                            <Editable
                              tag="strong"
                              value={job.title || ""}
                              editable={canEdit}
                              style={{ fontSize: "10pt", color: tplTheme.accent2 || "#2D3436", fontWeight: 700 }}
                              onEdit={(v) => {
                                const next = [...work_experience];
                                next[i] = { ...job, title: v };
                                patch({ work_experience: next });
                              }}
                            />
                            <Editable
                              value={job.duration || ""}
                              editable={canEdit}
                              style={{ fontSize: "8.5pt", color: accent, fontWeight: 600, flexShrink: 0 }}
                              onEdit={(v) => {
                                const next = [...work_experience];
                                next[i] = { ...job, duration: v };
                                patch({ work_experience: next });
                              }}
                            />
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: "8.5pt",
                              color: textMuted,
                              gap: 8,
                            }}
                          >
                            <Editable
                              value={job.company || ""}
                              editable={canEdit}
                              onEdit={(v) => {
                                const next = [...work_experience];
                                next[i] = { ...job, company: v };
                                patch({ work_experience: next });
                              }}
                            />
                            <Editable
                              value={job.location || ""}
                              editable={canEdit}
                              onEdit={(v) => {
                                const next = [...work_experience];
                                next[i] = { ...job, location: v };
                                patch({ work_experience: next });
                              }}
                            />
                          </div>
                          <ul style={{ margin: "1px 0 0 0", padding: 0, listStyle: "none" }}>
                            {toArray(job.bullets).map((b, bi) => (
                              <li key={bi} style={{ marginBottom: 1, fontSize: "9pt", display: "flex", gap: 4, alignItems: "flex-start" }}>
                                <span style={{ color: accent, flexShrink: 0, lineHeight: 1.32 }}>•</span>
                                <Editable
                                  tag="span"
                                  value={b}
                                  editable={canEdit}
                                  onEdit={(v) => {
                                    const bullets = [...toArray(job.bullets)];
                                    bullets[bi] = v;
                                    const next = [...work_experience];
                                    next[i] = { ...job, bullets };
                                    patch({ work_experience: next });
                                  }}
                                />
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div key={i} data-exp-index={i} style={{ marginBottom: i < work_experience.length - 1 ? "12px" : 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <Editable
                              tag="strong"
                              value={job.company || ""}
                              editable={canEdit}
                              onEdit={(v) => {
                                const next = [...work_experience];
                                next[i] = { ...job, company: v };
                                patch({ work_experience: next });
                              }}
                            />
                            <Editable
                              value={job.duration || ""}
                              editable={canEdit}
                              onEdit={(v) => {
                                const next = [...work_experience];
                                next[i] = { ...job, duration: v };
                                patch({ work_experience: next });
                              }}
                            />
                          </div>
                          <Editable
                            tag="em"
                            value={job.title || ""}
                            editable={canEdit}
                            onEdit={(v) => {
                              const next = [...work_experience];
                              next[i] = { ...job, title: v };
                              patch({ work_experience: next });
                            }}
                          />
                          <ul style={{ margin: "4px 0 0 0", paddingLeft: "16px" }}>
                            {toArray(job.bullets).map((b, bi) => (
                              <li key={bi} style={{ marginBottom: "3px" }}>
                                <Editable
                                  tag="span"
                                  value={b}
                                  editable={canEdit}
                                  onEdit={(v) => {
                                    const bullets = [...toArray(job.bullets)];
                                    bullets[bi] = v;
                                    const next = [...work_experience];
                                    next[i] = { ...job, bullets };
                                    patch({ work_experience: next });
                                  }}
                                />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    )
                  : null,
              projects:
                projects.length > 0
                  ? projects.map((proj, i) =>
                      isStartup ? (
                        <div key={i} data-proj-index={i} style={{ marginBottom: i < projects.length - 1 ? 3 : 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "9pt", alignItems: "baseline" }}>
                            <div style={{ minWidth: 0 }}>
                              <Editable
                                tag="strong"
                                value={proj.name || ""}
                                editable={canEdit}
                                onEdit={(v) => {
                                  const next = [...projects];
                                  next[i] = { ...proj, name: v };
                                  patch({ projects: next });
                                }}
                              />
                              {proj.description && (
                                <>
                                  {" — "}
                                  <Editable
                                    tag="em"
                                    value={proj.description}
                                    editable={canEdit}
                                    style={{ fontSize: "8.5pt", color: textMuted }}
                                    onEdit={(v) => {
                                      const next = [...projects];
                                      next[i] = { ...proj, description: v };
                                      patch({ projects: next });
                                    }}
                                  />
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div key={i} data-proj-index={i} style={{ marginBottom: i < projects.length - 1 ? "10px" : 0 }}>
                          <Editable
                            tag="strong"
                            value={proj.name || ""}
                            editable={canEdit}
                            onEdit={(v) => {
                              const next = [...projects];
                              next[i] = { ...proj, name: v };
                              patch({ projects: next });
                            }}
                          />
                          {proj.description && (
                            <Editable
                              tag="div"
                              value={proj.description}
                              editable={canEdit}
                              style={{ margin: "2px 0 0 0", fontSize: "9.5pt", minHeight: "1.2em" }}
                              onEdit={(v) => {
                                const next = [...projects];
                                next[i] = { ...proj, description: v };
                                patch({ projects: next });
                              }}
                            />
                          )}
                        </div>
                      )
                    )
                  : null,
              skills:
                allTech.length + allSoft.length > 0 ? (
                  isStartup ? (
                    <div style={{ fontSize: "8.5pt", lineHeight: 1.35 }}>
                      {allTech.length > 0 && (
                        <div style={{ display: "flex", marginBottom: allSoft.length > 0 ? 2 : 0 }}>
                          <span style={{ width: "14%", fontWeight: 700, flexShrink: 0 }}>Skills</span>
                          <Editable
                            tag="span"
                            value={allTech.join(", ")}
                            editable={canEdit}
                            onEdit={(v) => {
                              patch({
                                skills: {
                                  technical: v.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
                                  soft: allSoft,
                                },
                              });
                            }}
                          />
                        </div>
                      )}
                      {allSoft.length > 0 && (
                        <div style={{ display: "flex" }}>
                          <span style={{ width: "14%", fontWeight: 700, flexShrink: 0 }}>Strengths</span>
                          <Editable
                            tag="span"
                            value={allSoft.join(", ")}
                            editable={canEdit}
                            onEdit={(v) => {
                              patch({
                                skills: {
                                  technical: allTech,
                                  soft: v.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
                                },
                              });
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {allTech.length > 0 && (
                        <div style={{ marginBottom: allSoft.length > 0 ? "6px" : 0 }}>
                          {tplTheme.layout === "bold_header" ? (
                            allTech.slice(0, 10).map((skill, si) => (
                              <div key={si} style={{ marginBottom: 6 }}>
                                <div style={{ fontSize: "8pt", marginBottom: 2 }}>{skill}</div>
                                <div style={{ height: 6, background: "#D5D8DC", borderRadius: 2 }}>
                                  <div
                                    style={{
                                      width: `${Math.max(55, 95 - si * 4)}%`,
                                      height: "100%",
                                      background: tplTheme.accent,
                                      borderRadius: 2,
                                    }}
                                  />
                                </div>
                              </div>
                            ))
                          ) : (
                            <Editable
                              tag="p"
                              value={`Skills: ${allTech.join(", ")}`}
                              editable={canEdit}
                              style={{ margin: 0, fontSize: "9.5pt" }}
                              onEdit={(v) => {
                                const raw = v.replace(/^Skills:\s*/i, "");
                                patch({
                                  skills: {
                                    technical: raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
                                    soft: allSoft,
                                  },
                                });
                              }}
                            />
                          )}
                        </div>
                      )}
                      {allSoft.length > 0 && tplTheme.layout !== "bold_header" && (
                        <Editable
                          tag="p"
                          value={`Strengths: ${allSoft.join(", ")}`}
                          editable={canEdit}
                          style={{ margin: 0, fontSize: "9.5pt" }}
                          onEdit={(v) => {
                            const raw = v.replace(/^Strengths:\s*/i, "");
                            patch({
                              skills: {
                                technical: allTech,
                                soft: raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
                              },
                            });
                          }}
                        />
                      )}
                    </>
                  )
                ) : null,
            }}
          />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Open a clean print window (no app chrome / minimal browser header noise). */
export function printResumeElement(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  w.document.write(`<!DOCTYPE html>
<html><head>
<title> </title>
<style>
  @page { size: letter; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; width: 8.5in; height: 11in; }
  .resume-preview { width: 8.5in !important; height: 11in !important; box-shadow: none !important; border-radius: 0 !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head><body>${el.outerHTML}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.close();
  }, 400);
}
