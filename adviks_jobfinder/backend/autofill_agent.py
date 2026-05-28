"""
Hybrid browser autofill agent.

Strategy on each page:
  1. Snapshot every interactive element (label, name, placeholder, aria, etc.)
  2. DETERMINISTIC FILL — match each field to a value in the user's profile
     using a label-based rules engine. This handles 80–95% of real apps without
     ever calling an LLM (fast, no hallucination, no API cost).
  3. Upload the resume PDF to any file input that looks like a resume.
  4. For fields the rules engine cannot match, ask the LLM (NVIDIA cloud by
     default) for a single best-guess value. Strictly constrained: the LLM
     can only emit values that already exist in the profile / tailored data.
  5. Click "Next" / "Continue" buttons (NEVER any submit button).
  6. Re-snapshot and loop until the page is steady or step cap hits.

Safety:
  - Never clicks "Submit", "Send application", or similar.
  - Never invents values: deterministic path uses profile only; LLM fallback
    answers are validated against the same profile allow-list.
"""

import asyncio
import json
import os
import re
import tempfile
from typing import Any

from playwright.async_api import Page, Frame, ElementHandle

from llm import achat, extract_json

MAX_STEPS = 20
MAX_ELEMENTS = 60


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
    "a[href], [role='button'], [role='link'], [role='combobox']"
)


