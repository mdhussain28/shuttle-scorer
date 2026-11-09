"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Category, Entry, EntryType, MatchRow, Pool } from "@/lib/types";
import { entryLabel } from "@/lib/types";
import {
  computeStandingsDetailed,
  isPoolComplete,
  poolProgress,
  type MultiWayRule,
  type StandingMatch,
  type TwoWayRule,
} from "@/lib/scoring/standings";
import { STAGE_LABEL, type KnockoutConfig, type PlayedTie, type Stage } from "@/lib/knockout";
import { StandingsTable } from "@/components/StandingsTable";
import { KnockoutPanel, type PoolInfo, type TieInfo } from "@/components/KnockoutPanel";
import { Icon } from "@/components/Icon";
import { Segmented } from "@/components/Segmented";
import { nextGroupName, scoreLine } from "@/lib/format";

export interface Rules {
  pointsPerWin: number;
  twoWay: TwoWayRule;
  multiWay: MultiWayRule;
}

type MatchListItem = Pick<
  MatchRow,
  | "id" | "pool_id" | "entry_a_id" | "entry_b_id" | "a_label" | "b_label"
  | "status" | "winner" | "set_scores" | "sets_a" | "sets_b" | "created_at"
  | "stage" | "slot" | "is_decider" | "is_public"
>;

const MATCH_COLUMNS =
  "id,pool_id,entry_a_id,entry_b_id,a_label,b_label,status,winner,set_scores,sets_a,sets_b,created_at,stage,slot,is_decider,is_public";

const SCHEMA_HINT = " Run the latest supabase/schema.sql in the Supabase SQL Editor.";

