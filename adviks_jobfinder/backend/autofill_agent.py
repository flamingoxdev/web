"""
Ollama-driven browser agent.

Loop (perception → decision → action):
  1. Capture every interactive element on the page (main frame + iframes)
     and assign each a stable id (e0, e1, ...).
  2. Send the snapshot + the user's profile + tailored resume + action history
     to Ollama in JSON mode.
  3. Ollama returns ONE action: fill | click | upload_resume | select | done.
  4. Execute it via Playwright, append to history, repeat.

Safety: the agent is instructed to NEVER click final submit buttons —
it stops at `done` so the user can review and submit manually.
"""

import asyncio
import json
import os
import tempfile
from typing import Any

import httpx
from playwright.async_api import Page, Frame, ElementHandle


OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")

# Caps to keep the prompt and runtime bounded
MAX_STEPS = 25
MAX_ELEMENTS = 40
MAX_HISTORY = 6


# ── Perception ─────────────────────────────────────────────────────────────

async def _walk_frames(page: Page) -> list[Frame]:
    seen: set[str] = set()
    frames: list[Frame] = []
    pending = [page.main_frame]
    while pending:
        frame = pending.pop()
        key = f"{frame.url}::{frame.name}"
        if key in seen:
            continue
        seen.add(key)
        frames.append(frame)
        pending.extend(frame.child_frames)
    return frames


_INTERACTIVE_SELECTOR = (
    "input:not([type=hidden]), textarea, select, button, "
    "a[href], [role='button'], [role='link']"
)


async def _describe(handle: ElementHandle) -> dict | None:
    """Pull a compact description of an element. Returns None if unusable."""
    try:
        if not await handle.is_visible():
            return None
    except Exception:
        return None

    try:
        info = await handle.evaluate("""el => {
            const labelText = (() => {
                if (el.id) {
                    const l = document.querySelector(`label[for="${el.id}"]`);
                    if (l) return (l.textContent || '').trim();
                }
                const parent = el.closest('label');
                if (parent) return (parent.textContent || '').trim();
                return '';
            })();
            return {
                tag: el.tagName.toLowerCase(),
                type: (el.getAttribute('type') || '').toLowerCase(),
                name: el.getAttribute('name') || '',
                id: el.getAttribute('id') || '',
                placeholder: el.getAttribute('placeholder') || '',
                aria: el.getAttribute('aria-label') || '',
                autocomplete: el.getAttribute('autocomplete') || '',
                text: (el.textContent || '').trim().slice(0, 80),
                label: labelText.slice(0, 120),
                value: ('value' in el) ? (el.value || '') : '',
                disabled: !!el.disabled,
                role: el.getAttribute('role') || ''
            };
        }""")
    except Exception:
        return None

    if info.get("disabled"):
        return None
    # Skip elements with no identifying signal at all
    signal = " ".join(str(info.get(k, "")) for k in ("name", "id", "placeholder", "aria", "label", "text"))
    if not signal.strip():
        return None
    return info


async def _snapshot(page: Page) -> tuple[list[dict], list[tuple[Frame, ElementHandle]]]:
    """Return (json_for_model, handle_table) — index of each list lines up."""
    descriptions: list[dict] = []
    handles: list[tuple[Frame, ElementHandle]] = []
    counter = 0

    for frame in await _walk_frames(page):
        try:
            elements = await frame.query_selector_all(_INTERACTIVE_SELECTOR)
        except Exception:
            continue
        for el in elements:
            if counter >= MAX_ELEMENTS:
                break
            desc = await _describe(el)
            if not desc:
                continue
            desc["id"] = f"e{counter}"
            descriptions.append(desc)
            handles.append((frame, el))
            counter += 1
        if counter >= MAX_ELEMENTS:
            break

    return descriptions, handles


# ── Decision (Ollama) ──────────────────────────────────────────────────────

_AGENT_SYSTEM = """You are an autonomous browser agent applying to a job. \
At every step you observe a list of interactive elements on the current page \
and decide ONE action. You think in short steps.

OUTPUT — a single JSON object, no markdown:
{
  "thought": "brief reasoning, <120 chars",
  "action": "fill" | "click" | "upload_resume" | "select" | "done",
  "element_id": "e0",          // required for fill/click/upload_resume/select
  "value": "string to type"    // required for fill and select
}

RULES (strict):
- Use ONLY element_ids that appear in the snapshot. Never invent one.
- For text/email/phone/url/textarea fields: use action="fill".
- For dropdowns (<select>): use action="select" with the visible option text.
- For file inputs: use action="upload_resume" (the system attaches the user's PDF).
- For 'Apply' / 'Apply now' / 'Continue' buttons that progress to the form: use action="click".
- NEVER click 'Submit application', 'Send application', 'Submit', or any final \
submit-style button. Stop with action="done" so the human can review.
- Skip fields already populated unless explicitly wrong.
- If every relevant field is filled and no further navigation is needed, return action="done".
- Prefer one focused action per step. The page will be re-snapshotted next step.
"""


