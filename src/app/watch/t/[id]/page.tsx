"use client";

import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Hero, PublicShell, SkeletonList } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import { LiveMatchCard, type CardMatch } from "@/components/watch/LiveMatchCard";
import { PublicBracket, type BracketInfo } from "@/components/watch/PublicBracket";
import { PublicStandings } from "@/components/watch/PublicStandings";
import { daysLeft, fmtDate } from "@/lib/format";
import { liveSnapshot } from "@/lib/liveScore";
import { qualificationFor, type QualTone } from "@/lib/qualification";
import { STAGE_LABEL, type KnockoutConfig, type PlayedTie, type Stage } from "@/lib/knockout";
import { computeStandingsDetailed, poolProgress, type StandingMatch } from "@/lib/scoring/standings";
import type { MatchConfig, MatchEvent } from "@/lib/scoring/engine";
import { getPublicSupabase } from "@/lib/supabase";
import type { Category, Entry, Pool, Tournament } from "@/lib/types";
import { entryLabel } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

interface M {
  id: string;
  category_id: string | null;
  pool_id: string | null;
  entry_a_id: string | null;
  entry_b_id: string | null;
  a_label: string;
  b_label: string;
  status: "live" | "finished";
  winner: "a" | "b" | null;
  set_scores: Array<[number, number]>;
  sets_a: number;
  sets_b: number;
  stage: Stage | null;
  slot: number | null;
  is_decider: boolean | null;
  config?: MatchConfig;
  events?: MatchEvent[];
}

const TONE: Record<QualTone, string> = {
  in: "badge-green",
  out: "badge-amber",
  level: "badge-blue",
  eliminated: "badge-red",
  pending: "badge-neutral",
};

