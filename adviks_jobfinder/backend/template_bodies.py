"""Generate LaTeX document bodies per ALLtemplates layout."""

from __future__ import annotations

import re

from template_registry import default_template_id


def _tex_escape(text) -> str:
    if text is None:
        return ""
    s = str(text)
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(ch, ch) for ch in s)


def _as_list(value) -> list:
    if not value:
        return []
    if isinstance(value, list):
        return [v for v in value if v not in (None, "")]
    if isinstance(value, str):
        return [p.strip() for p in re.split(r"[,\n;•]", value) if p.strip()]
    return []


def _strip_scheme(url: str) -> str:
    return re.sub(r"^https?://(www\.)?", "", (url or "").strip()).rstrip("/")


def sanitize_template_preamble(pre: str) -> str:
    pre = re.sub(r"\\input\{glyphtounicode\}\s*", "", pre)
    pre = re.sub(r"\\pdfgentounicode\s*=\s*1\s*", "", pre)
    pre = re.sub(r"\\usepackage\{charter\}", r"\\usepackage{lmodern}", pre)
    if "onepageletter" not in pre:
        pre += "\n% onepageletter\n\\setlength{\\parskip}{0pt}\n"
    return pre


def _ctx(resume_json: dict, job_title: str = "") -> dict:
    contact = resume_json.get("contact") or {}
    skills = resume_json.get("skills") or {}
    technical = _as_list(skills.get("technical")) if isinstance(skills, dict) else _as_list(skills)
    soft = _as_list(skills.get("soft")) if isinstance(skills, dict) else []
    return {
        "name": contact.get("name") or "Your Name",
        "phone": contact.get("phone") or "",
        "email": contact.get("email") or "",
        "linkedin": contact.get("linkedin") or "",
        "github": contact.get("github") or "",
        "location": contact.get("location") or "",
        "summary": (resume_json.get("summary") or "").strip(),
        "education": resume_json.get("education") or [],
        "work": resume_json.get("work_experience") or [],
        "projects": resume_json.get("projects") or [],
        "technical": technical,
        "soft": soft,
        "job_title": job_title or "",
    }


def _itemize(items: list, leftmargin: int = 16) -> str:
    if not items:
        return ""
    opts = f"leftmargin={leftmargin}pt, itemsep=0pt, topsep=1pt, parsep=0pt"
    lines = [rf"\begin{{itemize}}[{opts}]", r"  \small"]
    for it in items:
        lines.append(f"  \\item {_tex_escape(it)}")
    lines.append(r"\end{itemize}")
    return "\n".join(lines)


def _pw_entry(a: str, b: str, c: str, d: str) -> str:
    """Pure White \\entry macro breaks on empty right-column lines — use ~ placeholder."""
    b = b.strip() or "~"
    d = d.strip() or "~"
    return f"\\entry{{{a}}}{{{b}}}{{{c}}}{{{d}}}"


def _elegant_entry(a: str, b: str, c: str, d: str) -> str:
    """Minimalist Elegant \\expEntry breaks on empty right-column lines."""
    b = b.strip() or "~"
    d = d.strip() or "~"
    return f"\\expEntry{{{a}}}{{{b}}}{{{c}}}{{{d}}}"


def _pw_section(title: str) -> str:
    t = _tex_escape(title)
    return (
        f"\\vspace{{6pt}}\n"
        f"\\noindent{{\\color{{black}}\\normalsize\\bfseries\\uppercase{{{t}}}}}\\\\\n"
        f"\\noindent{{\\color{{ruleGray}}\\rule{{\\linewidth}}{{0.4pt}}}}\n"
        f"\\vspace{{2pt}}"
    )


def _href_email(email: str) -> str:
    if not email:
        return ""
    return f"\\href{{mailto:{email}}}{{{_tex_escape(email)}}}"


def _href_link(url: str, display: str | None = None) -> str:
    if not url:
        return ""
    href = url if url.startswith("http") else f"https://{url}"
    text = _tex_escape(display or _strip_scheme(url))
    return f"\\href{{{href}}}{{{text}}}"


# ── Jake (jakes_resume, classic_jake) ────────────────────────────────────────

