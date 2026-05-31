"""Compile LaTeX to PDF using remote services (with sanitization for cloud TeX)."""

import os
import re
import httpx


def sanitize_latex(source: str) -> str:
    """Remove directives that break most online TeX compilers."""
    tex = source or ""
    tex = re.sub(r"\\input\{glyphtounicode\}\s*", "", tex)
    tex = re.sub(r"\\pdfgentounicode\s*=\s*1\s*", "", tex)
    if "\\begin{document}" not in tex:
        tex = (
            "\\documentclass[11pt,letterpaper]{article}\n"
            "\\usepackage[margin=0.75in]{geometry}\n"
            "\\usepackage{enumitem}\n"
            "\\usepackage[hidelinks]{hyperref}\n"
            "\\begin{document}\n" + tex + "\n\\end{document}\n"
        )
    return tex


def _try_texlive_net(tex: str) -> bytes | None:
    """Primary: texlive.net (free, no API key). Requires filename document.tex."""
    try:
        with httpx.Client(follow_redirects=True, timeout=120) as client:
            resp = client.post(
                "https://texlive.net/cgi-bin/latexcgi",
                data={"engine": "pdflatex", "return": "pdf"},
                files=[
                    ("filename[]", (None, "document.tex")),
                    ("filecontents[]", (None, tex)),
                ],
            )
        if resp.status_code == 200 and resp.content[:4] == b"%PDF":
            return resp.content
        if resp.status_code == 200:
            print(f"[latex_compile] texlive log: {resp.text[:400]}")
    except Exception as e:
        print(f"[latex_compile] texlive failed: {e}")
    return None


def _try_texapi(tex: str) -> bytes | None:
    api_key = os.getenv("TEXAPI_KEY") or os.getenv("TEXAPI_API_KEY")
    if not api_key:
        return None
    try:
        with httpx.Client(follow_redirects=True, timeout=90) as client:
            resp = client.post(
                "https://texapi.ovh/api/latex/compile/file?compiler=pdflatex",
                headers={"X-API-KEY": api_key},
                files={"files": ("document.tex", tex.encode("utf-8"), "application/x-tex")},
            )
        if resp.status_code == 200 and resp.content[:4] == b"%PDF":
            return resp.content
    except Exception as e:
        print(f"[latex_compile] texapi failed: {e}")
    return None


def compile_latex_to_pdf(source: str) -> tuple[bytes | None, str]:
    """Return (pdf_bytes, error_message). error_message empty on success."""
    tex = sanitize_latex(source)
    for attempt in (_try_texlive_net, _try_texapi):
        pdf = attempt(tex)
        if pdf:
            return pdf, ""
    return None, (
        "PDF compilation failed. Check for special characters in your resume text "
        "and try again, or switch to Jake's Resume template."
    )
