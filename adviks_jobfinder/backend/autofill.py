"""
Playwright launcher for job-application autofill.

Launches a persistent Chromium profile (so logins/cookies survive across runs),
navigates to the job URL, then hands the page to the Ollama agent which makes
every subsequent decision — what to click, what to fill, when to stop.

The agent is in autofill_agent.py. This module only sets up the browser
and surfaces the agent's result.
"""

import os
from pathlib import Path

from playwright.async_api import async_playwright, Page

from autofill_agent import run_agent


# Persistent profile dir — keeps cookies/sessions/extensions across runs so the
# browser doesn't look incognito. Override with INTERNMATCH_PROFILE_DIR env var.
_DEFAULT_PROFILE_DIR = str(Path.home() / ".internmatch-chrome")


async def auto_fill_application(
    job_url: str,
    user_data: dict,
    tailored_data: dict,
    resume_pdf: bytes | None = None,
) -> dict:
    result: dict = {"status": "pending", "message": "", "agent": None}

    profile_dir = os.getenv("INTERNMATCH_PROFILE_DIR", _DEFAULT_PROFILE_DIR)
    os.makedirs(profile_dir, exist_ok=True)

    try:
        async with async_playwright() as p:
            context = await p.chromium.launch_persistent_context(
                user_data_dir=profile_dir,
                headless=False,
                viewport={"width": 1280, "height": 900},
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                args=["--disable-blink-features=AutomationControlled"],
            )
            page: Page = context.pages[0] if context.pages else await context.new_page()

            await page.goto(job_url, wait_until="domcontentloaded", timeout=45000)
            try:
                await page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass

            # Hand control to Ollama. It snapshots the page, decides, executes,
            # repeats until it returns "done" or hits the step cap.
            agent_result = await run_agent(page, user_data, tailored_data, resume_pdf)

            # Derive a friendly list for the existing UI (chips on the apply page)
            fields_filled = []
            for h in agent_result.get("history", []):
                if h.get("action") not in ("fill", "click", "upload_resume", "select"):
                    continue
                if h.get("ok") is False:
                    continue
                element_ref = h.get("element_id") or h.get("id") or "unknown"
                fields_filled.append(f"{h.get('action')}:{element_ref}")

            result["status"] = "filled"
            result["agent"] = agent_result
            result["fields_filled"] = fields_filled
            result["message"] = (
                f"Agent ran {agent_result['steps_taken']} steps. "
                "Review the form in the browser and submit manually."
            )

            # Keep the browser open for the user to review + submit (10 min cap).
            try:
                await page.wait_for_event("close", timeout=600_000)
            except Exception:
                pass

            await context.close()

    except Exception as e:
        result["status"] = "error"
        result["message"] = f"Auto-fill failed: {e}"

    return result


async def test_connection(job_url: str) -> dict:
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            resp = await page.goto(job_url, wait_until="domcontentloaded", timeout=15000)
            title = await page.title()
            await browser.close()
            return {
                "reachable": True,
                "title": title,
                "status_code": resp.status if resp else None,
            }
    except Exception as e:
        return {"reachable": False, "error": str(e)}