def build_jake_body(resume_json: dict, job_title: str = "") -> str:
    c = _ctx(resume_json, job_title)
    heading_bits = []
    if c["phone"]:
        heading_bits.append(_tex_escape(c["phone"]))
    if c["email"]:
        heading_bits.append(f"\\href{{mailto:{c['email']}}}{{\\underline{{{_tex_escape(c['email'])}}}}}")
    if c["linkedin"]:
        heading_bits.append(_href_link(c["linkedin"], _strip_scheme(c["linkedin"])))
    if c["github"]:
        heading_bits.append(_href_link(c["github"], _strip_scheme(c["github"])))
    heading_line = " $|$ ".join(heading_bits)

    parts = [
        "%----------HEADING----------",
        "\\begin{center}",
        f"    \\textbf{{\\Huge \\scshape {_tex_escape(c['name'])}}} \\\\ \\vspace{{1pt}}",
    ]
    if heading_line:
        parts.append(f"    \\small {heading_line}")
    parts.append("\\end{center}\n")

    if c["summary"]:
        parts += ["%-----------SUMMARY-----------", "\\section{Summary}", _tex_escape(c["summary"]), ""]

    if c["education"]:
        parts += ["%-----------EDUCATION-----------", "\\section{Education}", "  \\resumeSubHeadingListStart"]
        for ed in c["education"]:
            if not isinstance(ed, dict):
                continue
            school = _tex_escape(ed.get("school") or "")
            degree = _tex_escape(ed.get("degree") or "")
            year = _tex_escape(ed.get("year") or "")
            loc = _tex_escape(ed.get("location") or "")
            degree_line = degree
            if ed.get("gpa"):
                degree_line += f" \\textbar{{}} GPA: {_tex_escape(ed['gpa'])}"
            if ed.get("honors"):
                degree_line += f" \\textbar{{}} {_tex_escape(ed['honors'])}"
            if ed.get("distinction"):
                degree_line += f" \\textbar{{}} {_tex_escape(ed['distinction'])}"
            parts += ["    \\resumeSubheading", f"      {{{school}}}{{{loc}}}", f"      {{{degree_line}}}{{{year}}}"]
        parts += ["  \\resumeSubHeadingListEnd", ""]

    if c["work"]:
        parts += ["%-----------EXPERIENCE-----------", "\\section{Experience}", "  \\resumeSubHeadingListStart"]
        for job in c["work"]:
            if not isinstance(job, dict):
                continue
            title = _tex_escape(job.get("title") or "")
            company = _tex_escape(job.get("company") or "")
            duration = _tex_escape(job.get("duration") or "")
            loc = _tex_escape(job.get("location") or "")
            parts += ["    \\resumeSubheading", f"      {{{title}}}{{{duration}}}", f"      {{{company}}}{{{loc}}}"]
            bullets = _as_list(job.get("bullets"))
            if bullets:
                parts += ["      \\resumeItemListStart"]
                for b in bullets:
                    parts.append(f"        \\resumeItem{{{_tex_escape(b)}}}")
                parts += ["      \\resumeItemListEnd"]
        parts += ["  \\resumeSubHeadingListEnd", ""]

    if c["projects"]:
        parts += ["%-----------PROJECTS-----------", "\\section{Projects}", "    \\resumeSubHeadingListStart"]
        for p in c["projects"]:
            if not isinstance(p, dict):
                continue
            pname = _tex_escape(p.get("name") or "")
            techs = _as_list(p.get("technologies") or p.get("tech"))
            heading = f"\\textbf{{{pname}}}"
            if techs:
                heading += f" $|$ \\emph{{{_tex_escape(', '.join(techs))}}}"
            parts += ["      \\resumeProjectHeading", f"          {{{heading}}}{{}}"]
            items = _as_list(p.get("highlights") or p.get("bullets"))
            if not items and p.get("description"):
                items = [p.get("description")]
            if items:
                parts += ["          \\resumeItemListStart"]
                for it in items:
                    parts.append(f"            \\resumeItem{{{_tex_escape(it)}}}")
                parts += ["          \\resumeItemListEnd"]
        parts += ["    \\resumeSubHeadingListEnd", ""]

    if c["technical"] or c["soft"]:
        parts += ["%-----------TECHNICAL SKILLS-----------", "\\section{Technical Skills}",
                  " \\begin{itemize}[leftmargin=0.15in, label={}]", "    \\small{\\item{"]
        skill_lines = []
        if c["technical"]:
            skill_lines.append(f"     \\textbf{{Skills}}{{: {_tex_escape(', '.join(c['technical']))}}}")
        if c["soft"]:
            skill_lines.append(f"     \\textbf{{Strengths}}{{: {_tex_escape(', '.join(c['soft']))}}}")
        parts.append(" \\\\\n".join(skill_lines))
        parts += ["    }}", " \\end{itemize}", ""]

    return "\n".join(parts)


# ── Executive Timeline ───────────────────────────────────────────────────────

def build_executive_timeline_body(resume_json: dict, job_title: str = "") -> str:
    c = _ctx(resume_json, job_title)
    tagline = _tex_escape(c["job_title"] or "Professional")
    parts = [
        "%---- HEADER ----%",
        "\\noindent\\begin{minipage}[t]{0.62\\linewidth}",
        f"  {{\\color{{premiumNavy}}\\fontsize{{28}}{{30}}\\selectfont\\bfseries {_tex_escape(c['name'])}}}\\\\[4pt]",
        "{\\color{premiumGold}\\rule{4cm}{1.5pt}}\\\\[4pt]",
        f"  {{\\color{{textGray}} {tagline}}}",
        "\\end{minipage}%",
        "\\hfill",
        "\\begin{minipage}[t]{0.34\\linewidth}",
        "  \\raggedleft\\small\\color{lightGray}",
    ]
    if c["phone"]:
        parts.append(f"  \\faPhone\\ {_tex_escape(c['phone'])}\\\\[3pt]")
    if c["email"]:
        parts.append(f"  \\faEnvelope\\ {_href_email(c['email'])}\\\\[3pt]")
    if c["linkedin"]:
        parts.append(f"  \\faLinkedin\\ {_href_link(c['linkedin'], _strip_scheme(c['linkedin']))}\\\\[3pt]")
    if c["github"]:
        parts.append(f"  \\faGithub\\ {_href_link(c['github'], _strip_scheme(c['github']))}\\\\[3pt]")
    if c["location"]:
        parts.append(f"  \\faMapMarker\\ {_tex_escape(c['location'])}")
    parts += [
        "\\end{minipage}",
        "\\vspace{8pt}",
        "\\noindent{\\color{premiumNavy}\\rule{\\linewidth}{1.5pt}}\\\\[-2pt]",
        "\\noindent{\\color{premiumGold}\\rule{\\linewidth}{2.5pt}}",
        "\\vspace{6pt}",
    ]

    if c["summary"]:
        parts += ["\\tlSection{Summary}", f"\\noindent\\hspace{{16pt}}{{\\small {_tex_escape(c['summary'])}}}", "\\vspace{5pt}"]

    if c["education"]:
        parts += ["\\tlSection{Education}"]
        for ed in c["education"]:
            if not isinstance(ed, dict):
                continue
            school = _tex_escape(ed.get("school") or "")
            degree = _tex_escape(ed.get("degree") or "")
            year = _tex_escape(ed.get("year") or "")
            loc = _tex_escape(ed.get("location") or "")
            parts.append(f"\\tlEntry{{{school}}}{{{loc}}}{{{degree}}}{{{year}}}")
            parts.append("\\vspace{3pt}")

    if c["work"]:
        parts += ["\\tlSection{Professional Experience}"]
        for job in c["work"]:
            if not isinstance(job, dict):
                continue
            title = _tex_escape(job.get("title") or "")
            company = _tex_escape(job.get("company") or "")
            duration = _tex_escape(job.get("duration") or "")
            loc = _tex_escape(job.get("location") or "")
            parts.append(f"\\tlEntry{{{title}}}{{{duration}}}{{{company}}}{{{loc}}}")
            bullets = _as_list(job.get("bullets"))
            if bullets:
                parts.append(_itemize(bullets, 32))
            parts.append("\\vspace{5pt}")

    if c["projects"]:
        parts += ["\\tlSection{Key Projects}", "\\noindent\\hspace{16pt}\\begin{minipage}{0.88\\linewidth}"]
        for p in c["projects"]:
            if not isinstance(p, dict):
                continue
            pname = _tex_escape(p.get("name") or "")
            techs = _as_list(p.get("technologies") or p.get("tech"))
            duration = _tex_escape(p.get("duration") or "")
            parts.append(f"\\noindent{{\\bfseries\\color{{premiumNavy}} {pname}}} \\hfill {{\\color{{premiumGold}}\\small {duration}}}\\\\")
            if techs:
                parts.append(f"{{\\small\\color{{lightGray}}\\itshape {_tex_escape(', '.join(techs))}}}")
            items = _as_list(p.get("highlights") or p.get("bullets"))
            if not items and p.get("description"):
                items = [p.get("description")]
            if items:
                parts.append(_itemize(items, 16))
            parts.append("\\vspace{5pt}")
        parts.append("\\end{minipage}")

    if c["technical"] or c["soft"]:
        parts += ["\\tlSection{Technical Skills}", "\\noindent\\hspace{16pt}\\begin{minipage}{0.88\\linewidth}",
                  "\\noindent\\begin{tabularx}{\\linewidth}{@{}p{0.13\\linewidth} X}"]
        if c["technical"]:
            parts.append(f"  {{\\small\\bfseries\\color{{premiumNavy}} Skills}} & {{\\small {_tex_escape(', '.join(c['technical']))}}} \\\\[2pt]")
        if c["soft"]:
            parts.append(f"  {{\\small\\bfseries\\color{{premiumNavy}} Strengths}} & {{\\small {_tex_escape(', '.join(c['soft']))}}} \\\\[2pt]")
        parts += ["\\end{tabularx}", "\\end{minipage}"]

    parts += [
        "\\vspace{8pt}",
        "\\noindent{\\color{premiumGold}\\rule{\\linewidth}{2.5pt}}\\\\[-2pt]",
        "\\noindent{\\color{premiumNavy}\\rule{\\linewidth}{1.5pt}}",
    ]
    return "\n".join(parts)


