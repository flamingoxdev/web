"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "../components/Header";
import SearchBar from "../components/SearchBar";
import JobCard from "../components/JobCard";
import { createClient } from "../lib/supabase";
import { getAccessToken } from "../lib/authToken";
import { discoverJobs, autoApply, listApplications, type DiscoverJob, type ApplicationRecord } from "../lib/api";
import { API_URL } from "../lib/api";

export default function JobsPage() {
  const supabase = createClient();
  const [jobs, setJobs] = useState<DiscoverJob[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [lastQuery, setLastQuery] = useState("");
  const [lastRemote, setLastRemote] = useState(true);
  const [applyResult, setApplyResult] = useState<{ summary?: Record<string, number> } | null>(null);
  const [applyCapabilities, setApplyCapabilities] = useState<{ greenhouse: boolean; email: boolean }>({
    greenhouse: true,
    email: false,
  });

  const loadApplications = useCallback(async () => {
    try {
      const token = await getAccessToken(supabase);
      const data = await listApplications(token);
      setApplications(data.applications || []);
    } catch {
      /* ignore */
    }
  }, [supabase]);

  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessToken(supabase);
        const res = await fetch(`${API_URL}/onboarding/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setProfileReady(Boolean(data.profile_complete));
        }
      } catch {
        /* ignore */
      }
      loadApplications();
    })();
  }, [supabase, loadApplications]);

  const handleSearch = async (query: string, location: string, remote: boolean) => {
    setLoading(true);
    setError(null);
    setApplyResult(null);
    setLastQuery(query);
    setLastRemote(remote);
    try {
      const token = await getAccessToken(supabase);
      const data = await discoverJobs(token, { q: query, location, remote });
      setJobs(data.jobs || []);
      if (data.apply_capabilities) {
        setApplyCapabilities(data.apply_capabilities);
      }
      if (!data.jobs?.length) {
        setError("No jobs found. Try different keywords or disable remote-only.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const autoEligibleJobs = jobs.filter((j) => j.auto_apply_eligible);
  const autoEligible = autoEligibleJobs.length;

  const eligibleLabel = applyCapabilities.email
    ? "Greenhouse / email"
    : "Greenhouse";

  const handleAutoApply = async () => {
    if (!lastQuery || autoEligible === 0) return;
    setApplying(true);
    setError(null);
    try {
      const token = await getAccessToken(supabase);
      const result = await autoApply(token, {
        query: lastQuery,
        location: lastRemote ? "Remote" : "USA",
        remote: lastRemote,
        target_count: autoEligible,
        min_score: 6,
      });
      setApplyResult(result);
      await loadApplications();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auto apply failed");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8">
          <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold text-foreground">
            Job Discovery & Auto Apply
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Search Adzuna + RemoteOK, AI-rank matches, then auto-apply to Greenhouse jobs
            {applyCapabilities.email ? " and email listings" : ""}.
            Most employers use Workday, LinkedIn, or company portals — those go to your manual queue.
          </p>
          {!applyCapabilities.email && (
            <p className="mt-2 max-w-2xl text-xs text-accent-amber">
              Email auto-apply is off. To use a normal Gmail address, add SMTP_USER, SMTP_PASSWORD, and EMAIL_FROM to your .env (Gmail app password).
            </p>
          )}
        </div>

        <SearchBar onSearch={handleSearch} isSearching={loading} disabled={!profileReady} />

        {!profileReady && (
          <p className="mt-3 text-xs text-accent-amber">
            Complete your profile under Build your resume before searching or applying. Upload a PDF resume in step 1 for auto-apply.
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {jobs.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {jobs.length} jobs · {autoEligible} auto-apply eligible ({eligibleLabel})
            </p>
            {autoEligible > 0 ? (
              <button
                onClick={handleAutoApply}
                disabled={applying || !profileReady}
                className="rounded-lg bg-gradient-to-r from-accent-emerald to-accent-cyan px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {applying ? `Applying to ${autoEligible}…` : `Auto Apply to ${autoEligible}`}
              </button>
            ) : (
              <span className="text-xs text-muted">No auto-apply jobs in this search</span>
            )}
          </div>
        )}

        {applyResult?.summary && (
          <div className="mt-4 rounded-lg border border-accent-emerald/30 bg-accent-emerald/10 px-4 py-3 text-sm">
            Applied: <strong>{applyResult.summary.applied}</strong> · Failed:{" "}
            <strong>{applyResult.summary.failed}</strong> · Manual queue:{" "}
            <strong>{applyResult.summary.skipped}</strong>
          </div>
        )}

        <div className="mt-6 space-y-4">
          {jobs.map((job, i) => (
            <JobCard
              key={job.id || `${job.company}-${job.title}-${i}`}
              job={job}
              index={i}
              profileReady={profileReady}
              emailApplyEnabled={applyCapabilities.email}
            />
          ))}
        </div>

        {applications.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 font-[family-name:var(--font-syne)] text-lg font-bold">Application History</h2>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-raised text-xs uppercase text-muted">
                  <tr>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.slice(0, 30).map((app) => (
                    <tr key={app.id} className="border-t border-border">
                      <td className="px-4 py-3">{app.job_title || "—"}</td>
                      <td className="px-4 py-3">{app.company || "—"}</td>
                      <td className="px-4 py-3 capitalize">{app.apply_method || "—"}</td>
                      <td className="px-4 py-3">{app.ai_match_score ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            app.status === "applied"
                              ? "bg-accent-emerald/15 text-accent-emerald"
                              : app.status === "failed"
                                ? "bg-red-100 text-red-700"
                                : "bg-accent-amber/15 text-accent-amber"
                          }`}
                        >
                          {app.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
