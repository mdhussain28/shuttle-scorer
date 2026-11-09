"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import { Icon } from "@/components/Icon";

type Mode = "admin" | "user";

const COPY: Record<Mode, { title: string; text: string }> = {
  admin: {
    title: "Administrator",
    text: "Manage tournaments, users and access.",
  },
  user: {
    title: "User",
    text: "Score matches in the tournaments assigned to you.",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("expired")) {
      setErr("Your access has ended. Ask an admin for a new account.");
      return;
    }
    try {
      getSupabase()
        .auth.getSession()
        .then(({ data }) => {
          if (data.session) router.replace("/");
        });
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [router]);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const sb = getSupabase();
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.user) {
        setErr(error?.message ?? "Could not sign in.");
        setBusy(false);
        return;
      }

      // The chosen tab must match the account type.
      const isUser = data.user.app_metadata?.role === "umpire";
      if (mode === "admin" && isUser) {
        await sb.auth.signOut();
        setErr("This is a user account. Choose User to sign in.");
        setBusy(false);
        return;
      }
      if (mode === "user" && !isUser) {
        await sb.auth.signOut();
        setErr("This is an admin account. Choose Admin to sign in.");
        setBusy(false);
        return;
      }

      // An account past its deletion time cannot sign in.
      const own = await sb.from("app_users").select("expires_at").eq("user_id", data.user.id).maybeSingle();
      const expires = (own.data as { expires_at: string | null } | null)?.expires_at;
      if (expires && new Date(expires).getTime() <= Date.now()) {
        await sb.auth.signOut();
        setErr("This account has expired. Ask an admin for a new one.");
        setBusy(false);
        return;
      }

      router.replace("/");
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm animate-rise flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <img src="/icon-512.png" alt="" width={84} height={84} className="mx-auto mb-5 h-[84px] w-[84px] rounded-[22px] shadow-lift" />
        <h1 className="text-2xl font-semibold tracking-tight">Shuttle Scorer</h1>
        <p className="mt-1 text-sm text-neutral-500">Sign in to continue</p>
      </div>

      <div className="card space-y-5 !p-6">
        <div role="group" aria-label="Sign in as" className="grid grid-cols-2 gap-2">
          {(["admin", "user"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setErr(null);
              }}
              aria-pressed={mode === m}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
                mode === m
                  ? "border-brand-600 bg-brand-50 text-brand-900 dark:bg-brand-950/40 dark:text-brand-200"
                  : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              <Icon name={m === "admin" ? "shield" : "user"} size={20} />
              {COPY[m].title}
            </button>
          ))}
        </div>
        <p className="-mt-1 text-center text-xs text-neutral-500">{COPY[mode].text}</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" required autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {err && (
            <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <Icon name="alert" size={16} className="mt-0.5" />
              {err}
            </p>
          )}
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Signing in…" : `Sign in as ${COPY[mode].title.toLowerCase()}`}
          </button>
        </form>
      </div>
      {mode === "user" && (
        <p className="mt-4 text-center text-xs text-neutral-500">Use the email and password your admin gave you.</p>
      )}
      <a
        href="/watch"
        className="mt-6 flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white/70 px-4 py-3 text-sm font-semibold text-brand-800 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.98] dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-brand-300"
      >
        <span className="live-dot" />
        Watch live scores without signing in
      </a>
    </main>
  );
}