# ── Bold Header (two-column) ─────────────────────────────────────────────────

def build_bold_header_body(resume_json: dict, job_title: str = "") -> str:
    c = _ctx(resume_json, job_title)
    tagline = _tex_escape(c["job_title"] or "Professional")
    contact_parts = []
    if c["phone"]:
        contact_parts.append(f"\\faPhone\\ {_tex_escape(c['phone'])}")
    if c["email"]:
        contact_parts.append(f"\\faEnvelope\\ {_href_email(c['email'])}")
    if c["linkedin"]:
        contact_parts.append(f"\\faLinkedin\\ {_href_link(c['linkedin'], _strip_scheme(c['linkedin']))}")
    if c["github"]:
        contact_parts.append(f"\\faGithub\\ {_href_link(c['github'], _strip_scheme(c['github']))}")
    contact_line = " \\quad ".join(contact_parts)

    parts = [
        "%---- BIG HEADER BANNER ----%",
        "\\noindent\\colorbox{headerBg}{\\makebox[\\linewidth][c]{%",
        "  \\begin{minipage}{0.85\\linewidth}",
        "  \\vspace{12pt}",
        "  \\begin{center}",
        f"    {{\\color{{white}}\\Huge\\bfseries {_tex_escape(c['name'])}}}\\\\[4pt]",
        f"    {{\\color{{accentTeal}}\\large {tagline}}}\\\\[6pt]",
        f"    {{\\color{{white}}\\scriptsize {contact_line}}}",
        "  \\end{center}",
        "  \\vspace{8pt}",
        "  \\end{minipage}",
        "}}",
        "\\vspace{0pt}",
        "\\columnratio{0.35}",
        "\\begin{paracol}{2}",
        "\\backgroundcolor{c[0](0pt,0pt)(0.5\\columnsep,0pt)}{sidebarBg}",
        "\\begin{leftcolumn}",
        "\\hspace{8pt}",
        "\\begin{minipage}{0.88\\linewidth}",
        "\\vspace{8pt}",
    ]

    if c["education"]:
        parts += ["\\infoSection{accentTeal}{Education}"]
        for ed in c["education"]:
            if not isinstance(ed, dict):
                continue
            school = _tex_escape(ed.get("school") or "")
            degree = _tex_escape(ed.get("degree") or "")
            year = _tex_escape(ed.get("year") or "")
            parts.append(f"{{\\small\\bfseries {school}}}\\\\")
            parts.append(f"{{\\scriptsize\\color{{grayText}} {degree}\\\\{year}}}\\\\[5pt]")

    if c["technical"]:
        parts += ["\\infoSection{accentOrange}{Technical Skills}"]
        n = len(c["technical"])
        for i, skill in enumerate(c["technical"][:10]):
            fill = max(0.55, 0.95 - i * (0.4 / max(n, 1)))
            parts.append(f"\\skillbar{{{_tex_escape(skill)}}}{{{fill:.2f}}}")

    parts += [
        "\\end{minipage}",
        "\\end{leftcolumn}",
        "\\begin{rightcolumn}",
        "\\hspace{6pt}",
        "\\begin{minipage}{0.92\\linewidth}",
        "\\vspace{8pt}",
    ]

    if c["summary"]:
        parts += ["\\infoSection{accentTeal}{Summary}", f"{{\\small {_tex_escape(c['summary'])}}}", "\\vspace{4pt}"]

    if c["work"]:
        parts += ["\\infoSection{accentTeal}{Experience}"]
        colors = ["accentTeal", "accentOrange", "accentTeal"]
        for i, job in enumerate(c["work"]):
            if not isinstance(job, dict):
                continue
            col = colors[i % len(colors)]
            title = _tex_escape(job.get("title") or "")
            company = _tex_escape(job.get("company") or "")
            duration = _tex_escape(job.get("duration") or "")
            loc = _tex_escape(job.get("location") or "")
            parts += [
                f"\\noindent\\colorbox{{{col}!15}}{{\\begin{{minipage}}{{\\linewidth}}",
                "  \\vspace{2pt}\\hspace{4pt}",
                f"  {{\\bfseries\\small\\color{{darkText}} {title}}} \\hfill {{\\scriptsize\\color{{{col}}}\\bfseries {duration}}}\\\\",
                f"  \\hspace{{4pt}}{{\\scriptsize\\color{{grayText}} {company} \\hfill {loc}}}",
                "  \\vspace{2pt}",
                "\\end{minipage}}",
            ]
            bullets = _as_list(job.get("bullets"))
            if bullets:
                parts.append(_itemize(bullets, 12))
            parts.append("\\vspace{4pt}")

    if c["projects"]:
        parts += ["\\infoSection{accentOrange}{Projects}"]
        for p in c["projects"]:
            if not isinstance(p, dict):
                continue
            pname = _tex_escape(p.get("name") or "")
            techs = _as_list(p.get("technologies") or p.get("tech"))
            duration = _tex_escape(p.get("duration") or "")
            parts.append(f"\\noindent{{\\bfseries\\small\\color{{darkText}} {pname}}} \\hfill {{\\scriptsize\\color{{grayText}} {duration}}}\\\\")
            if techs:
                parts.append(f"{{\\scriptsize\\color{{grayText}}\\itshape {_tex_escape(' \\textbullet '.join(techs))}}}")
            items = _as_list(p.get("highlights") or p.get("bullets"))
            if not items and p.get("description"):
                items = [p.get("description")]
            if items:
                parts.append(_itemize(items, 12))
            parts.append("\\vspace{3pt}")

    parts += ["\\end{minipage}", "\\end{rightcolumn}", "\\end{paracol}"]
    return "\n".join(parts)


