"""
ATS Resume Analyzer — scores an uploaded resume and returns actionable
improvement suggestions without any hallucination.

ATS Score (0–100) is calculated from:
  - Section presence (20 pts): contact, summary, skills, experience, projects, education
  - Keyword density (25 pts): action verbs, technical keywords
  - Quantified bullets (20 pts): bullets containing numbers / percentages
  - Formatting signals (15 pts): no tables/columns indication, proper length
  - Content quality (20 pts): bullet length, skills count, experience entries
"""

import re

# ── Action verbs (ATS favourites) ─────────────────────────────────────────

ACTION_VERBS = {
    "achieved", "architected", "automated", "built", "collaborated", "created",
    "delivered", "deployed", "designed", "developed", "drove", "engineered",
    "enhanced", "established", "executed", "founded", "generated", "grew",
    "implemented", "improved", "increased", "launched", "led", "managed",
    "mentored", "migrated", "optimized", "pioneered", "produced", "reduced",
    "refactored", "released", "researched", "resolved", "scaled", "shipped",
    "spearheaded", "streamlined", "trained", "transformed",
}

# ── Section detection ──────────────────────────────────────────────────────

SECTION_PATTERNS = {
    "contact":    re.compile(r"(email|phone|linkedin|github|@|\.com)", re.I),
    "summary":    re.compile(r"\b(summary|objective|profile|about)\b", re.I),
    "skills":     re.compile(r"\b(skills?|technologies|tools|languages|proficiency)\b", re.I),
    "experience": re.compile(r"\b(experience|employment|work history|positions?)\b", re.I),
    "projects":   re.compile(r"\b(projects?|portfolio|personal work)\b", re.I),
    "education":  re.compile(r"\b(education|degree|university|college|bachelor|master|b\.s\.|m\.s\.)\b", re.I),
}

# ── Scoring ────────────────────────────────────────────────────────────────

def _detect_sections(text: str) -> dict[str, bool]:
    return {name: bool(pat.search(text)) for name, pat in SECTION_PATTERNS.items()}


def _count_action_verbs(text: str) -> int:
    words = set(re.findall(r"\b[a-z]+\b", text.lower()))
    return len(words & ACTION_VERBS)


def _count_quantified_bullets(text: str) -> int:
    """Count bullet lines that contain a number or percentage."""
    bullets = [l.strip() for l in text.splitlines() if re.match(r"^[•\-–*▸]\s+|^\d+\.\s+", l.strip())]
    return sum(1 for b in bullets if re.search(r"\d", b))


def _extract_bullets(text: str) -> list[str]:
    return [
        l.strip()
        for l in text.splitlines()
        if re.match(r"^[•\-–*▸]\s+|^\d+\.\s+", l.strip())
    ]


def _extract_skills_from_text(text: str) -> list[str]:
    """Heuristic: grab words in the skills section."""
    skills_section = re.search(
        r"(?:skills?|technologies|tools)[^\n]*\n(.*?)(?:\n\n|\Z)",
        text, re.I | re.DOTALL
    )
    if not skills_section:
        return []
    raw = skills_section.group(1)
    items = re.split(r"[,;|•\n]+", raw)
    return [i.strip() for i in items if 2 < len(i.strip()) < 40]


def _word_count(text: str) -> int:
    return len(text.split())


# ── Main analyzer ──────────────────────────────────────────────────────────

