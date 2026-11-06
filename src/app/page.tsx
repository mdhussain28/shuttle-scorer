"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icon";
import { getSupabase } from "@/lib/supabase";
import type { MatchRow, Tournament } from "@/lib/types";
import { daysLeft, fmtDate, scoreLine } from "@/lib/format";

type CasualItem = Pick<
  MatchRow,
  "id" | "a_label" | "b_label" | "status" | "set_scores" | "sets_a" | "sets_b" | "created_at" | "expires_at"
>;

function HomeContent() {
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [casual, setCasual] = useState<CasualItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    (async () => {
      const [t, c] = await Promise.all([
        sb.from("tournaments").select("*").order("created_at", { ascending: false }),
        sb
          .from("matches")
          .select("id,a_label,b_label,status,set_scores,sets_a,sets_b,created_at,expires_at")
          .is("tournament_id", null)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      const failure = t.error ?? c.error;
      if (failure) setErr(failure.message);
      setTournaments((t.data ?? []) as Tournament[]);
      setCasual((c.data ?? []) as CasualItem[]);
    })();
  }, []);

  const actions = [
    {
      href: "/tournaments/new",
      icon: "trophy" as const,
      title: "New tournament",
      text: "Categories, pools, rankings and knockout rounds",
    },
    {
      href: "/match/new",
      icon: "shuttle" as const,
      title: "Casual match",
      text: "Score a single game without any setup",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="card group flex items-center gap-4 transition-colors hover:border-emerald-600"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Icon name={a.icon} size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{a.title}</span>
              <span className="block text-sm text-neutral-500">{a.text}</span>
            </span>
            <Icon name="chevron-right" className="text-neutral-400" />
          </Link>
        ))}
      </div>

      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}

      <section>
        <h2 className="section-title mb-3">Tournaments</h2>
        {tournaments === null ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : tournaments.length === 0 ? (
          <div className="card text-center text-sm text-neutral-500">
            No tournaments yet. Create your first one above.
          </div>
        ) : (
          <ul className="space-y-2">
            {tournaments.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tournaments/${t.id}`}
                  className="card flex items-center gap-3 !p-4 transition-colors hover:border-emerald-600"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{t.name}</p>
                    <p className="truncate text-xs text-neutral-500">
                      {[t.venue, fmtDate(t.start_date)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="badge badge-neutral">
                    <Icon name="clock" size={12} />
                    {daysLeft(t.expires_at)} days left
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="section-title mb-3">Recent casual matches</h2>
        {casual === null ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : casual.length === 0 ? (
          <div className="card text-center text-sm text-neutral-500">No casual matches yet.</div>
        ) : (
          <ul className="space-y-2">
            {casual.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/match/${m.id}`}
                  className="card flex items-center gap-3 !p-4 transition-colors hover:border-emerald-600"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {m.a_label} <span className="font-normal text-neutral-400">vs</span> {m.b_label}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {m.set_scores.length ? scoreLine(m.set_scores) : "Not started"} · {fmtDate(m.created_at)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    {m.sets_a}–{m.sets_b}
                  </span>
                  <span className={`badge ${m.status === "live" ? "badge-amber" : "badge-green"}`}>
                    {m.status === "live" ? "Live" : "Final"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function HomePage() {
  return (
    <Shell title="Shuttle Scorer">
      <HomeContent />
    </Shell>
  );
}