# ── Minimalist Elegant ───────────────────────────────────────────────────────

def build_minimalist_elegant_body(resume_json: dict, job_title: str = "") -> str:
    c = _ctx(resume_json, job_title)
    tagline = _tex_escape(c["job_title"] or "Professional")
    contact = []
    if c["phone"]:
        contact.append(f"\\faPhone\\ {_tex_escape(c['phone'])}")
    if c["email"]:
        contact.append(f"\\faEnvelope\\ {_href_email(c['email'])}")
    if c["linkedin"]:
        contact.append(f"\\faLinkedin\\ {_href_link(c['linkedin'], _strip_scheme(c['linkedin']))}")
    if c["github"]:
        contact.append(f"\\faGithub\\ {_href_link(c['github'], _strip_scheme(c['github']))}")
    contact_line = " \\quad ".join(contact)

    parts = [
        "\\topBar",
        "\\begin{center}",
        f"  {{\\color{{darkNavy}}\\Huge\\bfseries\\scshape {_tex_escape(c['name'])}}}\\\\[4pt]",
        f"  {{\\color{{medGray}}\\small {tagline}}}\\\\[5pt]",
        f"  {{\\scriptsize\\color{{lightGray}} {contact_line}}}",
        "\\end{center}",
        "\\vspace{4pt}",
    ]

    if c["summary"]:
        parts += ["\\elegantSection{Summary}", f"{{\\small\\color{{medGray}} {_tex_escape(c['summary'])}}}", ""]

    if c["education"]:
        parts += ["\\elegantSection{Education}"]
        for ed in c["education"]:
            if not isinstance(ed, dict):
                continue
            parts.append(
                _elegant_entry(
                    _tex_escape(ed.get("school") or ""),
                    _tex_escape(ed.get("year") or ""),
                    _tex_escape(ed.get("degree") or ""),
                    _tex_escape(ed.get("location") or ""),
                )
            )

    if c["work"]:
        parts += ["\\elegantSection{Experience}"]
        for job in c["work"]:
            if not isinstance(job, dict):
                continue
            parts.append(
                _elegant_entry(
                    _tex_escape(job.get("company") or ""),
                    _tex_escape(job.get("duration") or ""),
                    _tex_escape(job.get("title") or ""),
                    _tex_escape(job.get("location") or ""),
                )
            )
            bullets = _as_list(job.get("bullets"))
            if bullets:
                parts.append(_itemize(bullets, 14))
            parts.append("\\vspace{2pt}")

    if c["projects"]:
        parts += ["\\elegantSection{Projects}"]
        for p in c["projects"]:
            if not isinstance(p, dict):
                continue
            parts.append(f"\\noindent{{\\bfseries\\color{{darkNavy}} {_tex_escape(p.get('name') or '')}}}\\\\")
            if p.get("description"):
                parts.append(f"{{\\small\\color{{medGray}} {_tex_escape(p['description'])}}}")
            parts.append("\\vspace{3pt}")

    if c["technical"] or c["soft"]:
        parts += ["\\elegantSection{Skills}"]
        if c["technical"]:
            parts.append(f"{{\\small\\textbf{{Skills:}} {_tex_escape(', '.join(c['technical']))}}}\\\\")
        if c["soft"]:
            parts.append(f"{{\\small\\textbf{{Strengths:}} {_tex_escape(', '.join(c['soft']))}}}")

    return "\n".join(parts)


# ── Pure White ─────────────────────────────────────────────────────────────────

