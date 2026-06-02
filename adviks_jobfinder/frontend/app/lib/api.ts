export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface DiscoverJob {
  id?: string;
  title: string;
  company: string;
  location: string;
  match_score: number;
  ai_score?: number;
  ai_reason?: string;
  apply_method?: string;
  auto_apply_eligible?: boolean;
  matched_skills: string[];
  missing_skills: string[];
  url: string;
  apply_url?: string;
  description_snippet: string;
  description?: string;
  source?: string;
  is_remote?: boolean;
}

export interface ApplicationRecord {
  id: number;
  job_title?: string;
  company?: string;
  apply_url?: string;
  apply_method?: string;
  status?: string;
  ai_match_score?: number;
  ai_reason?: string;
  fail_reason?: string;
  created_at?: string;
}

async function authFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function discoverJobs(
  token: string,
  params: { q: string; location?: string; remote?: boolean; country?: string }
) {
  const sp = new URLSearchParams({
    q: params.q,
    location: params.location || "USA",
    remote: String(params.remote ?? false),
    country: params.country || "us",
  });
  return authFetch(`/jobs/discover?${sp}`, token) as Promise<{
    jobs: DiscoverJob[];
    total: number;
    apply_capabilities?: { greenhouse: boolean; email: boolean; email_via?: string | null };
  }>;
}

export async function autoApply(
  token: string,
  body: { query: string; location?: string; remote?: boolean; target_count?: number; min_score?: number }
) {
  return authFetch("/apply/auto", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function applySingle(token: string, job: DiscoverJob) {
  return authFetch("/apply/single", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job }),
  });
}

export async function listApplications(token: string) {
  return authFetch("/applications", token) as Promise<{ applications: ApplicationRecord[] }>;
}
