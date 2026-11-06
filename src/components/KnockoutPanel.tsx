"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { getSupabase } from "@/lib/supabase";
import {
  STAGE_LABEL,
  STAGE_ORDER,
  STAGE_SHORT,
  buildFixtures,
  buildSlots,
  podium,
  stageSize,
  validateQualifiers,
  type Fixture,
  type KnockoutConfig,
  type PlayedTie,
} from "@/lib/knockout";
import type { StandingRow } from "@/lib/scoring/standings";

export interface PoolInfo {
  id: string;
  name: string;
  /** Ranked standings of this pool. */
  rows: StandingRow[];
  complete: boolean;
  played: number;
  total: number;
  /** Decider matches still needed to separate level teams. */
  pendingDeciders: number;
}

export interface TieInfo {
  setsA: number;
  setsB: number;
  line: string;
}

/** "Group A" -> "A", "Pool 2" -> "2". */
function shortPool(name: string): string {
  const m = name.trim().match(/^(?:group|pool)\s+(.+)$/i);
  return (m ? m[1] : name).slice(0, 4).toUpperCase();
}

export function KnockoutPanel({
  categoryId,
  pools,
  labels,
  knockout,
  ties,
  info,
  onSaved,
  onReload,
}: {
  categoryId: string;
  pools: PoolInfo[];
  labels: Record<string, string>;
  knockout: KnockoutConfig | null;
  ties: PlayedTie[];
  info: Record<string, TieInfo>;
  onSaved: (config: KnockoutConfig | null) => void;
  onReload: () => void;
}) {
  const [stage, setStage] = useState<"qf" | "sf">("sf");
  // null = default selection (top 2 of every pool) until the organiser changes it.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [third, setThird] = useState(true);
  const [orders, setOrders] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Pools that have matches to play decide when the stage unlocks; every pool with a team can send teams.
  const playable = pools.filter((p) => p.rows.length >= 2);
  const eligible = pools.filter((p) => p.rows.length >= 1);
  const played = playable.reduce((n, p) => n + p.played, 0);
  const total = playable.reduce((n, p) => n + p.total, 0);
  const allComplete = playable.length > 0 && playable.every((p) => p.complete);

  const banner = err && (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>
  );

  // ---------------------------------------------------------------- bracket view
  if (knockout) {
    const fixtures = buildFixtures(knockout, ties);
    const stages = STAGE_ORDER.filter((s) => fixtures.some((f) => f.stage === s));
    const pod = podium(fixtures);

    const side = (f: Fixture, which: "a" | "b") => {
      const id = which === "a" ? f.aId : f.bId;
      const from = which === "a" ? f.aFrom : f.bFrom;
      const won = Boolean(id) && f.winnerId === id;
      const lost = Boolean(id) && f.loserId === id;
      const t = f.matchId ? info[f.matchId] : null;
      const sets = t ? (which === "a" ? t.setsA : t.setsB) : null;
      return (
        <div
          className={`flex items-center gap-2 px-3 py-2 text-sm ${won ? "font-semibold" : ""} ${
            lost ? "text-neutral-400" : ""
          }`}
        >
          <span className="min-w-0 flex-1 truncate">
            {id ? (
              (labels[id] ?? "?")
            ) : (
              <span className="italic text-neutral-400">{f.bye ? "Bye" : (from ?? "To be decided")}</span>
            )}
          </span>
          {won && <Icon name="check" size={14} className="text-emerald-600" />}
          {sets !== null && <span className="w-4 text-right tabular-nums">{sets}</span>}
        </div>
      );
    };

    const footer = (f: Fixture) => {
      if (f.bye) return <span className="text-xs text-neutral-500">Advances automatically</span>;
      if (f.matchId && f.status === "finished") {
        return (
          <>
            <span className="truncate text-xs text-neutral-500">{f.matchId ? (info[f.matchId]?.line ?? "") : ""}</span>
            <Link href={`/match/${f.matchId}`} className="btn btn-secondary btn-sm">
              View
            </Link>
          </>
        );
      }
      if (f.matchId && f.status === "live") {
        return (
          <>
            <span className="badge badge-amber">Live</span>
            <Link href={`/match/${f.matchId}`} className="btn btn-primary btn-sm">
              Continue
            </Link>
          </>
        );
      }
      if (f.aId && f.bId) {
        return (
          <>
            <span className="text-xs text-neutral-500">Ready to play</span>
            <Link
              href={`/match/new?category=${categoryId}&stage=${f.stage}&slot=${f.slot}&a=${f.aId}&b=${f.bId}`}
              className="btn btn-primary btn-sm"
            >
              <Icon name="play" size={12} />
              Start match
            </Link>
          </>
        );
      }
      return <span className="text-xs text-neutral-500">Waiting for earlier results</span>;
    };

    async function reset() {
      if (
        !confirm(
          "Reset the knockout stage? The bracket and every knockout match will be deleted. Pool results are not affected.",
        )
      )
        return;
      setBusy(true);
      setErr(null);
      const sb = getSupabase();
      const del = await sb.from("matches").delete().eq("category_id", categoryId).not("stage", "is", null);
      if (del.error) {
        setErr(del.error.message);
        setBusy(false);
        return;
      }
      const upd = await sb.from("categories").update({ knockout: null }).eq("id", categoryId);
      setBusy(false);
      if (upd.error) {
        setErr(upd.error.message);
        return;
      }
      onSaved(null);
      onReload();
    }

    return (
      <div className="space-y-4">
        {banner}
        {pod.champion && (
          <div className="flex items-center gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-700 text-white">
              <Icon name="trophy" size={22} />
            </span>
            <div className="min-w-0 text-sm">
              <p className="font-semibold">Champion: {labels[pod.champion] ?? "?"}</p>
              <p className="truncate text-neutral-600 dark:text-neutral-400">
                {pod.runnerUp && <>Runner-up: {labels[pod.runnerUp] ?? "?"}</>}
                {pod.third && <> · Third: {labels[pod.third] ?? "?"}</>}
              </p>
            </div>
          </div>
        )}
        {stages.map((s) => (
          <div key={s}>
            <h4 className="mb-2 text-sm font-semibold">{s === "qf" || s === "sf" ? `${STAGE_LABEL[s]}s` : STAGE_LABEL[s]}</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {fixtures
                .filter((f) => f.stage === s)
                .map((f) => (
                  <div key={`${f.stage}${f.slot}`} className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
                    <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
                      {s === "final" || s === "third" ? STAGE_LABEL[s] : `${STAGE_SHORT[s]}${f.slot}`}
                    </div>
                    {side(f, "a")}
                    <div className="border-t border-neutral-100 dark:border-neutral-800/70" />
                    {side(f, "b")}
                    <div className="flex min-h-[2.75rem] items-center justify-between gap-2 border-t border-neutral-200 px-3 py-2 dark:border-neutral-800">
                      {footer(f)}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm text-red-700 dark:text-red-400" disabled={busy} onClick={() => void reset()}>
          <Icon name="trash" size={14} />
          Reset knockout stage
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------------ not ready
  if (eligible.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">
        <Icon name="lock" className="mt-0.5" />
        <p>Add pools with at least two teams or players each. The knockout stage unlocks once every pool match has been played.</p>
      </div>
    );
  }

  if (!allComplete) {
    const pct = total === 0 ? 0 : Math.round((played / total) * 100);
    return (
      <div className="space-y-3 rounded-lg border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
        <div className="flex items-start gap-3 text-sm text-neutral-600 dark:text-neutral-400">
          <Icon name="lock" className="mt-0.5" />
          <p>
            The knockout stage unlocks when every pool match has been played.{" "}
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              {played} of {total}
            </span>{" "}
            pool matches are done.
          </p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- setup view
  const orderFor = (p: PoolInfo): string[] => {
    const base = p.rows.map((r) => r.id);
    const o = orders[p.id];
    return o && o.length === base.length && base.every((id) => o.includes(id)) ? o : base;
  };

  function move(p: PoolInfo, idx: number, dir: -1 | 1) {
    const cur = [...orderFor(p)];
    const j = idx + dir;
    if (j < 0 || j >= cur.length) return;
    const rank = (id: string) => p.rows.find((r) => r.id === id)?.rank ?? 0;
    if (rank(cur[idx]) !== rank(cur[j])) return; // only teams level on every rule can swap
    [cur[idx], cur[j]] = [cur[j], cur[idx]];
    setOrders({ ...orders, [p.id]: cur });
  }

  const isPicked = (p: PoolInfo, id: string): boolean => {
    if (picked) return picked.has(id);
    return orderFor(p).indexOf(id) < 2; // default: top 2 of each pool
  };
  const current = (): Set<string> => new Set(picked ?? eligible.flatMap((p) => orderFor(p).slice(0, 2)));
  const toggle = (id: string) => {
    const next = current();
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const quickFill = (n: number) => setPicked(new Set(eligible.flatMap((p) => orderFor(p).slice(0, n))));

  // Selected teams per pool, kept in pool-rank order so higher ranked teams get better seeds.
  const selectedByPool = eligible.map((p) => orderFor(p).filter((id) => isPicked(p, id)));
  const qualifiers = selectedByPool.reduce((n, l) => n + l.length, 0);
  const problem = validateQualifiers(qualifiers, stage);

  let slots: Array<string | null> | null = null;
  if (!problem) {
    try {
      slots = buildSlots(selectedByPool, Math.max(1, ...selectedByPool.map((l) => l.length)), stageSize(stage));
    } catch {
      slots = null;
    }
  }

  const origin: Record<string, string> = {};
  eligible.forEach((p) => orderFor(p).forEach((id, i) => (origin[id] = `${shortPool(p.name)}${i + 1}`)));

  const levelInQualifying = eligible.some((p) =>
    orderFor(p).some((id) => isPicked(p, id) && p.rows.find((r) => r.id === id)?.tied),
  );
  const pendingDeciders = eligible.reduce((n, p) => n + p.pendingDeciders, 0);

  async function generate() {
    if (!slots) return;
    setBusy(true);
    setErr(null);
    const config: KnockoutConfig = { stage, slots, thirdPlace: third };
    const { error } = await getSupabase().from("categories").update({ knockout: config }).eq("id", categoryId);
    setBusy(false);
    if (error) {
      setErr(
        error.message.includes("column")
          ? `${error.message}. Run the latest supabase/schema.sql in the Supabase SQL Editor.`
          : error.message,
      );
      return;
    }
    onSaved(config);
  }

  const nameOf = (id: string | null) => (id ? `${labels[id] ?? "?"} (${origin[id] ?? ""})` : "Bye");

  return (
    <div className="space-y-4">
      {banner}
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
        <Icon name="check" size={16} />
        Pool stage complete. Choose the knockout round and the app will map the teams for you.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Knockout round</label>
          <div className="seg">
            <button type="button" className={`seg-btn ${stage === "sf" ? "seg-btn-active" : ""}`} onClick={() => setStage("sf")}>
              Semi-finals
            </button>
            <button type="button" className={`seg-btn ${stage === "qf" ? "seg-btn-active" : ""}`} onClick={() => setStage("qf")}>
              Quarter-finals
            </button>
          </div>
        </div>
        <div>
          <label className="label">Quick select</label>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary flex-1" onClick={() => quickFill(1)}>
              Top 1 per pool
            </button>
            <button type="button" className="btn btn-secondary flex-1" onClick={() => quickFill(2)}>
              Top 2 per pool
            </button>
          </div>
        </div>
      </div>

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Tick the teams that go through, using the points table above. You can take a different number from each pool.{" "}
        <span className="font-medium text-neutral-900 dark:text-neutral-100">{qualifiers} selected.</span>
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={third} onChange={(e) => setThird(e.target.checked)} />
        Include a third-place match
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        {eligible.map((p) => {
          const order = orderFor(p);
          return (
            <div key={p.id} className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
                <span>{p.name}</span>
                <span>{order.filter((id) => isPicked(p, id)).length} advance</span>
              </div>
              <ul>
                {order.map((id, i) => {
                  const row = p.rows.find((r) => r.id === id);
                  const advances = isPicked(p, id);
                  const canUp = Boolean(row?.tied) && i > 0 && p.rows.find((r) => r.id === order[i - 1])?.rank === row?.rank;
                  const canDown =
                    Boolean(row?.tied) && i < order.length - 1 && p.rows.find((r) => r.id === order[i + 1])?.rank === row?.rank;
                  return (
                    <li
                      key={id}
                      className={`flex items-center gap-2 border-b border-neutral-100 px-3 py-2 text-sm last:border-0 dark:border-neutral-800/70 ${
                        advances ? "" : "text-neutral-400"
                      }`}
                    >
                      <input
                        type="checkbox"
                        aria-label={`${labels[id] ?? "Team"} advances`}
                        checked={advances}
                        onChange={() => toggle(id)}
                      />
                      <span className="w-4 text-xs tabular-nums text-neutral-500">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{labels[id] ?? "?"}</span>
                      {row?.tied && <span className="badge badge-amber">Level</span>}
                      {row?.tied && (
                        <span className="flex">
                          <button
                            type="button"
                            aria-label="Move up"
                            disabled={!canUp}
                            onClick={() => move(p, i, -1)}
                            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800"
                          >
                            <Icon name="arrow-up" size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label="Move down"
                            disabled={!canDown}
                            onClick={() => move(p, i, 1)}
                            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800"
                          >
                            <Icon name="arrow-down" size={14} />
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {pendingDeciders > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <Icon name="alert" size={16} className="mt-0.5" />
          Some teams still need a decider match. Play it from the pool card above, or set their order here after a draw of lots.
        </p>
      )}
      {levelInQualifying && pendingDeciders === 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <Icon name="alert" size={16} className="mt-0.5" />
          Teams marked “Level” are tied on every ranking rule. Use the arrows to set their order after the draw of lots.
        </p>
      )}

      {problem ? (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <Icon name="alert" size={16} className="mt-0.5" />
          {problem}
        </p>
      ) : (
        slots && (
          <div>
            <h4 className="mb-2 text-sm font-semibold">Draw preview</h4>
            <ol className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 text-sm dark:divide-neutral-800 dark:border-neutral-800">
              {Array.from({ length: slots.length / 2 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-10 text-xs font-medium text-neutral-500">
                    {STAGE_SHORT[stage]}
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {nameOf(slots![2 * i])} <span className="text-neutral-400">vs</span> {nameOf(slots![2 * i + 1])}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )
      )}

      <button className="btn btn-primary" disabled={!slots || busy} onClick={() => void generate()}>
        <Icon name="bracket" size={16} />
        {busy ? "Creating…" : "Create knockout stage"}
      </button>
    </div>
  );
}