def build_pure_white_body(resume_json: dict, job_title: str = "") -> str:
    c = _ctx(resume_json, job_title)
    contact = []
    if c["phone"]:
        contact.append(_tex_escape(c["phone"]))
    if c["email"]:
        contact.append(_href_email(c["email"]))
    if c["linkedin"]:
        contact.append(_href_link(c["linkedin"], _strip_scheme(c["linkedin"])))
    if c["github"]:
        contact.append(_href_link(c["github"], _strip_scheme(c["github"])))
    contact_line = " \\quad ".join(contact)

    parts = [
        "\\begin{center}",
        f"  {{\\Huge\\bfseries {_tex_escape(c['name'])}}}\\\\[6pt]",
        f"  {{\\small\\color{{softGray}} {contact_line}}}",
        "\\end{center}",
        "\\vspace{4pt}",
    ]

    if c["summary"]:
        parts += [_pw_section("Summary"), f"{{\\small {_tex_escape(c['summary'])}}}", "\\vspace{4pt}"]

    if c["education"]:
        parts += [_pw_section("Education")]
        for ed in c["education"]:
            if not isinstance(ed, dict):
                continue
            parts.append(
                _pw_entry(
                    _tex_escape(ed.get("school") or ""),
                    _tex_escape(ed.get("location") or ""),
                    _tex_escape(ed.get("degree") or ""),
                    _tex_escape(ed.get("year") or ""),
                )
            )
            parts.append("\\vspace{4pt}")

    if c["work"]:
        parts += [_pw_section("Experience")]
        for job in c["work"]:
            if not isinstance(job, dict):
                continue
            parts.append(
                _pw_entry(
                    _tex_escape(job.get("title") or ""),
                    _tex_escape(job.get("duration") or ""),
                    _tex_escape(job.get("company") or ""),
                    _tex_escape(job.get("location") or ""),
                )
            )
            bullets = _as_list(job.get("bullets"))
            if bullets:
                parts.append(_itemize(bullets, 16))
            parts.append("\\vspace{6pt}")

    if c["projects"]:
        parts += [_pw_section("Projects")]
        for p in c["projects"]:
            if not isinstance(p, dict):
                continue
            techs = _as_list(p.get("technologies") or p.get("tech"))
            parts.append(
                _pw_entry(
                    _tex_escape(p.get("name") or ""),
                    _tex_escape(p.get("duration") or ""),
                    _tex_escape(", ".join(techs)),
                    "~",
                )
            )
            items = _as_list(p.get("highlights") or p.get("bullets"))
            if not items and p.get("description"):
                items = [p.get("description")]
            if items:
                parts.append(_itemize(items, 16))
            parts.append("\\vspace{6pt}")

    if c["technical"] or c["soft"]:
        parts += [_pw_section("Skills"), "\\noindent\\begin{tabular}{@{}p{0.12\\linewidth} p{0.84\\linewidth}}"]
        if c["technical"]:
            parts.append(f"  {{\\small\\color{{softGray}} Skills}}  & {{\\small {_tex_escape(', '.join(c['technical']))}}} \\\\[2pt]")
        if c["soft"]:
            parts.append(f"  {{\\small\\color{{softGray}} Strengths}} & {{\\small {_tex_escape(', '.join(c['soft']))}}} \\\\[2pt]")
        parts.append("\\end{tabular}")

    return "\n".join(parts)


# ── Startup ────────────────────────────────────────────────────────────────────

def build_startup_body(resume_json: dict, job_title: str = "") -> str:
    c = _ctx(resume_json, job_title)
    tagline = _tex_escape(c["job_title"] or "Software Engineer")
    parts = [
        "\\noindent\\begin{minipage}[t]{0.60\\linewidth}",
        f"  {{\\color{{darkCharcoal}}\\Huge\\bfseries {_tex_escape(c['name'])}}}\\\\[3pt]",
        f"  {{\\color{{techGreen}}\\large\\bfseries {tagline}}}\\\\[5pt]",
    ]
    if c["summary"]:
        parts.append(f"  {{\\small\\color{{midSlate}} {_tex_escape(c['summary'])}}}")
    parts += [
        "\\end{minipage}%",
        "\\hfill",
        "\\begin{minipage}[t]{0.35\\linewidth}",
        "  \\raggedleft",
        "  \\small\\color{midSlate}",
    ]
    if c["phone"]:
        parts.append(f"  \\faPhone\\ {_tex_escape(c['phone'])}\\\\[2pt]")
    if c["email"]:
        parts.append(f"  \\faEnvelope\\ {_href_email(c['email'])}\\\\[2pt]")
    if c["linkedin"]:
        parts.append(f"  \\faLinkedin\\ {_href_link(c['linkedin'], _strip_scheme(c['linkedin']))}\\\\[2pt]")
    if c["github"]:
        parts.append(f"  \\faGithub\\ {_href_link(c['github'], _strip_scheme(c['github']))}")
    parts += ["\\end{minipage}", "\\vspace{6pt}", "\\noindent{\\color{techGreen}\\rule{\\linewidth}{2pt}}"]

    if c["work"]:
        parts += ["\\techSection{Experience}"]
        for job in c["work"]:
            if not isinstance(job, dict):
                continue
            parts.append(
                f"\\jobHead{{{_tex_escape(job.get('title') or '')}}}"
                f"{{{_tex_escape(job.get('duration') or '')}}}"
                f"{{{_tex_escape(job.get('company') or '')}}}"
                f"{{{_tex_escape(job.get('location') or '')}}}"
            )
            bullets = _as_list(job.get("bullets"))
            if bullets:
                parts.append(_itemize(bullets, 14))
            techs = _as_list(job.get("technologies"))
            if techs:
                parts.append(" ".join(f"\\techTag{{{_tex_escape(t)}}}" for t in techs[:6]))
            parts.append("\\vspace{6pt}")

    if c["projects"]:
        parts += ["\\techSection{Projects}"]
        for p in c["projects"]:
            if not isinstance(p, dict):
                continue
            pname = _tex_escape(p.get("name") or "")
            desc = _tex_escape(p.get("description") or "")
            duration = _tex_escape(p.get("duration") or "")
            parts.append(
                f"\\noindent\\begin{{tabularx}}{{\\linewidth}}{{@{{}}X r@{{}}}}"
                f"\n  {{\\bfseries\\color{{darkCharcoal}} {pname}}} — {{\\textit{{\\small\\color{{midSlate}}{desc}}}}} &"
                f"\n  {{\\small\\color{{techGreen}} {duration}}}"
                f"\n\\end{{tabularx}}"
            )
            items = _as_list(p.get("highlights") or p.get("bullets"))
            if not items and p.get("description"):
                items = [p.get("description")]
            if items:
                parts.append(_itemize(items, 14))
            techs = _as_list(p.get("technologies") or p.get("tech"))
            if techs:
                parts.append(" ".join(f"\\techTag{{{_tex_escape(t)}}}" for t in techs[:8]))
            parts.append("\\vspace{5pt}")

    if c["education"]:
        parts += ["\\techSection{Education}"]
        for ed in c["education"]:
            if not isinstance(ed, dict):
                continue
            parts.append(
                f"\\noindent\\begin{{tabularx}}{{\\linewidth}}{{@{{}}X r@{{}}}}"
                f"\n  {{\\bfseries\\color{{darkCharcoal}}{_tex_escape(ed.get('school') or '')}}} — {_tex_escape(ed.get('degree') or '')}"
                f" & {{\\color{{techGreen}}\\small {_tex_escape(ed.get('year') or '')}}}"
                f"\n\\end{{tabularx}}"
            )

    if c["technical"] or c["soft"]:
        parts += ["\\techSection{Technical Skills}",
                  "\\noindent\\begin{tabularx}{\\linewidth}{@{}p{0.14\\linewidth} X@{}}"]
        if c["technical"]:
            parts.append(f"  {{\\small\\bfseries Languages}}   & {{\\small {_tex_escape(', '.join(c['technical']))}}} \\\\[2pt]")
        if c["soft"]:
            parts.append(f"  {{\\small\\bfseries Strengths}}   & {{\\small {_tex_escape(', '.join(c['soft']))}}} \\\\[2pt]")
        parts.append("\\end{tabularx}")

    return "\n".join(parts)


