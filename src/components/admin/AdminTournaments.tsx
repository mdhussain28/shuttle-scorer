"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import type { AdminUser, MatchLite, TournamentLite } from "@/lib/adminTypes";
import { daysLeft, fmtDate } from "@/lib/format";
import { getSupabase } from "@/lib/supabase";

export function AdminTournaments({
  tournaments,
  categoryCounts,
  matches,
  users,
  onChanged,
}: {
  tournaments: TournamentLite[];
  categoryCounts: Record<string, number>;
  matches: MatchLite[];
  users: AdminUser[];
  onChanged: () => Promise<void> | void;
}) {
  const [err, setErr] = useState<string | null>(null);

  async function remove(t: TournamentLite) {
    if (!confirm(`Delete "${t.name}" with all its categories, teams and matches? This cannot be undone.`)) return;
    setErr(null);
    const { error } = await getSupabase().from("tournaments").delete().eq("id", t.id);
    if (error) return setErr(error.message);
    await onChanged();
  }

  if (tournaments.length === 0) {
    return <div className="card text-center text-sm text-neutral-500">No tournaments yet.</div>;
  }

  return (
    <div className="space-y-3">
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}
      <ul className="space-y-2">
        {tournaments.map((t) => {
          const mine = matches.filter((m) => m.tournament_id === t.id);
          const live = mine.filter((m) => m.status === "live").length;
          const assigned = users.filter((u) => u.tournamentIds.includes(t.id));
          return (
            <li key={t.id} className="card !p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{t.name}</p>
                  <p className="truncate text-xs text-neutral-500">
                    {[t.venue, fmtDate(t.start_date)].filter(Boolean).join(" · ") || "No venue or date"}
                  </p>
                </div>
                {live > 0 && <span className="badge badge-amber">{live} live</span>}
                <span className="badge badge-neutral">
                  <Icon name="clock" size={12} />
                  {daysLeft(t.expires_at)} days left
                </span>
                <Link href={`/tournaments/${t.id}`} className="btn btn-primary btn-sm">
                  Open
                </Link>
                <button className="btn btn-ghost btn-sm !px-2 text-red-700 dark:text-red-400" onClick={() => void remove(t)} aria-label={`Delete ${t.name}`}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-neutral-100 pt-3 text-xs text-neutral-500 dark:border-neutral-800">
                <span>{categoryCounts[t.id] ?? 0} categories</span>
                <span>{mine.length} matches</span>
                <span className="flex items-center gap-1">
                  <Icon name="users" size={13} />
                  {assigned.length === 0 ? "No users assigned" : assigned.map((u) => u.email).join(", ")}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