export default function WatchTournament() {
  const { id } = useParams<{ id: string }>();
  const [t, setT] = useState<Tournament | null>(null);
  const [missing, setMissing] = useState(false);
  const [cats, setCats] = useState<Category[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [matches, setMatches] = useState<M[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [catId, setCatId] = useState<string | null>(null);
  const [poolId, setPoolId] = useState<string | null>(null);
  const [cut, setCut] = useState(2);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const sb = getPublicSupabase();
    const tt = await sb.from("tournaments").select("*").eq("id", id).maybeSingle();
    if (tt.error || !tt.data) {
      setMissing(true);
      setLoaded(true);
      return;
    }
    setMissing(false);
    const c = await sb.from("categories").select("*").eq("tournament_id", id).order("created_at");
    const categories = (c.data ?? []) as Category[];
    const ids = categories.map((x) => x.id);
    const [p, e, m] = await Promise.all([
      ids.length ? sb.from("pools").select("*").in("category_id", ids).order("created_at") : Promise.resolve({ data: [] }),
      ids.length ? sb.from("entries").select("*").in("category_id", ids).order("created_at") : Promise.resolve({ data: [] }),
      sb
        .from("matches")
        .select(
          "id,category_id,pool_id,entry_a_id,entry_b_id,a_label,b_label,status,winner,set_scores,sets_a,sets_b,stage,slot,is_decider,created_at,config,events",
        )
        .eq("tournament_id", id)
        .order("created_at", { ascending: false }),
    ]);
    setT(tt.data as Tournament);
    setCats(categories);
    setPools((p.data ?? []) as Pool[]);
    setEntries((e.data ?? []) as Entry[]);
    setMatches((m.data ?? []) as M[]);
    setLoaded(true);
  }, [id]);

  usePolling(load, 6000);

  // Selection falls back to the first category / pool until the visitor chooses.
  const category = cats.find((x) => x.id === catId) ?? cats[0] ?? null;
  const catPools = useMemo(() => pools.filter((p) => p.category_id === category?.id), [pools, category]);
  const pool = catPools.find((p) => p.id === poolId) ?? catPools[0] ?? null;
  const catEntries = useMemo(() => entries.filter((e) => e.category_id === category?.id), [entries, category]);
  const labels = useMemo(() => Object.fromEntries(entries.map((e) => [e.id, entryLabel(e)])), [entries]);

  const rules = {
    pointsPerWin: t?.points_per_win ?? 2,
    twoWay: t?.tie_two ?? "head_to_head",
    multiWay: t?.tie_multi ?? "set_point_diff",
  } as const;

  const poolMatches: StandingMatch[] = useMemo(
    () =>
      matches
        .filter((m) => !m.stage && m.status === "finished" && m.entry_a_id && m.entry_b_id)
        .map((m) => ({
          aId: m.entry_a_id as string,
          bId: m.entry_b_id as string,
          sets: m.set_scores,
          winner: m.winner ?? undefined,
          decider: Boolean(m.is_decider),
        })),
    [matches],
  );

  const tables = useMemo(
    () =>
      catPools.map((p) => {
        const ids = catEntries.filter((e) => e.pool_id === p.id).map((e) => e.id);
        const { rows } = computeStandingsDetailed(ids, poolMatches, rules);
        return { pool: p, ids, rows, ...poolProgress(ids, poolMatches) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catPools, catEntries, poolMatches, t],
  );
  const table = tables.find((x) => x.pool.id === pool?.id) ?? null;

  const knockout: KnockoutConfig | null = category?.knockout ?? null;
  const qualified = useMemo(() => {
    if (!knockout) return undefined;
    const s = new Set<string>();
    knockout.slots.forEach((x) => x && s.add(x));
    return s;
  }, [knockout]);

  const card = (m: M): CardMatch => ({
    id: m.id,
    aLabel: m.a_label,
    bLabel: m.b_label,
    setsA: m.sets_a,
    setsB: m.sets_b,
    status: m.status,
    setScores: m.set_scores ?? [],
    snap: m.config && m.events ? liveSnapshot(m.config, m.events) : null,
  });

  const catName = (cid: string | null) => cats.find((x) => x.id === cid)?.name ?? "";
  const live = matches.filter((m) => m.status === "live");
  const shownMatches = matches.filter((m) => m.category_id === category?.id && (!pool || m.pool_id === pool.id || m.stage));
  const ties: PlayedTie[] = matches
    .filter((m) => m.category_id === category?.id && m.stage && m.slot != null)
    .map((m) => ({
      stage: m.stage as Stage, slot: m.slot as number, matchId: m.id, status: m.status,
      aId: m.entry_a_id, bId: m.entry_b_id, winner: m.winner,
    }));
  const info: Record<string, BracketInfo> = Object.fromEntries(
    matches.filter((m) => m.stage).map((m) => [m.id, { setsA: m.sets_a, setsB: m.sets_b, line: m.set_scores.map((s) => `${s[0]}-${s[1]}`).join(", ") }]),
  );

  // Search for a team or player in the chosen category.
  const q = query.trim().toLowerCase();
  const found = q
    ? catEntries
        .filter((e) => [entryLabel(e), e.player1, e.player2 ?? ""].some((s) => s.toLowerCase().includes(q)))
        .slice(0, 6)
    : [];

  if (missing) {
    return (
      <PublicShell title="Tournament" back={{ href: "/", label: "Back to live scores" }}>
        <div className="card mx-auto max-w-md space-y-3 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
            <Icon name="eye-off" size={20} />
          </span>
          <p className="font-semibold">This tournament is not available</p>
          <p className="text-sm text-neutral-500">It may be private, or it has been removed.</p>
        </div>
      </PublicShell>
    );
  }

  if (!loaded || !t) {
    return (
      <PublicShell title="Tournament" back={{ href: "/", label: "Back to live scores" }}>
        <SkeletonList rows={4} />
      </PublicShell>
    );
  }

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition duration-200 active:scale-95 ${
      active
        ? "bg-gradient-to-b from-brand-600 to-brand-700 text-white shadow-md shadow-brand-900/20"
        : "bg-white text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-200 dark:ring-neutral-700"
    }`;

  return (
    <PublicShell title={t.name} back={{ href: "/", label: "Back to live scores" }}>
      <div className="space-y-7">
        <Hero title={t.name} subtitle={[t.venue, fmtDate(t.start_date)].filter(Boolean).join(" · ") || undefined}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-semibold backdrop-blur">
              {live.length > 0 && <span className="live-dot" />}
              {live.length === 0 ? "No match in play" : `${live.length} in play now`}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 backdrop-blur">
              <Icon name="layers" size={13} />
              {cats.length} {cats.length === 1 ? "category" : "categories"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 backdrop-blur">
              <Icon name="clock" size={13} />
              {daysLeft(t.expires_at)} days left
            </span>
          </div>
        </Hero>

        {live.length > 0 && (
          <section>
            <h2 className="section-title mb-3">Playing now</h2>
            <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {live.map((m) => (
                <LiveMatchCard key={m.id} m={card(m)} context={catName(m.category_id)} />
              ))}
            </div>
          </section>
        )}

        {cats.length === 0 ? (
          <div className="card text-center text-sm text-neutral-500">The organiser has not added any categories yet.</div>
        ) : (
          <section className="space-y-5">
            <div className="space-y-3">
              <p className="section-title">Choose a category</p>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {cats.map((c) => (
                  <button key={c.id} className={chip(c.id === category?.id)} onClick={() => { setCatId(c.id); setPoolId(null); setQuery(""); }}>
                    {c.name}
                  </button>
                ))}
              </div>
              {catPools.length > 0 && (
                <>
                  <p className="section-title pt-1">Choose a pool</p>
                  <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                    {catPools.map((p) => (
                      <button key={p.id} className={chip(p.id === pool?.id)} onClick={() => setPoolId(p.id)}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Find a team */}
            <div className="card space-y-3">
              <div className="flex items-center gap-2">
                <Icon name="search" className="text-neutral-500" />
                <h3 className="font-semibold">Check your team or player</h3>
              </div>
              <div className="relative">
                <Icon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  className="input !pl-10"
                  placeholder={`Search in ${category?.name ?? "this category"}`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search for a team or player"
                />
              </div>
              {q && found.length === 0 && <p className="text-sm text-neutral-500">No team or player matches “{query.trim()}” in this category.</p>}
              <div className="stagger space-y-2">
                {found.map((e) => {
                  const tbl = tables.find((x) => x.ids.includes(e.id));
                  const row = tbl?.rows.find((r) => r.id === e.id);
                  if (!tbl || !row) {
                    return (
                      <div key={e.id} className="rounded-xl bg-neutral-50 p-3 text-sm dark:bg-neutral-950/40">
                        <p className="font-semibold">{entryLabel(e)}</p>
                        <p className="text-neutral-500">Not placed in a pool yet.</p>
                      </div>
                    );
                  }
                  const qual = qualificationFor(row, tbl.rows, cut);
                  const inKnock = qualified?.has(e.id);
                  return (
                    <button
                      key={e.id}
                      onClick={() => { setPoolId(tbl.pool.id); }}
                      className="w-full rounded-xl bg-neutral-50 p-3 text-left transition hover:bg-neutral-100 dark:bg-neutral-950/40 dark:hover:bg-neutral-800/60"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{entryLabel(e)}</span>
                        <span className="badge badge-neutral">{tbl.pool.name}</span>
                        <span className="flex-1" />
                        <span className={`badge ${qualified ? (inKnock ? "badge-green" : "badge-red") : TONE[qual.tone]}`}>
                          {qualified ? (inKnock ? "In the knockout stage" : "Not in the knockout stage") : qual.label}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-300">
                        Rank <span className="font-bold">{row.rank}</span> of {tbl.rows.length} · {row.won}W {row.lost}L · {row.matchPoints} pts
                      </p>
                      <p className="text-xs text-neutral-500">{qualified ? "The organiser has created the knockout stage." : qual.detail}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Points table */}
            {pool && table && (
              <div className="card !p-0 overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 p-4 pb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{pool.name}: points table</h3>
                    <p className="text-xs text-neutral-500">
                      {table.played} of {table.total} matches played
                      {table.total > 0 && table.played === table.total ? " · pool complete" : ""}
                    </p>
                  </div>
                  {!qualified && (
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                      <span>Qualifying places</span>
                      <div className="flex rounded-xl bg-neutral-200/70 p-0.5 dark:bg-neutral-800">
                        {[1, 2, 3, 4].map((n) => (
                          <button
                            key={n}
                            onClick={() => setCut(n)}
                            className={`h-7 w-7 rounded-lg text-xs font-bold transition ${cut === n ? "bg-white text-brand-800 shadow-sm dark:bg-neutral-700 dark:text-white" : "text-neutral-500"}`}
                            aria-pressed={cut === n}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <PublicStandings
                  rows={table.rows}
                  labels={labels}
                  cut={cut}
                  qualified={qualified}
                  focusIds={found.map((e) => e.id)}
                />
              </div>
            )}
            {catPools.length === 0 && <div className="card text-center text-sm text-neutral-500">No pools in this category yet.</div>}

            {knockout && (
              <div className="space-y-3">
                <h3 className="section-title">Knockout stage</h3>
                <PublicBracket config={knockout} ties={ties} labels={labels} info={info} />
              </div>
            )}

            <div>
              <h3 className="section-title mb-3">Matches{pool ? `: ${pool.name}` : ""}</h3>
              {shownMatches.length === 0 ? (
                <div className="card text-center text-sm text-neutral-500">No matches to show yet.</div>
              ) : (
                <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {shownMatches.map((m) => (
                    <LiveMatchCard
                      key={m.id}
                      m={card(m)}
                      context={m.is_decider ? "Decider" : m.stage ? (m.stage === "final" || m.stage === "third" ? STAGE_LABEL[m.stage] : `${STAGE_LABEL[m.stage]} ${m.slot ?? ""}`) : (pool?.name ?? "")}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </PublicShell>
  );
}