# ── Corporate Banking ──────────────────────────────────────────────────────────

def build_corporate_banking_body(resume_json: dict, job_title: str = "") -> str:
    c = _ctx(resume_json, job_title)
    contact = []
    if c["phone"]:
        contact.append(_tex_escape(c["phone"]))
    if c["email"]:
        contact.append(_tex_escape(c["email"]))
    if c["linkedin"]:
        contact.append(_tex_escape(_strip_scheme(c["linkedin"])))
    if c["github"]:
        contact.append(_tex_escape(_strip_scheme(c["github"])))
    contact_line = " \\quad $\\vert$ \\quad ".join(contact)

    parts = [
        "\\begin{center}",
        f"  {{\\huge\\bfseries\\scshape\\color{{deepBlue}} {_tex_escape(c['name'])}}}\\\\[4pt]",
        f"  {{\\small\\color{{midGray}} {contact_line}}}\\\\[4pt]",
    ]
    if c["location"]:
        parts.append(f"  {{\\small {_tex_escape(c['location'])}}}")
    parts += [
        "\\end{center}",
        "\\vspace{4pt}",
        "\\noindent{\\color{deepBlue}\\rule{\\linewidth}{1.5pt}}",
        "\\vspace{4pt}",
    ]

    if c["summary"]:
        parts += ["\\section*{Summary}", f"{{\\small {_tex_escape(c['summary'])}}}", "\\vspace{4pt}"]

    if c["education"]:
        parts += ["\\section*{Education}", "\\vspace{1pt}"]
        for ed in c["education"]:
            if not isinstance(ed, dict):
                continue
            parts.append(
                f"\\corpEntry{{{_tex_escape(ed.get('school') or '')}}}"
                f"{{{_tex_escape(ed.get('location') or '')}}}"
                f"{{{_tex_escape(ed.get('degree') or '')}}}"
                f"{{{_tex_escape(ed.get('year') or '')}}}"
            )
            parts.append("\\vspace{3pt}")

    if c["work"]:
        parts += ["\\vspace{4pt}", "\\section*{Professional Experience}", "\\vspace{1pt}"]
        for job in c["work"]:
            if not isinstance(job, dict):
                continue
            parts.append(
                f"\\corpEntry{{{_tex_escape(job.get('title') or '')}}}"
                f"{{{_tex_escape(job.get('duration') or '')}}}"
                f"{{{_tex_escape(job.get('company') or '')}}}"
                f"{{{_tex_escape(job.get('location') or '')}}}"
            )
            bullets = _as_list(job.get("bullets"))
            if bullets:
                parts.append(_itemize(bullets, 18))
            parts.append("\\vspace{3pt}")

    if c["projects"]:
        parts += ["\\section*{Projects}", "\\vspace{1pt}"]
        for p in c["projects"]:
            if not isinstance(p, dict):
                continue
            parts.append(f"\\noindent{{\\bfseries {_tex_escape(p.get('name') or '')}}}\\\\")
            if p.get("description"):
                parts.append(f"{{\\small\\color{{midGray}} {_tex_escape(p['description'])}}}")
            parts.append("\\vspace{2pt}")

    if c["technical"] or c["soft"]:
        parts += ["\\section*{Skills}", "\\vspace{2pt}"]
        if c["technical"]:
            parts.append(f"{{\\small \\textbf{{Technical:}} {_tex_escape(', '.join(c['technical']))}}}\\\\")
        if c["soft"]:
            parts.append(f"{{\\small \\textbf{{Strengths:}} {_tex_escape(', '.join(c['soft']))}}}")

    return "\n".join(parts)


# ── Two-column sidebar ─────────────────────────────────────────────────────────

