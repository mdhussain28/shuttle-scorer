"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Category, Entry, EntryType, MatchRow, Pool } from "@/lib/types";
import { entryLabel } from "@/lib/types";
import { computeStandings, type StandingMatch } from "@/lib/scoring/standings";
import { StandingsTable } from "@/components/StandingsTable";
import { nextGroupName, scoreLine } from "@/lib/format";

type MatchListItem = Pick<
  MatchRow,
  | "id" | "pool_id" | "entry_a_id" | "entry_b_id" | "a_label" | "b_label"
  | "status" | "winner" | "set_scores" | "sets_a" | "sets_b" | "created_at"
>;

const MATCH_COLUMNS =
  "id,pool_id,entry_a_id,entry_b_id,a_label,b_label,status,winner,set_scores,sets_a,sets_b,created_at";

export function CategorySection({
  category,
  pointsPerWin,
  onDeleted,
}: {
  category: Category;
  pointsPerWin: number;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [pools, setPools] = useState<Pool[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [poolName, setPoolName] = useState("");
  const [entryType, setEntryType] = useState<EntryType>("doubles");
  const [teamName, setTeamName] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [entryPool, setEntryPool] = useState("");

  const load = useCallback(async () => {
    const sb = getSupabase();
    const [p, e, m] = await Promise.all([
      sb.from("pools").select("*").eq("category_id", category.id).order("created_at"),
      sb.from("entries").select("*").eq("category_id", category.id).order("created_at"),
      sb.from("matches").select(MATCH_COLUMNS).eq("category_id", category.id).order("created_at", { ascending: false }),
    ]);
    const failure = p.error ?? e.error ?? m.error;
    if (failure) {
      setErr(failure.message);
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

  const standingMatches: StandingMatch[] = useMemo(
    () =>
      matches
        .filter((m) => m.status === "finished" && m.entry_a_id && m.entry_b_id)
        .map((m) => ({
          aId: m.entry_a_id as string,
          bId: m.entry_b_id as string,
          sets: m.set_scores,
          winner: m.winner ?? undefined,
        })),
    [matches],
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

  async function removeEntry(entry: Entry) {
    if (!confirm(`Remove ${entryLabel(entry)}? Matches already played keep their names but no longer count in the standings.`)) return;
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
    <li key={e.id} className="flex items-center gap-2 py-1.5 text-sm">
      <span className="chip bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
        {e.entry_type === "doubles" ? "D" : "S"}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{entryLabel(e)}</span>
        {e.entry_type === "doubles" && (
          <span className="text-neutral-500"> · {e.player1} & {e.player2}</span>
        )}
      </span>
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
      <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => void removeEntry(e)} aria-label="Remove">
        ✕
      </button>
    </li>
  );

  return (
    <section className="card space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="text-neutral-400">{open ? "▾" : "▸"}</span>
          <h2 className="truncate text-lg font-bold">{category.name}</h2>
          <span className="chip bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
        </button>
        <button className="btn btn-ghost !px-3 !py-1.5 text-xs text-red-600" onClick={() => void removeCategory()}>
          Delete
        </button>
      </div>

      {open && (
        <>
          {err && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {err}
            </p>
          )}

          {/* Add team / player */}
          <form onSubmit={addEntry} className="space-y-3 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-950/60">
            <p className="text-sm font-semibold">Add a team or player</p>
            <div className="flex gap-2">
              {(["singles", "doubles"] as EntryType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setEntryType(t)}
                  className={`btn flex-1 ${entryType === t ? "btn-primary" : "btn-secondary"}`}
                >
                  {t === "singles" ? "Singles" : "Doubles"}
                </button>
              ))}
            </div>
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
              Add {entryType === "doubles" ? "team" : "player"}
            </button>
          </form>

          {/* Pools */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Pools</h3>
              <Link href={`/match/new?category=${category.id}`} className="text-sm font-medium text-emerald-600 hover:underline">
                New match (any two)
              </Link>
            </div>
            <form onSubmit={addPool} className="flex gap-2">
              <input className="input" placeholder="Pool name, e.g. Group A" value={poolName} onChange={(e) => setPoolName(e.target.value)} />
              <button className="btn btn-secondary shrink-0" disabled={busy}>
                Add pool
              </button>
            </form>

            {pools.length === 0 && (
              <p className="text-sm text-neutral-500">No pools yet. Add “Group A”, “Group B” and so on, then assign teams to them.</p>
            )}

            {pools.map((pool) => {
              const poolEntries = entries.filter((e) => e.pool_id === pool.id);
              const rows = computeStandings(
                poolEntries.map((e) => e.id),
                standingMatches,
                { pointsPerWin },
              );
              return (
                <div key={pool.id} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
                  <div className="mb-2 flex items-center gap-2">
                    <h4 className="flex-1 font-semibold">
                      {pool.name}
                      <span className="ml-2 text-xs font-normal text-neutral-500">{poolEntries.length} entries</span>
                    </h4>
                    <Link
                      href={`/match/new?category=${category.id}&pool=${pool.id}`}
                      className="btn btn-primary !px-3 !py-1.5 text-xs"
                    >
                      New match
                    </Link>
                    <button className="btn btn-ghost !px-2 !py-1.5 text-xs" onClick={() => void removePool(pool)} aria-label="Delete pool">
                      ✕
                    </button>
                  </div>
                  <StandingsTable rows={rows} labels={labels} />
                  {poolEntries.length > 0 && (
                    <ul className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">{poolEntries.map(entryRow)}</ul>
                  )}
                </div>
              );
            })}

            {unassigned.length > 0 && (
              <div className="rounded-xl border border-dashed border-neutral-300 p-3 dark:border-neutral-700">
                <h4 className="mb-1 font-semibold">Not in a pool</h4>
                <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">{unassigned.map(entryRow)}</ul>
              </div>
            )}
          </div>

          {/* Matches */}
          <div>
            <h3 className="mb-2 font-semibold">Matches</h3>
            {matches.length === 0 ? (
              <p className="text-sm text-neutral-500">No matches played yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {matches.map((m) => (
                  <li key={m.id}>
                    <Link href={`/match/${m.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {m.a_label} <span className="text-neutral-400">vs</span> {m.b_label}
                        </p>
                        <p className="truncate text-xs text-neutral-500">
                          {m.set_scores.length ? scoreLine(m.set_scores) : "Not started"}
                          {m.pool_id ? ` · ${pools.find((p) => p.id === m.pool_id)?.name ?? ""}` : ""}
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
          </div>
        </>
      )}
    </section>
  );
}
