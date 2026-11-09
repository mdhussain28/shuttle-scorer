"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { Credentials, type Shown } from "@/components/admin/Credentials";
import { ExpiryPicker, NEVER, resolveExpiry, type ExpiryChoice } from "@/components/admin/ExpiryPicker";
import { getSupabase } from "@/lib/supabase";
import { timeLeft } from "@/lib/format";
import { makePassword } from "@/lib/password";
import { useRole } from "@/lib/useRole";
import { createUmpire, deleteUmpire, resetUmpirePassword } from "@/lib/umpireApi";
import type { TournamentMember } from "@/lib/types";

interface Candidate {
  user_id: string;
  email: string;
  expires_at: string | null;
}

/**
 * Umpires of one tournament. Shown to admins and to users an admin allowed to add umpires.
 * Admins see and manage every umpire; other users manage the umpires they added themselves.
 */
export function AccessPanel({ tournamentId }: { tournamentId: string }) {
  const role = useRole();
  const [members, setMembers] = useState<TournamentMember[] | null>(null);
  // Accounts the signed-in person may manage (admins: all users; others: the ones they created).
  const [users, setUsers] = useState<Candidate[]>([]);
  const [pick, setPick] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);

  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => makePassword());
  const [expiry, setExpiry] = useState<ExpiryChoice>(NEVER);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const sb = getSupabase();
    const [m, u] = await Promise.all([
      sb.from("tournament_members").select("*").eq("tournament_id", tournamentId).order("created_at"),
      sb.from("app_users").select("user_id,email,expires_at").eq("role", "user").order("email"),
    ]);
    const failure = m.error ?? u.error;
    if (failure) {
      setErr(
        /tournament_members|app_users|can_add|policy/i.test(failure.message)
          ? `${failure.message}. Run the latest supabase/schema.sql in the Supabase SQL Editor.`
          : failure.message,
      );
    }
    setMembers((m.data ?? []) as TournamentMember[]);
    setUsers((u.data ?? []) as Candidate[]);
  }, [tournamentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const assignedIds = new Set((members ?? []).map((m) => m.user_id));
  const available = users.filter((u) => !assignedIds.has(u.user_id));
  const manageable = new Set(users.map((u) => u.user_id));
  const expiryOf = new Map(users.map((u) => [u.user_id, u.expires_at]));

  async function create(ev: FormEvent) {
    ev.preventDefault();
    setErr(null);
    const when = resolveExpiry(expiry);
    if (when === "invalid") return setErr("Choose a deletion date and time in the future.");
    setBusy(true);
    try {
      await createUmpire({ tournamentId, email: email.trim(), password, expiresAt: when });
      setShown({
        title: "Umpire account created.",
        email: email.trim().toLowerCase(),
        password,
        note:
          (when ? `This account will be deleted ${timeLeft(when)}. ` : "") +
          "Give these details to the umpire. The password is shown only now.",
      });
      setEmail("");
      setPassword(makePassword());
      setExpiry(NEVER);
      setAdding(false);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function assign() {
    const user = users.find((u) => u.user_id === pick);
    if (!user) return;
    setErr(null);
    const { error } = await getSupabase()
      .from("tournament_members")
      .insert({ tournament_id: tournamentId, user_id: user.user_id, email: user.email });
    if (error) return setErr(error.message);
    setPick("");
    await load();
  }

  async function unassign(m: TournamentMember) {
    if (!confirm(`Remove ${m.email} from this tournament? They will no longer see it. Matches they scored are kept.`)) return;
    setErr(null);
    const { error } = await getSupabase()
      .from("tournament_members")
      .delete()
      .eq("tournament_id", tournamentId)
      .eq("user_id", m.user_id);
    if (error) return setErr(error.message);
    await load();
  }

  async function reset(m: TournamentMember) {
    if (!confirm(`Set a new password for ${m.email}? Their current password stops working.`)) return;
    setErr(null);
    const next = makePassword();
    try {
      await resetUmpirePassword(m.user_id, next);
      setShown({ title: "New password set.", email: m.email, password: next });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function remove(m: TournamentMember) {
    if (!confirm(`Delete the account ${m.email}? They can no longer sign in, in any tournament. Matches they scored are kept.`)) return;
    setErr(null);
    try {
      await deleteUmpire(m.user_id);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <section className="card space-y-4">
      <div className="flex items-center gap-2">
        <Icon name="users" className="text-neutral-500" />
        <h3 className="font-semibold">Umpires</h3>
        <span className="flex-1" />
        {role.isAdmin && (
          <Link href="/admin" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-400">
            Manage all users
          </Link>
        )}
        <button className="btn btn-primary btn-sm" onClick={() => setAdding((a) => !a)}>
          <Icon name={adding ? "x" : "user-plus"} size={14} />
          {adding ? "Close" : "Add umpire"}
        </button>
      </div>
      <p className="text-sm text-neutral-500">
        Umpires sign in with the email and password you create and can start and score matches in this tournament. They cannot change
        teams, categories or rules, and cannot delete anything. Admins can see and delete every umpire account.
      </p>

      {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}
      {shown && <Credentials shown={shown} onHide={() => setShown(null)} />}

      {adding && (
        <form onSubmit={create} className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-950/30">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ump-email">Umpire email</label>
              <input id="ump-email" className="input" type="email" required placeholder="umpire@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="ump-pass">Password</label>
              <div className="flex gap-2">
                <input id="ump-pass" className="input font-mono" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="btn btn-secondary shrink-0" onClick={() => setPassword(makePassword())}>
                  <Icon name="refresh" size={14} />
                  New
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="ump-expiry">Delete this account automatically</label>
            <ExpiryPicker id="ump-expiry" value={expiry} onChange={setExpiry} />
          </div>
          <button className="btn btn-primary w-full" disabled={busy}>
            <Icon name="user-plus" size={16} />
            {busy ? "Creating…" : "Create umpire"}
          </button>
        </form>
      )}

      {members === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-neutral-500">No umpires yet. Use “Add umpire” to create one.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {members.map((m) => {
            const exp = expiryOf.get(m.user_id);
            const mine = manageable.has(m.user_id);
            return (
              <li key={m.user_id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{m.email}</span>
                {exp && (
                  <span className="badge badge-amber">
                    <Icon name="clock" size={12} />
                    Deleted {timeLeft(exp)}
                  </span>
                )}
                {mine && (
                  <button className="btn btn-ghost btn-sm !px-2" onClick={() => void reset(m)} aria-label={`New password for ${m.email}`} title="New password">
                    <Icon name="key" size={14} />
                  </button>
                )}
                <button className="btn btn-ghost btn-sm !px-2" onClick={() => void unassign(m)} aria-label={`Remove ${m.email} from this tournament`} title="Remove from this tournament">
                  <Icon name="x" size={14} />
                </button>
                {mine && (
                  <button className="btn btn-ghost btn-sm !px-2 text-red-700 dark:text-red-400" onClick={() => void remove(m)} aria-label={`Delete account ${m.email}`} title="Delete account">
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {available.length > 0 && (
        <div className="flex gap-2">
          <select className="input" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Existing umpire to assign">
            <option value="">Assign an existing umpire…</option>
            {available.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.email}
              </option>
            ))}
          </select>
          <button className="btn btn-primary shrink-0" disabled={!pick} onClick={() => void assign()}>
            <Icon name="plus" size={16} />
            Assign
          </button>
        </div>
      )}
    </section>
  );
}