export function CategorySection({
  category,
  rules,
  readOnly = false,
  onDeleted,
}: {
  category: Category;
  rules: Rules;
  /** Umpires can start and score matches but cannot change the setup. */
  readOnly?: boolean;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [pools, setPools] = useState<Pool[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [knockout, setKnockout] = useState<KnockoutConfig | null>(category.knockout ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [poolName, setPoolName] = useState("");
  const [entryType, setEntryType] = useState<EntryType>("doubles");
  const [teamName, setTeamName] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [entryPool, setEntryPool] = useState("");

  useEffect(() => {
    setKnockout(category.knockout ?? null);
  }, [category.knockout]);

  const load = useCallback(async () => {
    const sb = getSupabase();
    const [p, e, m] = await Promise.all([
      sb.from("pools").select("*").eq("category_id", category.id).order("created_at"),
      sb.from("entries").select("*").eq("category_id", category.id).order("created_at"),
      sb.from("matches").select(MATCH_COLUMNS).eq("category_id", category.id).order("created_at", { ascending: false }),
    ]);
    const failure = p.error ?? e.error ?? m.error;
    if (failure) {
      setErr(failure.message.includes("column") ? failure.message + SCHEMA_HINT : failure.message);
      return;
    }
    setPools((p.data ?? []) as Pool[]);
    setEntries((e.data ?? []) as Entry[]);
    setMatches((m.data ?? []) as MatchListItem[]);
  }, [category.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Pre-fill the next free pool name ("Group A", "Group B", ...).
  useEffect(() => {
    setPoolName((current) => (current ? current : nextGroupName(pools.map((p) => p.name))));
  }, [pools]);

  const labels = useMemo(() => Object.fromEntries(entries.map((e) => [e.id, entryLabel(e)])), [entries]);

  // Pool-stage matches only: knockout matches never count in the pool tables.
  const standingMatches: StandingMatch[] = useMemo(
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

  const poolTables = useMemo(
    () =>
      pools.map((pool) => {
        const ids = entries.filter((e) => e.pool_id === pool.id).map((e) => e.id);
        const { rows, pending } = computeStandingsDetailed(ids, standingMatches, {
          pointsPerWin: rules.pointsPerWin,
          twoWay: rules.twoWay,
          multiWay: rules.multiWay,
        });
        const progress = poolProgress(ids, standingMatches);
        return { pool, ids, rows, pending, complete: isPoolComplete(ids, standingMatches), ...progress };
      }),
    [pools, entries, standingMatches, rules.pointsPerWin, rules.twoWay, rules.multiWay],
  );

  const poolInfos: PoolInfo[] = poolTables.map((t) => ({
    id: t.pool.id,
    name: t.pool.name,
    rows: t.rows,
    complete: t.complete,
    played: t.played,
    total: t.total,
    pendingDeciders: t.complete ? t.pending.reduce((n, p) => n + p.pairs.length, 0) : 0,
  }));

  const ties: PlayedTie[] = matches
    .filter((m) => m.stage && m.slot != null)
    .map((m) => ({
      stage: m.stage as Stage,
      slot: m.slot as number,
      matchId: m.id,
      status: m.status,
      aId: m.entry_a_id,
      bId: m.entry_b_id,
      winner: m.winner,
    }));

  const tieInfo: Record<string, TieInfo> = Object.fromEntries(
    matches
      .filter((m) => m.stage)
      .map((m) => [m.id, { setsA: m.sets_a, setsB: m.sets_b, line: scoreLine(m.set_scores) }]),
  );

  async function mutate(action: PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setErr(null);
    const { error } = await action;
    setBusy(false);
    if (error) {
      setErr(error.message);
      return false;
    }
    await load();
    return true;
  }

  async function addPool(ev: FormEvent) {
    ev.preventDefault();
    const name = poolName.trim();
    if (!name) return setErr("Enter a pool name.");
    const ok = await mutate(getSupabase().from("pools").insert({ category_id: category.id, name }));
    if (ok) setPoolName("");
  }

  async function addEntry(ev: FormEvent) {
    ev.preventDefault();
    const a = p1.trim();
    const b = p2.trim();
    const t = teamName.trim();
    if (!a) return setErr(entryType === "singles" ? "Enter the player's name." : "Enter player 1's name.");
    if (entryType === "doubles" && (!t || !b)) return setErr("Doubles needs a team name and both player names.");
    const ok = await mutate(
      getSupabase().from("entries").insert({
        category_id: category.id,
        pool_id: entryPool || null,
        entry_type: entryType,
        team_name: entryType === "doubles" ? t : null,
        player1: a,
        player2: entryType === "doubles" ? b : null,
      }),
    );
    if (ok) {
      setTeamName("");
      setP1("");
      setP2("");
    }
  }

  async function movePool(entry: Entry, poolId: string) {
    await mutate(getSupabase().from("entries").update({ pool_id: poolId || null }).eq("id", entry.id));
  }

  async function setVisibility(m: MatchListItem, isPublic: boolean) {
    setErr(null);
    const { error } = await getSupabase().from("matches").update({ is_public: isPublic }).eq("id", m.id);
    if (error) return setErr(error.message.includes("column") ? error.message + SCHEMA_HINT : error.message);
    setMatches((list) => list.map((x) => (x.id === m.id ? { ...x, is_public: isPublic } : x)));
  }

  async function removeEntry(entry: Entry) {
    if (
      !confirm(
        `Remove ${entryLabel(entry)}? Matches already played keep their names but stop counting in the standings and the bracket.`,
      )
    )
      return;
    await mutate(getSupabase().from("entries").delete().eq("id", entry.id));
  }

  async function removePool(pool: Pool) {
    if (!confirm(`Delete ${pool.name}? Its teams and players stay in the category, unassigned.`)) return;
    await mutate(getSupabase().from("pools").delete().eq("id", pool.id));
  }

  async function removeCategory() {
    if (!confirm(`Delete the category "${category.name}" with all its pools, teams and matches?`)) return;
    const { error } = await getSupabase().from("categories").delete().eq("id", category.id);
    if (error) setErr(error.message);
    else onDeleted();
  }

  const unassigned = entries.filter((e) => !e.pool_id);

  const entryRow = (e: Entry) => (
    <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
      <span className="badge badge-neutral">{e.entry_type === "doubles" ? "Doubles" : "Singles"}</span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{entryLabel(e)}</span>
        {e.entry_type === "doubles" && (
          <span className="text-neutral-500">
            {" "}
            · {e.player1} & {e.player2}
          </span>
        )}
      </span>
      {readOnly ? (
        <span className="text-xs text-neutral-500">{pools.find((p) => p.id === e.pool_id)?.name ?? "No pool"}</span>
      ) : (
      <select
        aria-label={`Pool for ${entryLabel(e)}`}
        className="input !w-auto !py-1 text-xs"
        value={e.pool_id ?? ""}
        onChange={(ev) => void movePool(e, ev.target.value)}
      >
        <option value="">No pool</option>
        {pools.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      )}
      {!readOnly && (
        <button className="btn btn-ghost btn-sm !px-2" onClick={() => void removeEntry(e)} aria-label={`Remove ${entryLabel(e)}`}>
          <Icon name="x" size={14} />
        </button>
      )}
    </li>
  );

  const stageName = (m: MatchListItem): string | null => {
    if (m.is_decider) return "Decider";
    if (!m.stage) return null;
    return m.stage === "final" || m.stage === "third" ? STAGE_LABEL[m.stage] : `${STAGE_LABEL[m.stage]} ${m.slot ?? ""}`;
  };

  return (
    <section className="card space-y-6">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <Icon name={open ? "chevron-down" : "chevron-right"} className="text-neutral-400" />
          <h2 className="truncate text-lg font-semibold">{category.name}</h2>
          <span className="badge badge-neutral">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
        </button>
        {!readOnly && (
          <button className="btn btn-ghost btn-sm text-red-700 dark:text-red-400" onClick={() => void removeCategory()}>
            <Icon name="trash" size={14} />
            Delete
          </button>
        )}
      </div>

      {open && (
        <>
          {err && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>
          )}

          {/* Teams and players */}
          {!readOnly && <div>
            <h3 className="section-title mb-3">Add a team or player</h3>
            <form onSubmit={addEntry} className="space-y-3 rounded-xl bg-neutral-50 p-4 dark:bg-neutral-950/40">
              <Segmented
                ariaLabel="Entry type"
                value={entryType}
                onChange={setEntryType}
                options={[
                  { value: "doubles", label: "Doubles" },
                  { value: "singles", label: "Singles" },
                ]}
              />
              {entryType === "doubles" && (
                <input className="input" placeholder="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
              )}
              <div className={`grid gap-2 ${entryType === "doubles" ? "sm:grid-cols-2" : ""}`}>
                <input
                  className="input"
                  placeholder={entryType === "doubles" ? "Player 1 name" : "Player name"}
                  value={p1}
                  onChange={(e) => setP1(e.target.value)}
                />
                {entryType === "doubles" && (
                  <input className="input" placeholder="Player 2 name" value={p2} onChange={(e) => setP2(e.target.value)} />
                )}
              </div>
              <select className="input" value={entryPool} onChange={(e) => setEntryPool(e.target.value)}>
                <option value="">Assign to a pool later</option>
                {pools.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button className="btn btn-primary w-full" disabled={busy}>
                <Icon name="plus" size={16} />
                Add {entryType === "doubles" ? "team" : "player"}
              </button>
            </form>
          </div>}

          {/* Pools */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="section-title">Pools</h3>
              <Link href={`/match/new?category=${category.id}`} className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-400">
                New match (any two)
              </Link>
            </div>
            {!readOnly && <form onSubmit={addPool} className="flex gap-2">
              <input className="input" placeholder="Pool name, e.g. Group A" value={poolName} onChange={(e) => setPoolName(e.target.value)} />
              <button className="btn btn-secondary shrink-0" disabled={busy}>
                <Icon name="layers" size={16} />
                Add pool
              </button>
            </form>}

            {pools.length === 0 && (
              <p className="text-sm text-neutral-500">No pools yet. Add “Group A”, “Group B” and so on, then assign teams to them.</p>
            )}

            {poolTables.map((t) => {
              const { pool, rows, pending, complete, played, total } = t;
              const poolEntries = entries.filter((e) => e.pool_id === pool.id);
              return (
                <div key={pool.id} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold">{pool.name}</h4>
                    <span className="badge badge-neutral">{poolEntries.length} entries</span>
                    {total > 0 && (
                      <span className={`badge ${complete ? "badge-green" : "badge-neutral"}`}>
                        {complete ? "Complete" : `${played}/${total} played`}
                      </span>
                    )}
                    <span className="flex-1" />
                    <Link href={`/match/new?category=${category.id}&pool=${pool.id}`} className="btn btn-primary btn-sm">
                      <Icon name="plus" size={14} />
                      New match
                    </Link>
                    {!readOnly && (
                      <button className="btn btn-ghost btn-sm !px-2" onClick={() => void removePool(pool)} aria-label={`Delete ${pool.name}`}>
                        <Icon name="x" size={14} />
                      </button>
                    )}
                  </div>
                  <StandingsTable rows={rows} labels={labels} />

                  {complete && pending.length > 0 && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
                      <p className="mb-2 flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
                        <Icon name="flag" size={16} />
                        Decider needed
                      </p>
                      <p className="mb-2 text-xs text-amber-800 dark:text-amber-300">
                        These teams are level on wins. The decider only settles their order and does not change the pool table figures.
                      </p>
                      <ul className="space-y-2">
                        {pending
                          .flatMap((p) => p.pairs)
                          .map(([x, y]) => (
                            <li key={`${x}${y}`} className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate">
                                {labels[x]} <span className="text-neutral-500">vs</span> {labels[y]}
                              </span>
                              <Link
                                href={`/match/new?category=${category.id}&pool=${pool.id}&a=${x}&b=${y}&kind=decider`}
                                className="btn btn-primary btn-sm"
                              >
                                Play decider
                              </Link>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {poolEntries.length > 0 && (
                    <ul className="mt-3 divide-y divide-neutral-100 border-t border-neutral-100 dark:divide-neutral-800 dark:border-neutral-800">
                      {poolEntries.map(entryRow)}
                    </ul>
                  )}
                </div>
              );
            })}

            {unassigned.length > 0 && (
              <div className="rounded-xl border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
                <h4 className="mb-1 font-semibold">Not in a pool</h4>
                <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">{unassigned.map(entryRow)}</ul>
              </div>
            )}
          </div>

          {/* Knockout */}
          <div className="space-y-3">
            <h3 className="section-title">Knockout stage</h3>
            <KnockoutPanel
              categoryId={category.id}
              pools={poolInfos}
              labels={labels}
              knockout={knockout}
              ties={ties}
              info={tieInfo}
              readOnly={readOnly}
              onSaved={setKnockout}
              onReload={() => void load()}
            />
          </div>

          {/* Matches */}
          <div>
            <h3 className="section-title mb-3">All matches</h3>
            {matches.length === 0 ? (
              <p className="text-sm text-neutral-500">No matches played yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {matches.map((m) => {
                  const tag = stageName(m);
                  const poolLabel = m.pool_id ? pools.find((p) => p.id === m.pool_id)?.name : null;
                  return (
                    <li key={m.id} className="flex items-center gap-2">
                      <Link href={`/match/${m.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 hover:opacity-80">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {m.a_label} <span className="font-normal text-neutral-400">vs</span> {m.b_label}
                          </p>
                          <p className="truncate text-xs text-neutral-500">
                            {m.set_scores.length ? scoreLine(m.set_scores) : "Not started"}
                            {poolLabel ? ` · ${poolLabel}` : ""}
                          </p>
                        </div>
                        {tag && <span className="badge badge-neutral">{tag}</span>}
                        <span className="text-sm font-semibold tabular-nums">
                          {m.sets_a}–{m.sets_b}
                        </span>
                        <span className={`badge ${m.status === "live" ? "badge-amber" : "badge-green"}`}>
                          {m.status === "live" ? (
                            <>
                              <span className="h-1.5 w-1.5 animate-glow rounded-full bg-amber-500" />
                              Live
                            </>
                          ) : (
                            "Final"
                          )}
                        </span>
                      </Link>
                      {!readOnly && (
                        <button
                          className={`btn btn-sm !px-2 ${m.is_public === false ? "btn-ghost text-neutral-400" : "btn-ghost text-brand-700 dark:text-brand-300"}`}
                          onClick={() => void setVisibility(m, m.is_public === false)}
                          aria-label={m.is_public === false ? "Private. Click to make public" : "Public. Click to make private"}
                          title={
                            m.is_public === false
                              ? "Private: hidden from the public live page and points table. Click to show."
                              : "Public: shown on the live page. Click to hide (it is also left out of the public points table)."
                          }
                        >
                          <Icon name={m.is_public === false ? "eye-off" : "eye"} size={16} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
