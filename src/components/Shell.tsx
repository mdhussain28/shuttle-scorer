"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";

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
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          {back && (
            <Link
              href={back}
              aria-label="Back"
              className="-ml-2 rounded-lg px-2 py-1 text-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              ←
            </Link>
          )}
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h1>
          {actions}
          <button onClick={signOut} className="text-xs text-neutral-500 hover:underline">
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </>
  );
}
