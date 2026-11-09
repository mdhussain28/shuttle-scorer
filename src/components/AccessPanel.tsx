"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { getSupabase } from "@/lib/supabase";
import { timeLeft } from "@/lib/format";
import type { TournamentMember } from "@/lib/types";

interface Candidate {
  user_id: string;
  email: string;
  expires_at: string | null;
}

/** Admin-only: choose which users can score this tournament. Accounts are created on the Admin page. */
export function AccessPanel({ tournamentId }: { tournamentId: string }) {
  const [members, setMembers] = useState<TournamentMember[] | null>(null);
  const [users, setUsers] = useState<Candidate[]>([]);
  const [pick, setPick] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabase();
    const [m, u] = await Promise.all([
      sb.from("tournament_members").select("*").eq("tournament_id", tournamentId).order("created_at"),
      sb.from("app_users").select("user_id,email,expires_at").eq("role", "user").order("email"),
    ]);
    const failure = m.error ?? u.error;
    if (failure) {
      setErr(
        failure.message.includes("tournament_members") || failure.message.includes("app_users")
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
  const expiry = new Map(users.map((u) => [u.user_id, u.expires_at]));

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

  return (
    <section className="card space-y-4">
      <div className="flex items-center gap-2">
        <Icon name="users" className="text-neutral-500" />
        <h3 className="font-semibold">Users with access</h3>
        <span className="flex-1" />
        <Link href="/admin" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          Manage users
        </Link>
      </div>
      <p className="text-sm text-neutral-500">
        Assigned users can start and score matches here. They cannot change teams, categories or rules, and cannot delete anything.
      </p>

      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}

      {members === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-neutral-500">No users assigned yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {members.map((m) => {
            const exp = expiry.get(m.user_id);
            return (
              <li key={m.user_id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{m.email}</span>
                {exp && (
                  <span className="badge badge-amber">
                    <Icon name="clock" size={12} />
                    Deleted {timeLeft(exp)}
                  </span>
                )}
                <button className="btn btn-ghost btn-sm !px-2" onClick={() => void unassign(m)} aria-label={`Remove ${m.email}`}>
                  <Icon name="x" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex gap-2">
        <select className="input" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="User to assign">
          <option value="">{available.length === 0 ? "No other users available" : "Assign a user…"}</option>
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
    </section>
  );
}
