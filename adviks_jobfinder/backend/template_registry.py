"""Load resume LaTeX templates from ALLtemplates/."""

from pathlib import Path

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "ALLtemplates"

# id -> (filename, display name, short description)
TEMPLATE_CATALOG: dict[str, tuple[str, str, str]] = {
    "jakes_resume": ("jakes_resume.txt", "Jake's Resume", "Classic SWE one-pager — proven ATS layout"),
    "classic_jake": ("classic_jake.txt", "Classic Jake", "Traditional academic + experience flow"),
    "executive_timeline": ("ExecutiveTimeline.txt", "Executive Timeline", "Premium timeline with gold accents"),
    "bold_header": ("BoldHeader.txt", "Bold Header", "Strong name bar, modern sections"),
    "minimalist_elegant": ("MinimalistElegant.txt", "Minimalist Elegant", "Clean whitespace, serif feel"),
    "pure_white": ("PureWhite.txt", "Pure White", "Ultra-clean monochrome"),
    "two_column_sidebar": ("twocolumnsidebar.txt", "Two-Column Sidebar", "Skills sidebar + main content"),
    "corporate_banking": ("corporateBanking.txt", "Corporate Banking", "Conservative finance-style layout"),
    "startup": ("startup.txt", "Startup", "Modern startup / product engineer vibe"),
    "creative": ("Creative.txt", "Creative", "Design-forward with accent color"),
    "academic_research": ("AcademicResearch.txt", "Academic Research", "Publications & research focus"),
}


def list_templates() -> list[dict]:
    out: list[dict] = []
    for tid, (fname, name, desc) in TEMPLATE_CATALOG.items():
        path = TEMPLATES_DIR / fname
        out.append({
            "id": tid,
            "name": name,
            "description": desc,
            "available": path.is_file(),
        })
    return out


def get_template_source(template_id: str) -> str | None:
    entry = TEMPLATE_CATALOG.get(template_id)
    if not entry:
        return None
    path = TEMPLATES_DIR / entry[0]
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8", errors="ignore")


def default_template_id() -> str:
    return "jakes_resume"