def build_two_column_sidebar_body(resume_json: dict, job_title: str = "") -> str:
    c = _ctx(resume_json, job_title)
    parts = [
        "\\columnratio{0.30}",
        "\\begin{paracol}{2}",
        "\\begin{leftcolumn}",
        "\\noindent\\colorbox{sidebarBg}{\\parbox[c][\\textheight][t]{\\linewidth}{%",
        "  \\hspace{8pt}\\vspace{12pt}",
        f"  {{\\color{{lightText}}\\LARGE\\bfseries {_tex_escape(c['name'])}}}\\\\[8pt]",
        f"  {{\\color{{grayText}}\\small {_tex_escape(c['job_title'] or 'Professional')}}}\\\\[12pt]",
        "\\sideSection{Contact}",
    ]
    if c["phone"]:
        parts.append(f"  {{\\color{{grayText}}\\small \\faPhone\\ {_tex_escape(c['phone'])}}}\\\\[3pt]")
    if c["email"]:
        parts.append(f"  {{\\color{{grayText}}\\small \\faEnvelope\\ {_href_email(c['email'])}}}\\\\[3pt]")
    if c["linkedin"]:
        parts.append(f"  {{\\color{{grayText}}\\small \\faLinkedin\\ {_href_link(c['linkedin'], _strip_scheme(c['linkedin']))}}}\\\\[3pt]")
    if c["github"]:
        parts.append(f"  {{\\color{{grayText}}\\small \\faGithub\\ {_href_link(c['github'], _strip_scheme(c['github']))}}}\\\\[3pt]")

    if c["technical"]:
        parts += ["  \\vspace{8pt}", "  \\sideSection{Skills}"]
        for skill in c["technical"][:12]:
            parts.append(f"  {{\\color{{lightText}}\\small {_tex_escape(skill)}}}\\\\[2pt]")

    if c["education"]:
        parts += ["  \\vspace{8pt}", "  \\sideSection{Education}"]
        for ed in c["education"]:
            if not isinstance(ed, dict):
                continue
            parts.append(f"  {{\\color{{lightText}}\\small\\bfseries {_tex_escape(ed.get('school') or '')}}}\\\\")
            parts.append(f"  {{\\color{{grayText}}\\scriptsize {_tex_escape(ed.get('degree') or '')}}}\\\\[4pt]")

    parts += ["  \\vspace{12pt}", "}}",
              "\\end{leftcolumn}",
              "\\begin{rightcolumn}",
              "\\hspace{10pt}",
              "\\begin{minipage}{0.92\\linewidth}",
              "\\vspace{10pt}"]

    if c["summary"]:
        parts += ["\\mainSection{Summary}", f"{{\\small {_tex_escape(c['summary'])}}}", "\\vspace{4pt}"]

    if c["work"]:
        parts += ["\\mainSection{Experience}"]
        for job in c["work"]:
            if not isinstance(job, dict):
                continue
            parts.append(
                f"\\jobEntry{{{_tex_escape(job.get('title') or '')}}}"
                f"{{{_tex_escape(job.get('duration') or '')}}}"
                f"{{{_tex_escape(job.get('company') or '')}}}"
                f"{{{_tex_escape(job.get('location') or '')}}}"
            )
            bullets = _as_list(job.get("bullets"))
            if bullets:
                parts.append(_itemize(bullets, 14))
            parts.append("\\vspace{4pt}")

    if c["projects"]:
        parts += ["\\mainSection{Projects}"]
        for p in c["projects"]:
            if not isinstance(p, dict):
                continue
            parts.append(f"\\noindent{{\\bfseries {_tex_escape(p.get('name') or '')}}}\\\\")
            if p.get("description"):
                parts.append(f"{{\\small {_tex_escape(p['description'])}}}")
            parts.append("\\vspace{4pt}")

    parts += ["\\end{minipage}", "\\end{rightcolumn}", "\\end{paracol}"]
    return "\n".join(parts)


# ── Creative ───────────────────────────────────────────────────────────────────

def build_creative_body(resume_json: dict, job_title: str = "") -> str:
    c = _ctx(resume_json, job_title)
    name_parts = c["name"].split(None, 1)
    first = _tex_escape(name_parts[0] if name_parts else c["name"])
    last = _tex_escape(name_parts[1] if len(name_parts) > 1 else "")

    parts = [
        "\\columnratio{0.32}",
        "\\begin{paracol}{2}",
        "\\backgroundcolor{c[0](0pt,0pt)(0.5\\columnsep,0pt)}{leftBg}",
        "\\begin{leftcolumn}",
        "\\begin{minipage}[t][\\textheight][t]{\\linewidth}",
        "\\vspace*{0pt}",
        f"\\noindent\\colorbox{{coral}}{{\\makebox[\\linewidth][l]{{\\hspace{{6pt}}\\color{{white}}\\Large\\bfseries {first}\\hspace{{4pt}}}}}}\\\\[-2pt]",
    ]
    if last:
        parts.append(f"\\noindent\\colorbox{{deepPurple}}{{\\makebox[\\linewidth][l]{{\\hspace{{6pt}}\\color{{white}}\\Large\\bfseries {last}\\hspace{{4pt}}}}}}\\\\[8pt]")
    parts += ["\\creativeSecL{coral}{Contact}"]
    if c["phone"]:
        parts.append(f"{{\\color{{softWhite}}\\small \\faPhone\\ {_tex_escape(c['phone'])}}}\\\\[2pt]")
    if c["email"]:
        parts.append(f"{{\\color{{softWhite}}\\small \\faEnvelope\\ {_href_email(c['email'])}}}\\\\[2pt]")
    if c["linkedin"]:
        parts.append(f"{{\\color{{softWhite}}\\small \\faLinkedin\\ {_href_link(c['linkedin'], _strip_scheme(c['linkedin']))}}}\\\\[2pt]")

    if c["technical"]:
        parts += ["\\creativeSecL{mint}{Skills}"]
        for skill in c["technical"][:10]:
            parts.append(f"{{\\color{{softWhite}}\\small {_tex_escape(skill)}}}\\\\[1pt]")

    parts += ["\\end{minipage}", "\\end{leftcolumn}", "\\begin{rightcolumn}",
              "\\hspace{8pt}", "\\begin{minipage}{0.92\\linewidth}", "\\vspace{8pt}"]

    if c["summary"]:
        parts += ["\\creativeSecR{Summary}", f"{{\\small\\color{{warmGray}} {_tex_escape(c['summary'])}}}", ""]

    if c["work"]:
        parts += ["\\creativeSecR{Experience}"]
        for job in c["work"]:
            if not isinstance(job, dict):
                continue
            parts.append(
                f"\\noindent{{\\bfseries\\color{{dark}} {_tex_escape(job.get('title') or '')}}} "
                f"\\hfill {{\\small\\color{{warmGray}} {_tex_escape(job.get('duration') or '')}}}\\\\"
                f"{{\\small\\itshape\\color{{warmGray}} {_tex_escape(job.get('company') or '')}}}\\\\"
            )
            bullets = _as_list(job.get("bullets"))
            if bullets:
                parts.append(_itemize(bullets, 14))
            parts.append("\\vspace{4pt}")

    if c["projects"]:
        parts += ["\\creativeSecR{Projects}"]
        for p in c["projects"]:
            if not isinstance(p, dict):
                continue
            parts.append(f"\\noindent{{\\bfseries\\color{{dark}} {_tex_escape(p.get('name') or '')}}}\\\\")
            if p.get("description"):
                parts.append(f"{{\\small\\color{{warmGray}} {_tex_escape(p['description'])}}}")
            parts.append("\\vspace{3pt}")

    if c["education"]:
        parts += ["\\creativeSecR{Education}"]
        for ed in c["education"]:
            if not isinstance(ed, dict):
                continue
            parts.append(
                f"{{\\bfseries\\color{{dark}} {_tex_escape(ed.get('degree') or '')}}} "
                f"\\hfill {{\\small\\color{{warmGray}} {_tex_escape(ed.get('year') or '')}}}\\\\"
                f"{{\\small\\itshape\\color{{warmGray}} {_tex_escape(ed.get('school') or '')}}}"
            )

    parts += ["\\end{minipage}", "\\end{rightcolumn}", "\\end{paracol}"]
    return "\n".join(parts)


