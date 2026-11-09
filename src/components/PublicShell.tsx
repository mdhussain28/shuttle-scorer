"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";
import { Icon } from "@/components/Icon";

/** Frame for the public live pages. No sign-in needed, nothing here can change data. */
export function PublicShell({
  title,
  back,
  children,
}: {
  title?: string;
  back?: { href: string; label: string };
  children: ReactNode;
}) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    try {
      getSupabase()
        .auth.getSession()
        .then(({ data }: { data: { session: unknown } }) => setSignedIn(Boolean(data.session)));
    } catch {
      /* not configured: show the login button */
    }
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/75 shadow-sm shadow-neutral-900/5 backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/75">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          {back ? (
            <Link
              href={back.href}
              aria-label={back.label}
              className="-ml-2 flex h-9 w-9 items-center justify-center rounded-xl text-neutral-600 transition hover:bg-neutral-100 active:scale-95 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <Icon name="arrow-left" />
            </Link>
          ) : (
            <img src="/icon-192.png" alt="" width={32} height={32} className="h-8 w-8 rounded-[10px] shadow-sm" />
          )}
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">{title ?? "Shuttle Scorer"}</h1>
          <span className="badge badge-red hidden sm:inline-flex">
            <span className="live-dot" />
            Live
          </span>
          <Link href={signedIn ? "/dashboard" : "/login"} className="btn btn-primary btn-sm sm:px-4 sm:py-2 sm:text-sm">
            <Icon name={signedIn ? "grid" : "lock"} size={14} />
            {signedIn ? "Dashboard" : "Login"}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl animate-rise px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-center text-xs text-neutral-400">
        Scores update automatically. Shuttle Scorer
      </footer>
    </>
  );
}

/** Hero banner used at the top of public pages. */
export function Hero({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <section className="hero-surface relative overflow-hidden rounded-3xl p-6 text-white shadow-lift sm:p-10">
      <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 animate-float rounded-full bg-sky-400/25 blur-3xl" />
      <div
        className="pointer-events-none absolute -bottom-20 -left-10 h-60 w-60 animate-float rounded-full bg-indigo-400/25 blur-3xl"
        style={{ animationDelay: "-4s" }}
      />
      <div className="relative">
        <h2 className="text-2xl font-semibold sm:text-4xl">{title}</h2>
        {subtitle && <p className="mt-1.5 max-w-xl text-sm text-blue-100/90">{subtitle}</p>}
        {children && <div className="mt-5">{children}</div>}
      </div>
    </section>
  );
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-24" />
      ))}
    </div>
  );
}