def analyze_resume(resume_text: str, extracted_skills: list[str] | None = None) -> dict:
    """
    Analyze a resume text and return a structured ATS report.

    Returns:
      {
        "ats_score": int (0-100),
        "grade": "A" | "B" | "C" | "D" | "F",
        "sections": { name: bool },
        "issues": [ {"severity": "high"|"medium"|"low", "message": str} ],
        "improvements": [ str ],
        "missing_sections": [ str ],
        "stats": { action_verbs, quantified_bullets, word_count, skills_count }
      }
    """
    text = resume_text or ""
    issues = []
    improvements = []
    score = 0

    # ── 1. Section presence (20 pts) ──────────────────────────────────────
    sections = _detect_sections(text)
    present_count = sum(sections.values())
    section_score = round((present_count / len(sections)) * 20)
    score += section_score

    missing_sections = [name for name, present in sections.items() if not present]
    for sec in missing_sections:
        issues.append({
            "severity": "high" if sec in ("experience", "skills", "contact") else "medium",
            "message": f"Missing '{sec}' section — ATS systems may reject this resume.",
        })
        improvements.append(f"Add a dedicated '{sec}' section.")

    # ── 2. Action verbs (25 pts) ───────────────────────────────────────────
    verb_count = _count_action_verbs(text)
    verb_score = min(25, verb_count * 2)
    score += verb_score

    if verb_count < 5:
        issues.append({
            "severity": "high",
            "message": f"Only {verb_count} strong action verbs detected. ATS scanners rank resumes higher with 10+ action verbs.",
        })
        improvements.append("Start each bullet with a strong action verb: Achieved, Built, Deployed, Optimized, etc.")
    elif verb_count < 10:
        issues.append({
            "severity": "medium",
            "message": f"{verb_count} action verbs found. Aim for 10+ for best ATS ranking.",
        })

    # ── 3. Quantified bullets (20 pts) ────────────────────────────────────
    bullets = _extract_bullets(text)
    quantified = _count_quantified_bullets(text)
    total_bullets = len(bullets)

    if total_bullets > 0:
        quant_ratio = quantified / total_bullets
        quant_score = round(quant_ratio * 20)
    else:
        quant_score = 0
    score += quant_score

    if total_bullets == 0:
        issues.append({
            "severity": "high",
            "message": "No bullet points detected. Add bullet points to your experience and projects sections.",
        })
        improvements.append("Use bullet points starting with action verbs for each role.")
    elif quant_ratio < 0.3:
        issues.append({
            "severity": "medium",
            "message": f"Only {quantified}/{total_bullets} bullets contain numbers. Quantified results (%, $, x faster) rank higher.",
        })
        improvements.append("Add metrics to bullets: 'Reduced load time by 40%' beats 'Improved performance'.")

    # ── 4. Formatting signals (15 pts) ────────────────────────────────────
    word_count = _word_count(text)
    fmt_score = 0

    if 300 <= word_count <= 800:
        fmt_score += 10
    elif word_count < 300:
        issues.append({"severity": "high", "message": f"Resume is very short ({word_count} words). Aim for 400–700 words for a 1-page resume."})
        improvements.append("Expand your experience bullets and add a projects section.")
    elif word_count > 1200:
        issues.append({"severity": "medium", "message": f"Resume is long ({word_count} words). Consider trimming to 1 page for entry/mid-level roles."})
        improvements.append("Remove older or less relevant positions to keep the resume to 1 page.")
        fmt_score += 5

    # Check for email presence (basic contact check)
    if re.search(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text):
        fmt_score += 5
    else:
        issues.append({"severity": "high", "message": "No email address detected in resume."})

    score += fmt_score

    # ── 5. Content quality (20 pts) ───────────────────────────────────────
    skills_from_text = _extract_skills_from_text(text)
    all_skills = list(set(list(skills_from_text) + list(extracted_skills or [])))
    skills_count = len(all_skills)

    content_score = 0
    if skills_count >= 10:
        content_score += 10
    elif skills_count >= 5:
        content_score += 6
        issues.append({"severity": "low", "message": f"Only {skills_count} skills detected. Listing 10+ specific technical skills improves ATS scoring."})
    else:
        issues.append({"severity": "medium", "message": f"Very few skills listed ({skills_count}). Add a comprehensive skills section."})
        improvements.append("List 10–20 specific technical skills relevant to your target roles.")

    # Check if summary exists for content bonus
    if sections.get("summary"):
        content_score += 5
    else:
        improvements.append("Add a 2–3 sentence professional summary at the top of your resume.")

    # Bullet quality: average bullet length
    if bullets:
        avg_len = sum(len(b) for b in bullets) / len(bullets)
        if avg_len >= 60:
            content_score += 5
        else:
            issues.append({"severity": "low", "message": "Bullets are short. Aim for 10–20 words per bullet with context and impact."})

    score += content_score

    # ── Grade ──────────────────────────────────────────────────────────────
    score = min(100, max(0, score))
    if score >= 85:
        grade = "A"
    elif score >= 70:
        grade = "B"
    elif score >= 55:
        grade = "C"
    elif score >= 40:
        grade = "D"
    else:
        grade = "F"

    # Sort issues by severity
    sev_order = {"high": 0, "medium": 1, "low": 2}
    issues.sort(key=lambda x: sev_order.get(x["severity"], 3))

    return {
        "ats_score": score,
        "grade": grade,
        "sections": sections,
        "issues": issues,
        "improvements": improvements[:8],  # top 8 suggestions
        "missing_sections": missing_sections,
        "stats": {
            "action_verbs": verb_count,
            "quantified_bullets": quantified,
            "total_bullets": total_bullets,
            "word_count": word_count,
            "skills_count": skills_count,
        },
    }