# ── Academic Research ──────────────────────────────────────────────────────────

def build_academic_research_body(resume_json: dict, job_title: str = "") -> str:
    c = _ctx(resume_json, job_title)
    role = _tex_escape(c["job_title"] or "Professional")
    parts = [
        "\\noindent\\begin{minipage}[t]{0.55\\linewidth}",
        f"  {{\\huge\\bfseries\\color{{darkText}} {_tex_escape(c['name'])}}}\\\\[4pt]",
        f"  {{\\color{{grayText}}\\itshape {role}}}",
        "\\end{minipage}%",
        "\\hfill",
        "\\begin{minipage}[t]{0.40\\linewidth}",
        "  \\raggedleft\\small\\color{grayText}",
    ]
    if c["phone"]:
        parts.append(f"  \\faPhone\\ {_tex_escape(c['phone'])}\\\\[2pt]")
    if c["email"]:
        parts.append(f"  \\faEnvelope\\ {_href_email(c['email'])}\\\\[2pt]")
    if c["github"]:
        parts.append(f"  \\faGlobe\\ {_href_link(c['github'], _strip_scheme(c['github']))}\\\\[2pt]")
    if c["linkedin"]:
        parts.append(f"  \\faLinkedin\\ {_href_link(c['linkedin'], _strip_scheme(c['linkedin']))}\\\\[2pt]")
    if c["location"]:
        parts.append(f"  {_tex_escape(c['location'])}")
    parts += ["\\end{minipage}", "\\vspace{6pt}"]

    if c["summary"]:
        parts += ["\\section{Summary}", f"{{\\small {_tex_escape(c['summary'])}}}", "\\vspace{4pt}"]

    if c["education"]:
        parts += ["\\section{Education}", "\\vspace{4pt}"]
        for ed in c["education"]:
            if not isinstance(ed, dict):
                continue
            parts.append(
                f"\\noindent{{\\bfseries {_tex_escape(ed.get('degree') or '')}}} "
                f"\\hfill {{\\color{{grayText}} {_tex_escape(ed.get('year') or '')}}}\\\\"
                f"{{\\itshape {_tex_escape(ed.get('school') or '')}, {_tex_escape(ed.get('location') or '')}}}\\\\[6pt]"
            )

    if c["work"]:
        parts += ["\\section{Research \\& Experience}", "\\vspace{4pt}"]
        for job in c["work"]:
            if not isinstance(job, dict):
                continue
            parts.append(
                f"\\noindent{{\\bfseries {_tex_escape(job.get('title') or '')}}} "
                f"\\hfill {{\\color{{grayText}} {_tex_escape(job.get('duration') or '')}}}\\\\"
                f"{{\\itshape {_tex_escape(job.get('company') or '')}, {_tex_escape(job.get('location') or '')}}}\\\\"
            )
            bullets = _as_list(job.get("bullets"))
            if bullets:
                parts.append(_itemize(bullets, 16))
            parts.append("\\vspace{4pt}")

    if c["projects"]:
        parts += ["\\section{Projects}", "\\vspace{4pt}"]
        for p in c["projects"]:
            if not isinstance(p, dict):
                continue
            parts.append(f"\\noindent{{\\bfseries {_tex_escape(p.get('name') or '')}}}\\\\")
            if p.get("description"):
                parts.append(f"{{\\small {_tex_escape(p['description'])}}}")
            parts.append("\\vspace{4pt}")

    if c["technical"] or c["soft"]:
        parts += ["\\section{Technical Skills}", "\\vspace{4pt}"]
        if c["technical"]:
            parts.append(f"{{\\small \\textbf{{Skills:}} {_tex_escape(', '.join(c['technical']))}}}\\\\")
        if c["soft"]:
            parts.append(f"{{\\small \\textbf{{Strengths:}} {_tex_escape(', '.join(c['soft']))}}}")

    return "\n".join(parts)


BUILDERS = {
    "jakes_resume": build_jake_body,
    "classic_jake": build_jake_body,
    "executive_timeline": build_executive_timeline_body,
    "bold_header": build_bold_header_body,
    "minimalist_elegant": build_minimalist_elegant_body,
    "pure_white": build_pure_white_body,
    "two_column_sidebar": build_two_column_sidebar_body,
    "corporate_banking": build_corporate_banking_body,
    "startup": build_startup_body,
    "creative": build_creative_body,
    "academic_research": build_academic_research_body,
}


def build_template_body(template_id: str | None, resume_json: dict, job_title: str = "") -> str:
    tid = template_id or default_template_id()
    builder = BUILDERS.get(tid, build_jake_body)
    return builder(resume_json, job_title)
