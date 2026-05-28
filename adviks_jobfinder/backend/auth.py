"""
Supabase auth middleware for FastAPI.

Validates the Bearer token by asking Supabase directly via
GET {SUPABASE_URL}/auth/v1/user. This is algorithm-agnostic and works for
both legacy HS256 projects and projects using modern asymmetric keys
(ES256/RS256), so we don't have to manage signing keys on the backend.

A small in-memory cache keyed by the raw token avoids one HTTP roundtrip
per request from the same session.
"""

import os
import time
import httpx
from pathlib import Path
from dotenv import load_dotenv
from fastapi import Request, HTTPException

_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH, override=False)


def _env(name: str) -> str:
    """Always re-read from os.environ in case the file changed between requests."""
    return os.getenv(name, "")


SUPABASE_URL = _env("SUPABASE_URL").rstrip("/")
SUPABASE_ANON_KEY = _env("SUPABASE_ANON_KEY")

_TOKEN_CACHE: dict[str, tuple[str, float]] = {}
_CACHE_TTL_SECONDS = 300  # 5 min — well under Supabase's 1h access-token lifetime


def _verify_with_supabase(token: str) -> str:
    """Call Supabase /auth/v1/user with the access token. Returns user_id."""
    # Re-read env each call so a hot-reload after fixing .env recovers cleanly.
    url = _env("SUPABASE_URL").rstrip("/") or SUPABASE_URL
    anon = _env("SUPABASE_ANON_KEY") or SUPABASE_ANON_KEY
    if not url or not anon:
        # Try one more time after explicit reload from disk (handles startup race).
        load_dotenv(_ENV_PATH, override=True)
        url = os.getenv("SUPABASE_URL", "").rstrip("/")
        anon = os.getenv("SUPABASE_ANON_KEY", "")

    if not url or not anon:
        raise HTTPException(
            status_code=500,
            detail=(
                "Supabase env not configured. Ensure "
                f"{_ENV_PATH} exists with SUPABASE_URL and SUPABASE_ANON_KEY, "
                "then restart uvicorn (Ctrl+C and run it again — --reload does not pick up .env)."
            ),
        )

    try:
        resp = httpx.get(
            f"{url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": anon,
            },
            timeout=5.0,
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Auth provider unreachable: {e}")

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    data = resp.json()
    user_id = data.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing user id")
    return user_id


def get_current_user(request: Request) -> str:
    """Extract user_id from the Authorization header. Raises 401 if invalid."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header[len("Bearer "):].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty bearer token")

    now = time.time()
    cached = _TOKEN_CACHE.get(token)
    if cached and cached[1] > now:
        return cached[0]

    user_id = _verify_with_supabase(token)
    _TOKEN_CACHE[token] = (user_id, now + _CACHE_TTL_SECONDS)
    return user_id
