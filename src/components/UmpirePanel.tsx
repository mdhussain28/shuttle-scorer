"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { getSupabase } from "@/lib/supabase";
import type { TournamentMember } from "@/lib/types";

const CHARS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makePassword(length = 10): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join("");
}

interface Shown {
  email: string;
  password: string | null; // null when an existing umpire was only added to this tournament
  reset?: boolean;
}

async function call(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
  const { data } = await getSupabase().auth.getSession();
  const res = await fetch("/api/umpires", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; created?: boolean };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** Organiser-only: create umpire logins for this tournament, reset passwords, remove access. */
export function UmpirePanel({ tournamentId }: { tournamentId: string }) {
  const [members, setMembers] = useState<TournamentMember[] | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => makePassword());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await getSupabase()
      .from("tournament_members")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("created_at");
    if (error) {
      setErr(
        error.message.includes("tournament_members")
          ? `${error.message}. Run the latest supabase/schema.sql in the Supabase SQL Editor.`
          : error.message,
      );
      setMembers([]);
      return;
    }
    setMembers((data ?? []) as TournamentMember[]);
  }, [tournamentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(ev: FormEvent) {
    ev.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await call("POST", { tournamentId, email: email.trim(), password });
      setShown({ email: email.trim().toLowerCase(), password: res.created ? password : null });
      setCopied(false);
      setEmail("");
      setPassword(makePassword());
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reset(m: TournamentMember) {
    if (!confirm(`Set a new password for ${m.email}? Their current password stops working.`)) return;
    setErr(null);
    const next = makePassword();
    try {
      await call("PATCH", { tournamentId, userId: m.user_id, password: next });
      setShown({ email: m.email, password: next, reset: true });
      setCopied(false);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function remove(m: TournamentMember) {
    if (!confirm(`Remove ${m.email} from this tournament? They will no longer see it. Matches they scored are kept.`)) return;
    setErr(null);
    try {
      await call("DELETE", { tournamentId, userId: m.user_id });
      if (shown?.email === m.email) setShown(null);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function copy() {
    if (!shown) return;
    const text = [
      "Shuttle Scorer umpire login",
      `Website: ${window.location.origin}/login`,
      `Email: ${shown.email}`,
      shown.password ? `Password: ${shown.password}` : "Password: your existing umpire password",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setErr("Could not copy. Select the details and copy them manually.");
    }
  }

  return (
    <section className="card space-y-4">
      <div className="flex items-center gap-2">
        <Icon name="user" className="text-neutral-500" />
        <h3 className="font-semibold">Umpires</h3>
      </div>
      <p className="text-sm text-neutral-500">
        Create a login for each umpire. They can start and score matches in this tournament, but cannot change teams,
        categories or rules, and cannot delete anything.
      </p>

      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}

      {shown && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="font-medium text-emerald-900 dark:text-emerald-200">
            {shown.reset ? "New password set." : shown.password ? "Umpire account created." : "Umpire added to this tournament."}{" "}
            Share these details with them.
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-neutral-500">Email</dt>
            <dd className="break-all font-mono">{shown.email}</dd>
            <dt className="text-neutral-500">Password</dt>
            <dd className="break-all font-mono">{shown.password ?? "their existing umpire password"}</dd>
          </dl>
          <p className="text-xs text-neutral-500">The password is shown only now. Reset it later if it is lost.</p>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => void copy()}>
              <Icon name={copied ? "check" : "plus"} size={14} />
              {copied ? "Copied" : "Copy login details"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShown(null)}>
              Hide
            </button>
          </div>
        </div>
      )}

      {members === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-neutral-500">No umpires yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{m.email}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => void reset(m)}>
                Reset password
              </button>
              <button className="btn btn-ghost btn-sm !px-2" onClick={() => void remove(m)} aria-label={`Remove ${m.email}`}>
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="space-y-3 rounded-lg bg-neutral-50 p-4 dark:bg-neutral-950/40">
        <p className="text-sm font-medium">Add an umpire</p>
        <input
          className="input"
          type="email"
          required
          placeholder="Umpire email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            className="input font-mono"
            type="text"
            minLength={8}
            placeholder="Password (at least 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Password"
          />
          <button type="button" className="btn btn-secondary shrink-0" onClick={() => setPassword(makePassword())}>
            Generate
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          If this email is already an umpire on another of your tournaments, they are just added here and keep their password.
        </p>
        <button className="btn btn-primary w-full" disabled={busy}>
          <Icon name="plus" size={16} />
          {busy ? "Creating…" : "Create umpire login"}
        </button>
      </form>
    </section>
  );
}
