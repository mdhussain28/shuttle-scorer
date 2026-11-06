"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
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

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3">
        <Link href="/tournaments/new" className="card flex flex-col items-center gap-2 py-8 text-center hover:border-emerald-500">
          <span className="text-4xl">🏆</span>
          <span className="font-bold">Tournament</span>
          <span className="text-xs text-neutral-500">Categories, pools, rankings</span>
        </Link>
        <Link href="/match/new" className="card flex flex-col items-center gap-2 py-8 text-center hover:border-emerald-500">
          <span className="text-4xl">🏸</span>
          <span className="font-bold">Casual match</span>
          <span className="text-xs text-neutral-500">Quick game, no setup</span>
        </Link>
      </div>

      {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Your tournaments</h2>
        {tournaments === null ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : tournaments.length === 0 ? (
          <p className="text-sm text-neutral-500">No tournaments yet. Tap “Tournament” to create one.</p>
        ) : (
          <ul className="space-y-2">
            {tournaments.map((t) => (
              <li key={t.id}>
                <Link href={`/tournaments/${t.id}`} className="card flex items-center gap-3 hover:border-emerald-500">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{t.name}</p>
                    <p className="truncate text-xs text-neutral-500">
                      {[t.venue, fmtDate(t.start_date)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="chip bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    {daysLeft(t.expires_at)} days left
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Recent casual matches</h2>
        {casual === null ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : casual.length === 0 ? (
          <p className="text-sm text-neutral-500">No casual matches yet.</p>
        ) : (
          <ul className="space-y-2">
            {casual.map((m) => (
              <li key={m.id}>
                <Link href={`/match/${m.id}`} className="card flex items-center gap-3 hover:border-emerald-500">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {m.a_label} <span className="text-neutral-400">vs</span> {m.b_label}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {m.set_scores.length ? scoreLine(m.set_scores) : "Not started"} · {fmtDate(m.created_at)}
                    </p>
                  </div>
                  <span className="text-sm font-bold tabular-nums">
                    {m.sets_a}–{m.sets_b}
                  </span>
                  <span
                    className={`chip ${
                      m.status === "live"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                    }`}
                  >
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