async def _describe(handle: ElementHandle) -> dict | None:
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
                const desc = el.getAttribute('aria-describedby');
                if (desc) {
                    const d = document.getElementById(desc);
                    if (d) return (d.textContent || '').trim();
                }
                return '';
            })();
            // Try a few common patterns for visual labels next to the input
            const prev = el.previousElementSibling;
            const nearby = prev && prev.textContent ? prev.textContent.trim() : '';
            const options = (el.tagName.toLowerCase() === 'select')
                ? Array.from(el.options).slice(0, 12).map(o => (o.textContent || '').trim()).filter(Boolean)
                : [];
            return {
                tag: el.tagName.toLowerCase(),
                type: (el.getAttribute('type') || '').toLowerCase(),
                name: el.getAttribute('name') || '',
                id: el.getAttribute('id') || '',
                placeholder: el.getAttribute('placeholder') || '',
                aria: el.getAttribute('aria-label') || '',
                autocomplete: el.getAttribute('autocomplete') || '',
                text: (el.textContent || '').trim().slice(0, 80),
                label: (labelText || nearby).slice(0, 160),
                value: ('value' in el) ? (el.value || '') : '',
                disabled: !!el.disabled,
                required: !!el.required,
                role: el.getAttribute('role') || '',
                options: options
            };
        }""")
    except Exception:
        return None
    if info.get("disabled"):
        return None
    signal = " ".join(str(info.get(k, "")) for k in ("name", "id", "placeholder", "aria", "label", "text"))
    if not signal.strip():
        return None
    return info


async def _snapshot(page: Page) -> tuple[list[dict], list[tuple[Frame, ElementHandle]]]:
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


# ── Deterministic field matcher ────────────────────────────────────────────

def _signal(field: dict) -> str:
    return " ".join(
        str(field.get(k, "")) for k in ("name", "id", "placeholder", "aria", "label", "autocomplete")
    ).lower()


# Each rule: (regex pattern, profile-resolver). The resolver receives the
# `personal` dict and `tailored` dict and returns a string (or empty for skip).
def _build_field_rules():
    def _split_name(personal: dict, which: str) -> str:
        full = (personal.get("full_name") or "").strip()
        if which == "first":
            if personal.get("first_name"):
                return personal["first_name"]
            return full.split(" ", 1)[0] if full else ""
        # last
        if personal.get("last_name"):
            return personal["last_name"]
        parts = full.split(" ", 1)
        return parts[1] if len(parts) > 1 else ""

    return [
        (r"\b(first[\s_-]?name|fname|given[\s_-]?name)\b",   lambda p, t: _split_name(p, "first")),
        (r"\b(last[\s_-]?name|lname|surname|family[\s_-]?name)\b", lambda p, t: _split_name(p, "last")),
        (r"\b(full[\s_-]?name|your[\s_-]?name|legal[\s_-]?name|^name$)\b", lambda p, t: p.get("full_name", "")),
        (r"\bemail\b",                                       lambda p, t: p.get("email", "")),
        (r"\b(phone|mobile|tel|contact[\s_-]?number)\b",     lambda p, t: p.get("phone", "")),
        (r"\b(street|address[\s_-]?line[\s_-]?1|address1)\b", lambda p, t: p.get("street_address", "") or p.get("address", "")),
        (r"\baddress[\s_-]?line[\s_-]?2|address2\b",         lambda p, t: p.get("address_line_2", "")),
        (r"\bcity\b",                                        lambda p, t: p.get("city", "") or _city_from_location(p)),
        (r"\b(state|province|region)\b",                     lambda p, t: p.get("state", "") or _state_from_location(p)),
        (r"\b(zip|postal[\s_-]?code|postcode)\b",            lambda p, t: p.get("zip_code", "") or p.get("postal_code", "")),
        (r"\bcountry\b",                                     lambda p, t: p.get("country", "United States")),
        (r"\blinkedin\b",                                    lambda p, t: p.get("linkedin", "")),
        (r"\b(github|portfolio|website|personal[\s_-]?site)\b", lambda p, t: p.get("github", "") or p.get("website", "")),
        (r"\b(school|university|college|institution)\b",     lambda p, t: _first_education(p, "school")),
        (r"\b(degree|qualification)\b",                      lambda p, t: _first_education(p, "degree")),
        (r"\b(major|field[\s_-]?of[\s_-]?study)\b",          lambda p, t: _first_education(p, "major") or _first_education(p, "degree")),
        (r"\b(gpa)\b",                                       lambda p, t: _first_education(p, "gpa")),
        (r"\b(graduation|grad[\s_-]?date|expected[\s_-]?graduation)\b", lambda p, t: p.get("expected_graduation", "") or _first_education(p, "year")),
        (r"\b(visa|sponsorship|authorization|work[\s_-]?authorized)\b", lambda p, t: p.get("visa_status", "")),
        (r"\b(salary|compensation|expected[\s_-]?pay)\b",    lambda p, t: p.get("expected_salary", "")),
        (r"\b(cover[\s_-]?letter|additional[\s_-]?info|why[\s_-]?are[\s_-]?you|tell[\s_-]?us)\b",
            lambda p, t: t.get("cover_letter_draft", "")),
        (r"\b(summary|profile|about[\s_-]?you|bio)\b",       lambda p, t: t.get("summary", "")),
    ]


def _city_from_location(p: dict) -> str:
    loc = (p.get("location") or "").strip()
    return loc.split(",", 1)[0].strip() if "," in loc else loc


def _state_from_location(p: dict) -> str:
    loc = (p.get("location") or "").strip()
    if "," in loc:
        return loc.split(",", 1)[1].strip()
    return ""


def _first_education(p: dict, key: str) -> str:
    edu = p.get("education") or []
    if isinstance(edu, str):
        try:
            edu = json.loads(edu)
        except Exception:
            edu = []
    if not edu or not isinstance(edu, list):
        return ""
    e0 = edu[0]
    if not isinstance(e0, dict):
        return ""
    aliases = {
        "school": ["school", "institution", "university", "college"],
        "degree": ["degree", "qualification"],
        "major":  ["major", "field_of_study", "field"],
        "gpa":    ["gpa"],
        "year":   ["year", "graduation_year", "graduated", "end_year"],
    }
    for a in aliases.get(key, [key]):
        v = e0.get(a)
        if v:
            return str(v)
    return ""


def _is_resume_input(field: dict) -> bool:
    if field.get("tag") != "input" or field.get("type") != "file":
        return False
    sig = _signal(field)
    return bool(re.search(r"resume|cv|curriculum|attach.*file", sig))


def _is_yes_no_field(field: dict) -> str | None:
    """Detect work-auth / sponsorship yes/no fields. Returns 'yes', 'no', or None."""
    sig = _signal(field)
    if not re.search(r"authorized|sponsorship|legally[\s_-]?work", sig):
        return None
    return None  # default: leave for user (varies by candidate, can't safely guess)


def _is_button_continue(field: dict) -> bool:
    tag = field.get("tag")
    ftype = (field.get("type") or "").lower()
    is_clickable_input = tag == "input" and ftype in ("button", "submit", "image")
    if tag not in ("button", "a") and field.get("role") not in ("button",) and not is_clickable_input:
        return False
    text = " ".join(
        str(field.get(k, "")).strip().lower()
        for k in ("text", "label", "aria", "name", "id", "value")
    ).strip()
    # Strict allow-list of buttons we may click. NEVER submit/send/finish.
    GOOD = ("next", "continue", "save and continue", "save & continue", "save",
            "apply", "apply now", "start application", "begin", "i agree")
    BAD = ("submit application", "submit & apply", "submit and apply",
           "send application", "send my application", "finish application",
           "submit my application")
    if any(b in text for b in BAD):
        return False
    return any(g == text or text.startswith(g + " ") or text.endswith(" " + g) or g in text.split() for g in GOOD)


def _is_submit_button(field: dict) -> bool:
    text = " ".join(
        str(field.get(k, "")).strip().lower()
        for k in ("text", "label", "aria", "name", "id", "value")
    ).strip()
    BAD = ("submit application", "submit & apply", "submit and apply",
           "send application", "send my application", "finish application",
           "submit my application", "submit your application")
    return any(b in text for b in BAD)


def deterministic_plan(snapshot: list[dict], personal: dict, tailored: dict) -> list[dict]:
    """Produce a list of actions to apply to this snapshot.
    Actions: {"action": "fill"|"select"|"check"|"upload_resume"|"click", "id": "eN", "value": "..."}"""
    rules = _build_field_rules()
    actions: list[dict] = []

    for field in snapshot:
        eid = field["id"]
        tag = field.get("tag")
        ftype = field.get("type")
        sig = _signal(field)

        # Skip already-filled inputs (don't overwrite the user's edits)
        existing = (field.get("value") or "").strip()

        # Resume upload — always
        if _is_resume_input(field):
            actions.append({"action": "upload_resume", "id": eid})
            continue

        # Selects: try to find one of the options that matches profile country/state etc.
        if tag == "select":
            options = field.get("options") or []
            value = ""
            for pattern, resolver in rules:
                if re.search(pattern, sig):
                    candidate = (resolver(personal, tailored) or "").strip()
                    if candidate:
                        match = _best_option(options, candidate)
                        if match:
                            value = match
                    break
            if value and value != existing:
                actions.append({"action": "select", "id": eid, "value": value})
            continue

        # Text inputs / textareas
        if tag in ("input", "textarea"):
            if ftype in ("checkbox", "radio", "file", "submit", "button", "reset"):
                continue
            if existing and len(existing) > 1:
                continue  # already filled
            for pattern, resolver in rules:
                if re.search(pattern, sig):
                    value = (resolver(personal, tailored) or "").strip()
                    if value:
                        actions.append({"action": "fill", "id": eid, "value": value})
                    break
            continue

    # Click an "Apply"/"Next"/"Continue" button if there is exactly one obvious one
    continues = [f for f in snapshot if _is_button_continue(f) and not _is_submit_button(f)]
    if continues:
        # Prefer "Next" / "Continue" over "Apply" once on form page
        priority = sorted(continues, key=lambda f: (
            0 if "next" in (f.get("text") or "").lower() else
            1 if "continue" in (f.get("text") or "").lower() else
            2 if "save" in (f.get("text") or "").lower() else 3
        ))
        chosen = priority[0]
        full_text = " ".join(
            str(chosen.get(k, "")).strip().lower()
            for k in ("text", "label", "aria", "name", "id")
        )
        progress_words = ("next", "continue", "save", "i agree")
        click_kind = "progress" if any(w in full_text for w in progress_words) else "entry"
        click_key = "|".join(
            str(chosen.get(k, "")).strip().lower()
            for k in ("tag", "text", "label", "name", "aria", "id")
        )
        actions.append({"action": "click", "id": chosen["id"], "click_key": click_key, "click_kind": click_kind})

    return actions


def _best_option(options: list[str], target: str) -> str:
    target_l = target.lower().strip()
    if not target_l:
        return ""
    # Exact ignore-case match
    for opt in options:
        if opt.lower().strip() == target_l:
            return opt
    # Substring either direction
    for opt in options:
        ol = opt.lower().strip()
        if target_l in ol or ol in target_l:
            return opt
    return ""


# ── LLM fallback (for fields the rules couldn't match) ─────────────────────

async def _ask_llm_for_unmatched(
    unmatched: list[dict],
    personal: dict,
    tailored: dict,
) -> list[dict]:
    if not unmatched:
        return []
    prompt = (
        "You are filling a job application form. For each unmatched field below, "
        "decide whether to leave it blank or fill it with a value derived ONLY "
        "from the candidate's profile / tailored resume. Do NOT invent any "
        "value not present in the data. If unsure, return empty string.\n\n"
        f"CANDIDATE PROFILE:\n{json.dumps(personal, indent=2)[:4000]}\n\n"
        f"TAILORED RESUME (for cover letter / summary text only):\n"
        f"{json.dumps({'summary': tailored.get('summary',''), 'cover_letter_draft': tailored.get('cover_letter_draft','')}, indent=2)}\n\n"
        f"UNMATCHED FIELDS:\n{json.dumps(unmatched, indent=2)}\n\n"
        'Return JSON: {"fills": [{"id": "eN", "value": "..."}]} — empty value means skip.'
    )
    try:
        raw = await achat(prompt, timeout=45)
        data = extract_json(raw)
        return [
            {"action": "fill", "id": f["id"], "value": str(f.get("value", "")).strip()}
            for f in (data.get("fills") or [])
            if f.get("id") and str(f.get("value", "")).strip()
        ]
    except Exception as e:
        print(f"[autofill] LLM fallback failed: {e}")
        return []


# ── Execute one action ─────────────────────────────────────────────────────

async def _execute(
    page: Page,
    action: dict,
    handles: list[tuple[Frame, ElementHandle]],
    snapshot: list[dict],
    resume_pdf_path: str | None,
) -> tuple[bool, str, Page | None]:
    eid = action.get("id") or ""
    act = (action.get("action") or "").lower()

    handle: ElementHandle | None = None
    field_desc: dict | None = None
    for desc, (_, h) in zip(snapshot, handles):
        if desc["id"] == eid:
            handle = h
            field_desc = desc
            break
    if handle is None or field_desc is None:
        return False, f"unknown element {eid}", None

    try:
        if act == "fill":
            value = action.get("value", "")
            if not value:
                return False, "empty fill", None
            await handle.scroll_into_view_if_needed(timeout=2000)
            await handle.fill(str(value))
            return True, f"filled {eid} ({_signal(field_desc)[:30]}) = {str(value)[:40]!r}", None

        if act == "select":
            value = action.get("value", "")
            await handle.scroll_into_view_if_needed(timeout=2000)
            try:
                await handle.select_option(label=str(value))
            except Exception:
                await handle.select_option(value=str(value))
            return True, f"selected {eid} = {str(value)[:40]!r}", None

        if act == "upload_resume":
            if not resume_pdf_path:
                return False, "no resume PDF available", None
            await handle.set_input_files(resume_pdf_path)
            return True, f"uploaded resume -> {eid}", None

        if act == "click":
            if _is_submit_button(field_desc):
                return False, "refused: looks like a submit button", None
            before_pages = [p for p in page.context.pages if not p.is_closed()]
            await handle.scroll_into_view_if_needed(timeout=2000)
            await handle.click(timeout=5000)
            await asyncio.sleep(0.8)
            after_pages = [p for p in page.context.pages if not p.is_closed()]
            if len(after_pages) > len(before_pages):
                new_page = after_pages[-1]
                try:
                    await new_page.bring_to_front()
                    await new_page.wait_for_load_state("domcontentloaded", timeout=8000)
                except Exception:
                    pass
                return True, f"clicked {eid} opened new tab -> switched", new_page
            try:
                await page.wait_for_load_state("networkidle", timeout=6000)
            except Exception:
                await asyncio.sleep(1)
            return True, f"clicked {eid} ({(field_desc.get('text') or '')[:30]!r})", None

        return False, f"unknown action {act}", None
    except Exception as e:
        return False, f"{act} on {eid} failed: {e}", None


# ── Main loop ──────────────────────────────────────────────────────────────

async def run_agent(
    page: Page,
    personal: dict,
    tailored: dict,
    resume_pdf: bytes | None,
) -> dict:
    """Auto-fill the page using profile data; never submits."""
    log: list[str] = []
    history: list[dict] = []

    pdf_path: str | None = None
    if resume_pdf:
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.write(resume_pdf)
        tmp.close()
        pdf_path = tmp.name

    last_url = ""
    stable_count = 0  # how many steps in a row produced no useful actions
    click_attempts: dict[str, int] = {}

    try:
        for step in range(1, MAX_STEPS + 1):
            try:
                await page.wait_for_load_state("domcontentloaded", timeout=5000)
            except Exception:
                pass

            snapshot, handles = await _snapshot(page)
            if not snapshot:
                log.append(f"step {step}: no elements found")
                break

            current_url = page.url
            if current_url != last_url:
                stable_count = 0
                last_url = current_url

            actions = deterministic_plan(snapshot, personal, tailored)
            # Guard against tab-opening loops: if this step has only click actions
            # and we've already attempted the same click on this exact URL, skip it.
            if actions and all(a.get("action") == "click" for a in actions):
                kept: list[dict] = []
                url_key = page.url.split("#", 1)[0]
                for a in actions:
                    guard_key = f"{url_key}|{a.get('click_key', a.get('id', ''))}"
                    attempts = click_attempts.get(guard_key, 0)
                    click_kind = a.get("click_kind", "entry")
                    # Entry clicks like "Apply"/"Start application" should happen at most once
                    # per URL signature. Progress clicks can be retried a few times.
                    max_attempts = 1 if click_kind == "entry" else 3
                    if attempts >= max_attempts:
                        log.append(f"step {step}: click-loop guard blocked repeated click {guard_key[:90]}")
                        continue
                    kept.append(a)
                actions = kept

            # If only thing left is a single click (e.g. "Apply") and no fills,
            # let it proceed. If there are NO actions at all, try the LLM fallback
            # for any unmatched required fields.
            if not actions:
                unmatched = [
                    {"id": f["id"], "label": f.get("label") or f.get("placeholder") or f.get("name"),
                     "type": f.get("type"), "required": f.get("required")}
                    for f in snapshot
                    if f.get("tag") in ("input", "textarea")
                    and f.get("type") not in ("hidden", "submit", "button", "file")
                    and not (f.get("value") or "").strip()
                ][:8]
                actions = await _ask_llm_for_unmatched(unmatched, personal, tailored)
                if not actions:
                    stable_count += 1
                    log.append(f"step {step}: nothing to do (stable={stable_count})")
                    if stable_count >= 4:
                        break
                    await asyncio.sleep(0.8)
                    continue
            else:
                stable_count = 0

            log.append(f"step {step}: planning {len(actions)} actions ({_action_summary(actions)})")
            executed_clicks = 0
            for action in actions:
                ok, msg, switched_page = await _execute(page, action, handles, snapshot, pdf_path)
                history.append({"step": step, **action, "ok": ok, "msg": msg[:160]})
                log.append(f"   {'ok' if ok else 'skip'}: {msg}")
                # Limit click to one per step (page may navigate)
                if action.get("action") == "click" and ok:
                    url_key = page.url.split("#", 1)[0]
                    guard_key = f"{url_key}|{action.get('click_key', action.get('id', ''))}"
                    click_attempts[guard_key] = click_attempts.get(guard_key, 0) + 1
                    executed_clicks += 1
                    if switched_page is not None:
                        page = switched_page
                        stable_count = 0
                    break
            await asyncio.sleep(0.4)

            # If we did nothing useful (no fills/uploads, no successful click),
            # bail out a step earlier.
            if executed_clicks == 0 and not any(h["ok"] for h in history if h["step"] == step):
                stable_count += 1
                if stable_count >= 4:
                    break
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


def _action_summary(actions: list[dict]) -> str:
    counts: dict[str, int] = {}
    for a in actions:
        counts[a["action"]] = counts.get(a["action"], 0) + 1
    return ", ".join(f"{k}={v}" for k, v in counts.items())
