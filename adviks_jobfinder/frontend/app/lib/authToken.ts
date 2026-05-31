import type { SupabaseClient } from "@supabase/supabase-js";

/** Return a valid access token, refreshing the session when needed. */
export async function getAccessToken(supabase: SupabaseClient): Promise<string> {
  const { data: { session: initial } } = await supabase.auth.getSession();
  let session = initial;

  const needsRefresh =
    !session?.access_token ||
    (session.expires_at != null && session.expires_at * 1000 < Date.now() + 60_000);

  if (needsRefresh) {
    const { data: { session: refreshed }, error } = await supabase.auth.refreshSession();
    if (!error && refreshed?.access_token) {
      session = refreshed;
    }
  }

  return session?.access_token ?? "";
}

/** On 401 from our API, sign out and send the user back to login. */
export async function handleAuthFailure(
  supabase: SupabaseClient,
  router: { replace: (path: string) => void }
): Promise<void> {
  await supabase.auth.signOut();
  router.replace("/login");
}
