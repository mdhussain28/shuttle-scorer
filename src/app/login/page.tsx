"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
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
      const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setErr(error.message);
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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-3xl">🏸</div>
        <h1 className="text-2xl font-bold">Shuttle Scorer</h1>
        <p className="mt-1 text-sm text-neutral-500">Organiser sign in</p>
      </div>
      <form onSubmit={submit} className="card space-y-3">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" required autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
