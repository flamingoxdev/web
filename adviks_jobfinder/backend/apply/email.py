"""Email apply — SMTP (Gmail/normal inbox) or Resend (verified domain)."""

import asyncio
import base64
import os
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "")
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")

FREE_EMAIL_DOMAINS = frozenset({
    "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com",
    "outlook.com", "live.com", "icloud.com", "aol.com", "proton.me", "protonmail.com",
})


def _from_address() -> str:
    return (EMAIL_FROM or SMTP_USER or "").strip()


def _extract_domain(addr: str) -> str:
    addr = addr.strip()
    if "<" in addr:
        addr = addr.split("<")[-1].rstrip(">").strip()
    if "@" not in addr:
        return ""
    return addr.split("@")[-1].lower()


def smtp_configured() -> bool:
    return bool(SMTP_USER.strip() and SMTP_PASSWORD.strip())


def resend_configured() -> bool:
    if not RESEND_API_KEY or not EMAIL_FROM:
        return False
    domain = _extract_domain(EMAIL_FROM)
    if not domain or domain in FREE_EMAIL_DOMAINS:
        return False
    return True


def email_apply_available() -> bool:
    """True when we can actually send application emails."""
    return smtp_configured() or resend_configured()


def get_apply_capabilities() -> dict:
    return {
        "greenhouse": True,
        "email": email_apply_available(),
        "email_via": "smtp" if smtp_configured() else ("resend" if resend_configured() else None),
    }


def is_auto_apply_eligible(method: str | None) -> bool:
    if method == "greenhouse":
        return True
    if method == "email":
        return email_apply_available()
    return False


def _build_html(user_profile: dict, cover_letter: str) -> str:
    paragraphs = [p.strip() for p in cover_letter.split("\n") if p.strip()]
    body_html = "".join(f"<p>{p}</p>" for p in paragraphs)
    linkedin = user_profile.get("linkedin")
    linkedin_html = f'<a href="{linkedin}">LinkedIn</a>' if linkedin else ""
    return f"""
    <p>Dear Hiring Team,</p>
    {body_html}
    <p>Best regards,<br/>
    {user_profile.get('first_name', '')} {user_profile.get('last_name', '')}<br/>
    {user_profile.get('email', '')} | {user_profile.get('phone', '')}<br/>
    {linkedin_html}
    </p>
    """


def _resume_filename(user_profile: dict) -> str:
    return (
        f"{user_profile.get('first_name', 'Resume')}_{user_profile.get('last_name', '')}_Resume.pdf"
    ).replace(" ", "_")


def _send_smtp_sync(
    *,
    to_email: str,
    subject: str,
    html: str,
    resume_base64: str,
    filename: str,
    from_addr: str,
) -> None:
    msg = MIMEMultipart()
    msg["From"] = from_addr
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html"))

    pdf_bytes = base64.b64decode(resume_base64)
    attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
    attachment.add_header("Content-Disposition", "attachment", filename=filename)
    msg.attach(attachment)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(from_addr, [to_email], msg.as_string())


async def _send_via_smtp(
    *,
    to_email: str,
    subject: str,
    html: str,
    resume_base64: str,
    filename: str,
    from_addr: str,
) -> None:
    await asyncio.to_thread(
        _send_smtp_sync,
        to_email=to_email,
        subject=subject,
        html=html,
        resume_base64=resume_base64,
        filename=filename,
        from_addr=from_addr,
    )


async def _send_via_resend(
    *,
    to_email: str,
    subject: str,
    html: str,
    resume_base64: str,
    filename: str,
    from_addr: str,
) -> None:
    payload = {
        "from": from_addr,
        "to": [to_email],
        "subject": subject,
        "html": html,
        "attachments": [{"filename": filename, "content": resume_base64}],
    }
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json=payload,
        )
    if not res.is_success:
        detail = res.text[:300]
        if "domain is not verified" in detail.lower() or "validation_error" in detail.lower():
            raise RuntimeError(
                "Resend requires a verified custom domain. For Gmail/normal email, set "
                "SMTP_USER, SMTP_PASSWORD, and EMAIL_FROM in .env instead (use a Gmail app password)."
            )
        raise RuntimeError(f"Resend failed: {detail}")


async def apply_via_email(
    *,
    to_email: str,
    job: dict,
    user_profile: dict,
    resume_base64: str,
    cover_letter: str,
) -> dict:
    if not email_apply_available():
        raise RuntimeError(
            "Email apply is not configured. Add SMTP_USER + SMTP_PASSWORD + EMAIL_FROM to .env "
            "(Gmail app password), or use Resend with a verified domain."
        )

    from_addr = _from_address()
    if not from_addr:
        raise RuntimeError("Set EMAIL_FROM (or SMTP_USER) in .env")

    subject = (
        f"Application for {job.get('title', 'Role')} — "
        f"{user_profile.get('first_name', '')} {user_profile.get('last_name', '')}".strip()
    )
    html = _build_html(user_profile, cover_letter)
    filename = _resume_filename(user_profile)

    if smtp_configured():
        await _send_via_smtp(
            to_email=to_email,
            subject=subject,
            html=html,
            resume_base64=resume_base64,
            filename=filename,
            from_addr=from_addr,
        )
    else:
        await _send_via_resend(
            to_email=to_email,
            subject=subject,
            html=html,
            resume_base64=resume_base64,
            filename=filename,
            from_addr=from_addr,
        )

    return {"success": True, "method": "email", "to": to_email}
