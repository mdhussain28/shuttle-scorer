"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Hero, PublicShell, SkeletonList } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import { LiveMatchCard, type CardMatch } from "@/components/watch/LiveMatchCard";
import { daysLeft, fmtDate } from "@/lib/format";
import { liveSnapshot } from "@/lib/liveScore";
import type { MatchConfig, MatchEvent } from "@/lib/scoring/engine";
import { getPublicSupabase } from "@/lib/supabase";
import { usePolling } from "@/lib/usePolling";

interface T {
  id: string;
  name: string;
  venue: string | null;
  start_date: string | null;
  expires_at: string;
}
interface Row {
  id: string;
  tournament_id: string;
  category_id: string | null;
  a_label: string;
  b_label: string;
  sets_a: number;
  sets_b: number;
  status: "live" | "finished";
  set_scores: Array<[number, number]>;
  config?: MatchConfig;
  events?: MatchEvent[];
}

export default function WatchHome() {
  const [tournaments, setTournaments] = useState<T[] | null>(null);
  const [live, setLive] = useState<Row[]>([]);
  const [recent, setRecent] = useState<Row[]>([]);
  const [cats, setCats] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getPublicSupabase();
    const [t, l, r, c] = await Promise.all([
      sb.from("tournaments").select("id,name,venue,start_date,expires_at").order("created_at", { ascending: false }),
      sb
        .from("matches")
        .select("id,tournament_id,category_id,a_label,b_label,sets_a,sets_b,status,set_scores,config,events")
        .eq("status", "live")
        .order("created_at", { ascending: false }),
      sb
        .from("matches")
        .select("id,tournament_id,category_id,a_label,b_label,sets_a,sets_b,status,set_scores")
        .eq("status", "finished")
        .order("finished_at", { ascending: false })
        .limit(6),
      sb.from("categories").select("id,name"),
    ]);
    const failure = t.error ?? l.error ?? r.error ?? c.error;
    setErr(
      failure
        ? failure.message.includes("is_public")
          ? "The live page needs the latest database update. An admin must run supabase/schema.sql."
          : failure.message
        : null,
    );
    setTournaments((t.data ?? []) as T[]);
    setLive((l.data ?? []) as Row[]);
    setRecent((r.data ?? []) as Row[]);
    setCats(Object.fromEntries(((c.data ?? []) as Array<{ id: string; name: string }>).map((x) => [x.id, x.name])));
  }, []);

  usePolling(load, 6000);

  const names = Object.fromEntries((tournaments ?? []).map((t) => [t.id, t.name]));
  const toCard = (m: Row): CardMatch => ({
    id: m.id,
    aLabel: m.a_label,
    bLabel: m.b_label,
    setsA: m.sets_a,
    setsB: m.sets_b,
    status: m.status,
    setScores: m.set_scores ?? [],
    snap: m.config && m.events ? liveSnapshot(m.config, m.events) : null,
  });
  const ctx = (m: Row) => [names[m.tournament_id], m.category_id ? cats[m.category_id] : null].filter(Boolean).join(" · ");

  return (
    <PublicShell>
      <div className="space-y-8">
        <Hero
          title="Live badminton scores"
          subtitle="Follow matches as they happen and check points tables. No sign-in needed."
        >
          <div className="inline-flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-2.5 backdrop-blur">
            <span className="live-dot" />
            <span className="text-sm font-semibold">
              {live.length === 0 ? "No match in play right now" : `${live.length} ${live.length === 1 ? "match" : "matches"} in play now`}
            </span>
          </div>
        </Hero>

        {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}

        <section>
          <h2 className="section-title mb-3">Playing now</h2>
          {tournaments === null ? (
            <SkeletonList rows={2} />
          ) : live.length === 0 ? (
            <div className="card text-center text-sm text-neutral-500">No match is being played at the moment. This page refreshes by itself.</div>
          ) : (
            <div className="stagger grid gap-3 sm:grid-cols-2">
              {live.map((m) => (
                <LiveMatchCard key={m.id} m={toCard(m)} context={ctx(m)} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="section-title mb-3">Tournaments</h2>
          {tournaments === null ? (
            <SkeletonList rows={2} />
          ) : tournaments.length === 0 ? (
            <div className="card text-center text-sm text-neutral-500">No public tournaments yet.</div>
          ) : (
            <ul className="stagger space-y-2">
              {tournaments.map((t) => {
                const n = live.filter((m) => m.tournament_id === t.id).length;
                return (
                  <li key={t.id}>
                    <Link href={`/watch/t/${t.id}`} className="card group flex items-center gap-4 !p-4">
                      <img src="/art/trophy.svg" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-2xl shadow-md shadow-brand-900/20 transition duration-300 group-hover:-rotate-3 group-hover:scale-110" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{t.name}</p>
                        <p className="truncate text-xs text-neutral-500">{[t.venue, fmtDate(t.start_date)].filter(Boolean).join(" · ")}</p>
                      </div>
                      {n > 0 && (
                        <span className="badge badge-red">
                          <span className="live-dot" />
                          {n} live
                        </span>
                      )}
                      <span className="badge badge-neutral hidden sm:inline-flex">{daysLeft(t.expires_at)} days left</span>
                      <Icon name="chevron-right" className="text-neutral-300 transition group-hover:translate-x-1" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {recent.length > 0 && (
          <section>
            <h2 className="section-title mb-3">Recent results</h2>
            <div className="stagger grid gap-3 sm:grid-cols-2">
              {recent.map((m) => (
                <LiveMatchCard key={m.id} m={toCard(m)} context={ctx(m)} />
              ))}
            </div>
          </section>
        )}
      </div>
    </PublicShell>
  );
}
