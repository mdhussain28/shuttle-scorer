"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";
import { Icon } from "@/components/Icon";

/** Page frame: sign-in check, header with back link and sign-out. */
export function Shell({
  title,
  back,
  actions,
  children,
}: {
  title: string;
  back?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let supabase: ReturnType<typeof getSupabase>;
    try {
      supabase = getSupabase();
    } catch (e) {
      setConfigError((e as Error).message);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  async function signOut() {
    await getSupabase().auth.signOut();
    router.replace("/login");
  }

  if (configError) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="font-semibold">Setup needed</p>
        <p className="mt-2 text-sm text-neutral-500">{configError}</p>
      </div>
    );
  }

  if (!ready) {
    return <div className="p-10 text-center text-sm text-neutral-500">Loading…</div>;
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          {back ? (
            <Link
              href={back}
              aria-label="Back"
              className="-ml-2 flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <Icon name="arrow-left" />
            </Link>
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700 text-white">
              <Icon name="shuttle" size={18} />
            </span>
          )}
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h1>
          {actions}
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Icon name="logout" size={16} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </>
  );
}
