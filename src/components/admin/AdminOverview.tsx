"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import type { AdminUser, MatchLite, TournamentLite } from "@/lib/adminTypes";
import { timeLeft } from "@/lib/format";

function Stat({ icon, label, value, hint }: { icon: IconName; label: string; value: number; hint?: string }) {
  return (
    <div className="card flex items-center gap-4 !p-4">
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold leading-none tabular-nums">{value}</p>
        <p className="mt-1 truncate text-xs text-neutral-500">{label}</p>
        {hint && <p className="truncate text-xs text-neutral-400">{hint}</p>}
      </div>
    </div>
  );
}

export function AdminOverview({
  tournaments,
  matches,
  users,
}: {
  tournaments: TournamentLite[];
  matches: MatchLite[];
  users: AdminUser[];
}) {
  const live = matches.filter((m) => m.status === "live");
  const names = new Map(tournaments.map((t) => [t.id, t.name]));
  const soon = users
    .filter((u) => u.expiresAt && new Date(u.expiresAt).getTime() > Date.now() && new Date(u.expiresAt).getTime() - Date.now() < 7 * 86_400_000)
    .sort((a, b) => (a.expiresAt ?? "").localeCompare(b.expiresAt ?? ""));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon="trophy" label="Tournaments" value={tournaments.length} />
        <Stat icon="activity" label="Matches live now" value={live.length} />
        <Stat icon="shuttle" label="Matches recorded" value={matches.length} />
        <Stat
          icon="users"
          label="Accounts"
          value={users.length}
          hint={`${users.filter((u) => u.role === "user").length} users, ${users.filter((u) => u.role === "admin").length} admins`}
        />
      </div>

      <section>
        <h2 className="section-title mb-3">Live matches</h2>
        {live.length === 0 ? (
          <div className="card text-center text-sm text-neutral-500">No match is being played right now.</div>
        ) : (
          <ul className="space-y-2">
            {live.map((m) => (
              <li key={m.id}>
                <Link href={`/match/${m.id}`} className="card flex items-center gap-3 !p-4 transition-colors hover:border-emerald-600">
                  <span className="badge badge-amber">Live</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {m.a_label} <span className="font-normal text-neutral-400">vs</span> {m.b_label}
                    </span>
                    <span className="block truncate text-xs text-neutral-500">
                      {m.tournament_id ? (names.get(m.tournament_id) ?? "Tournament") : "Casual match"}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {m.sets_a}–{m.sets_b}
                  </span>
                  <Icon name="chevron-right" className="text-neutral-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="section-title mb-3">Accounts due for deletion within 7 days</h2>
        {soon.length === 0 ? (
          <div className="card text-center text-sm text-neutral-500">No account is about to be deleted.</div>
        ) : (
          <ul className="card divide-y divide-neutral-100 !p-0 dark:divide-neutral-800">
            {soon.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{u.email}</span>
                <span className="badge badge-amber">
                  <Icon name="clock" size={12} />
                  Deleted {timeLeft(u.expiresAt as string)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
