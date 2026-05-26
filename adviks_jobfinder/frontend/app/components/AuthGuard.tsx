"use client";

import { createClient } from "../lib/supabase";
import { useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";

interface AuthGuardProps {
  children: ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
      } else if (pathname !== "/login") {
        router.push("/login");
      }
      setLoading(false);
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
      } else if (pathname !== "/login") {
        router.push("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, router, supabase.auth]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-accent-cyan/30 border-t-accent-cyan animate-spin" />
          <p className="font-[family-name:var(--font-jetbrains-mono)] text-sm text-muted">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  if (!user && pathname !== "/login") {
    return null;
  }

  return <>{children}</>;
}