def _build_user_prompt(personal: dict, tailored: dict, snapshot: list[dict], history: list[dict]) -> str:
    # Trim tailored to keep token usage sane
    tailored_compact = {
        "summary": tailored.get("summary", ""),
        "cover_letter_draft": tailored.get("cover_letter_draft", ""),
        "skills": tailored.get("skills", {}),
    }
    return (
        "USER PROFILE:\n"
        + json.dumps(personal, indent=2)
        + "\n\nTAILORED RESUME (use for free-text fields like cover letter):\n"
        + json.dumps(tailored_compact, indent=2)
        + "\n\nCURRENT PAGE ELEMENTS:\n"
        + json.dumps(snapshot, indent=2)
        + "\n\nACTIONS YOU HAVE ALREADY TAKEN (most recent last):\n"
        + json.dumps(history[-MAX_HISTORY:], indent=2)
        + "\n\nReturn ONLY the JSON object for your next action."
    )


async def _ask_ollama(personal: dict, tailored: dict, snapshot: list[dict], history: list[dict]) -> dict:
    body = {
        "model": MODEL,
        "format": "json",
        "stream": False,
        "messages": [
            {"role": "system", "content": _AGENT_SYSTEM},
            {"role": "user", "content": _build_user_prompt(personal, tailored, snapshot, history)},
        ],
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(f"{OLLAMA_URL}/api/chat", json=body)
        resp.raise_for_status()
        raw = resp.json()["message"]["content"].strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # last-ditch slice between first { and last }
        first, last = raw.find("{"), raw.rfind("}")
        if first != -1 and last > first:
            return json.loads(raw[first : last + 1])
        raise


# ── Action ─────────────────────────────────────────────────────────────────

async def _execute(
    page: Page,
    decision: dict,
    handles: list[tuple[Frame, ElementHandle]],
    snapshot: list[dict],
    resume_pdf_path: str | None,
) -> tuple[bool, str]:
    """Execute one decision. Returns (ok, log_message)."""
    action = (decision.get("action") or "").lower()
    eid = decision.get("element_id") or ""

    if action == "done":
        return True, "agent signaled done"

    # Resolve element_id → handle
    handle: ElementHandle | None = None
    for desc, (frame, h) in zip(snapshot, handles):
        if desc["id"] == eid:
            handle = h
            break

    if handle is None:
        return False, f"unknown element_id {eid!r}"

    try:
        if action == "fill":
            value = decision.get("value", "")
            if not value:
                return False, "fill with empty value, skipped"
            await handle.scroll_into_view_if_needed(timeout=2000)
            await handle.fill(str(value))
            return True, f"filled {eid} = {str(value)[:40]!r}"

        if action == "click":
            text_for_safety = (
                (await handle.evaluate("el => (el.textContent || el.value || '').toLowerCase()")) or ""
            )
            # Defense in depth: never click final-submit buttons even if Ollama tries
            BANNED = ("submit application", "send application", "submit & apply", "submit my application")
            if any(b in text_for_safety for b in BANNED):
                return False, f"refused to click submit-style button: {text_for_safety[:40]!r}"
            await handle.scroll_into_view_if_needed(timeout=2000)
            await handle.click(timeout=4000)
            try:
                await page.wait_for_load_state("networkidle", timeout=6000)
            except Exception:
                await asyncio.sleep(1)
            return True, f"clicked {eid} ({text_for_safety[:40]!r})"

        if action == "select":
            value = decision.get("value", "")
            await handle.scroll_into_view_if_needed(timeout=2000)
            try:
                await handle.select_option(label=str(value))
            except Exception:
                await handle.select_option(value=str(value))
            return True, f"selected {eid} = {str(value)[:40]!r}"

        if action == "upload_resume":
            if not resume_pdf_path:
                return False, "no resume PDF available to upload"
            await handle.set_input_files(resume_pdf_path)
            return True, f"uploaded resume to {eid}"

        return False, f"unknown action {action!r}"
    except Exception as e:
        return False, f"{action} on {eid} failed: {e}"


# ── Main loop ──────────────────────────────────────────────────────────────

async def run_agent(
    page: Page,
    personal: dict,
    tailored: dict,
    resume_pdf: bytes | None,
) -> dict:
    """Drive the page with Ollama until it returns 'done' or we hit MAX_STEPS."""
    history: list[dict] = []
    log: list[str] = []

    pdf_path: str | None = None
    if resume_pdf:
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.write(resume_pdf)
        tmp.close()
        pdf_path = tmp.name

    try:
        for step in range(1, MAX_STEPS + 1):
            try:
                await page.wait_for_load_state("domcontentloaded", timeout=5000)
            except Exception:
                pass

            snapshot, handles = await _snapshot(page)
            if not snapshot:
                log.append(f"step {step}: no interactive elements found, stopping")
                break

            try:
                decision = await _ask_ollama(personal, tailored, snapshot, history)
            except Exception as e:
                log.append(f"step {step}: ollama call failed: {e}")
                break

            log.append(f"step {step}: thought={decision.get('thought','')!r} action={decision.get('action')} id={decision.get('element_id')}")
            history.append({
                "step": step,
                "action": decision.get("action"),
                "element_id": decision.get("element_id"),
                "value_preview": (str(decision.get("value", ""))[:30]) if decision.get("value") else "",
            })

            ok, msg = await _execute(page, decision, handles, snapshot, pdf_path)
            log.append(f"   → {'ok' if ok else 'skip'}: {msg}")

            if decision.get("action") == "done":
                break

            # Small breather between steps so SPAs can settle
            await asyncio.sleep(0.5)
    finally:
        if pdf_path:
            try:
                os.unlink(pdf_path)
            except Exception:
                pass

    return {
        "steps_taken": len(history),
        "history": history,
        "log": log,
    }
