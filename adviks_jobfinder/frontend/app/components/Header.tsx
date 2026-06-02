"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../lib/supabase";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const navLink = (href: string, label: string, matchPath?: string) => {
    const active = matchPath ? pathname === matchPath : pathname === href.split("?")[0];
    return (
      <Link
        href={href}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors
          ${active
            ? "bg-accent-cyan/10 text-accent-cyan"
            : "text-muted hover:text-foreground hover:bg-surface-raised"
          }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="relative w-full border-b border-border px-6 py-5">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-accent-cyan to-accent-violet">
              <span className="text-lg">🦩</span>
            </div>
            <span className="font-[family-name:var(--font-syne)] text-xl font-bold tracking-tight">
              Flamingo
              <span className="bg-gradient-to-r from-accent-cyan to-accent-violet bg-clip-text text-transparent">
                .ai
              </span>
            </span>
          </Link>

          {user && (
            <nav className="flex items-center gap-1">
              {navLink("/jobs", "Jobs")}
              {navLink("/dashboard", "Build your resume", "/dashboard")}
              {navLink("/explore-templates", "Explore Templates", "/explore-templates")}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-full border border-accent-emerald/20 bg-accent-emerald/10 px-3 py-1 font-[family-name:var(--font-jetbrains-mono)] text-xs text-accent-emerald sm:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-emerald" />
            system online
          </span>

          {user && (
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-muted sm:block">
                {user.email}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground hover:border-muted"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
