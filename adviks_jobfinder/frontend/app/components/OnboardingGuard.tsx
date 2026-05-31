"use client";

import { createClient } from "../lib/supabase";
import { useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { API_URL } from "../lib/api";
import { fetchOnboardingStatus, type OnboardingStatus } from "../lib/onboarding";
import { getAccessToken } from "../lib/authToken";

interface OnboardingGuardProps {
  children: ReactNode;
}

const PUBLIC = ["/login"];
const ONBOARDING = ["/onboarding/profile"];

export default function OnboardingGuard({ children }: OnboardingGuardProps) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    let active = true;

    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        if (!PUBLIC.includes(pathname)) router.replace("/login");
        if (active) {
          setUser(null);
          setStatus(null);
          setLoading(false);
        }
        return;
      }

      setUser(session.user);
      const token = await getAccessToken(supabase);
      if (!token) {
        router.replace("/login");
        setLoading(false);
        return;
      }
      const onboarding = await fetchOnboardingStatus(token, API_URL);

      if (!active) return;
      setStatus(onboarding);

      if (pathname === "/login" || pathname === "/") {
        if (onboarding?.ready) router.replace("/dashboard");
        else if (onboarding?.profile_complete) router.replace("/templates");
        else router.replace("/onboarding/profile");
        setLoading(false);
        return;
      }

      if (onboarding && !PUBLIC.includes(pathname) && !ONBOARDING.includes(pathname)) {
        if (!onboarding.profile_complete) {
          router.replace("/onboarding/profile");
          setLoading(false);
          return;
        }
        if (!onboarding.has_template) {
          router.replace("/templates");
          setLoading(false);
          return;
        }
      }

      if (ONBOARDING.includes(pathname) && onboarding?.ready) {
        router.replace("/dashboard");
      }

      setLoading(false);
    };

    run();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      run();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [pathname, router, supabase.auth]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-accent-cyan/30 border-t-accent-cyan animate-spin" />
          <p className="font-[family-name:var(--font-jetbrains-mono)] text-sm text-muted">
            Loading Flamingo.ai...
          </p>
        </div>
      </div>
    );
  }

  if (!user && !PUBLIC.includes(pathname)) return null;

  return <>{children}</>;
}
