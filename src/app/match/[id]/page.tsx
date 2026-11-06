"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { CourtView } from "@/components/CourtView";
import { getSupabase } from "@/lib/supabase";
import type { MatchRow } from "@/lib/types";
import { intervalAt, replay, summarize, type MatchEvent, type PlayerIndex, type Side } from "@/lib/scoring/engine";

type SaveState = "saved" | "saving" | "error";

function MatchContent({ id }: { id: string }) {
  const router = useRouter();
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [nextRight, setNextRight] = useState<{ a: PlayerIndex; b: PlayerIndex }>({ a: 0, b: 0 });

  const latest = useRef<MatchEvent[]>([]);
  const configRef = useRef<MatchRow["config"] | null>(null);
  const saving = useRef(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await getSupabase().from("matches").select("*").eq("id", id).maybeSingle();
      if (error) setLoadError(error.message);
      else if (!data) setLoadError("Match not found. It may have been deleted.");
      else {
        const row = data as MatchRow;
        setMatch(row);
        setEvents(row.events ?? []);
        latest.current = row.events ?? [];
        configRef.current = row.config;
      }
      setLoading(false);
    })();
  }, [id]);

  const state = useMemo(() => {
    if (!match) return null;
    try {
      return replay(match.config, events);
    } catch {
      return null;
    }
  }, [match, events]);

  // Writes the newest event list to the database, repeating until nothing newer is waiting.
  const flush = useCallback(async () => {
    if (saving.current || !configRef.current) return;
    saving.current = true;
    setSaveState("saving");
    try {
      let written: MatchEvent[] | null = null;
      while (written !== latest.current) {
        const snapshot: MatchEvent[] = latest.current;
        const sum = summarize(replay(configRef.current, snapshot));
        const { error } = await getSupabase()
          .from("matches")
          .update({
            events: snapshot,
            status: sum.finished ? "finished" : "live",
            winner: sum.winner,
            set_scores: sum.setScores,
            sets_a: sum.setsA,
            sets_b: sum.setsB,
            points_a: sum.pointsA,
            points_b: sum.pointsB,
            finished_at: sum.finished ? new Date().toISOString() : null,
          })
          .eq("id", id);
        if (error) throw error;
        written = snapshot;
      }
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      saving.current = false;
    }
  }, [id]);

  function push(ev: MatchEvent) {
    const cfg = configRef.current;
    if (!cfg) return;
    const next = [...latest.current, ev];
    try {
      replay(cfg, next); // rejects events that are not allowed right now
    } catch {
      return;
    }
    latest.current = next;
    setEvents(next);
    void flush();
  }

  function undo() {
    if (latest.current.length === 0) return;
    const next = latest.current.slice(0, -1);
    latest.current = next;
    setEvents(next);
    void flush();
  }

  // Keep the next-set court choice in step with the positions at the end of the last set.
  useEffect(() => {
    if (state?.phase === "between_sets") setNextRight({ a: state.right.a, b: state.right.b });
  }, [state?.phase, state?.setIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Retry unsaved changes as soon as the connection returns.
  useEffect(() => {
    const retry = () => void flush();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [flush]);

  useEffect(() => {
    if (saveState === "saved") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  // Keep the screen awake while scoring.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        /* not supported or denied */
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);

  async function deleteMatch() {
    if (!confirm("Delete this match and its score? This cannot be undone.")) return;
    const { error } = await getSupabase().from("matches").delete().eq("id", id);
    if (error) return setLoadError(error.message);
    router.replace(match?.tournament_id ? `/tournaments/${match.tournament_id}` : "/");
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (loadError) return <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{loadError}</p>;
  if (!match) return null;
  if (!state) return <p className="text-sm text-neutral-500">This match’s data could not be read.</p>;

  const cfg = match.config;
  const doubles = cfg.matchType === "doubles";
  const names: Record<Side, string[]> = { a: match.a_players, b: match.b_players };
  const labels: Record<Side, string> = { a: match.a_label, b: match.b_label };
  const inSet = state.phase === "in_set";
  const order: Side[] = state.aOnLeft ? ["a", "b"] : ["b", "a"];
  const lastSet = state.completedSets[state.completedSets.length - 1];
  const lastSetWinner: Side | null = lastSet ? (lastSet[0] > lastSet[1] ? "a" : "b") : null;

  const serverName = names[state.server.side][state.server.playerIndex];
  const receiverName = names[state.receiver.side][state.receiver.playerIndex];

  const renderSide = (side: Side) => {
    const serving = inSet && state.server.side === side;
    return (
      <div key={side} className={`card flex flex-col items-center gap-2 text-center ${serving ? "ring-2 ring-emerald-500" : ""}`}>
        <div className="flex max-w-full items-center gap-1 text-sm font-semibold">
          {serving && <span title="Serving">🏸</span>}
          <span className="truncate">{labels[side]}</span>
        </div>
        {doubles && <div className="max-w-full truncate text-xs text-neutral-500">{names[side].join(" & ")}</div>}
        <div className="text-7xl font-black leading-none tabular-nums sm:text-8xl">{state.scores[side]}</div>
        <div className="flex min-h-[1.5rem] items-center">
          {inSet && state.matchPoint[side] ? (
            <span className="chip bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Match point</span>
          ) : inSet && state.setPoint[side] ? (
            <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Set point</span>
          ) : null}
        </div>
        <button className="btn btn-primary w-full !py-4 text-lg" disabled={!inSet} onClick={() => push({ t: "r", w: side })}>
          +1
        </button>
      </div>
    );
  };

  const saveBadge =
    saveState === "saved" ? (
      <span className="text-emerald-600">Saved ✓</span>
    ) : saveState === "saving" ? (
      <span className="text-neutral-500">Saving…</span>
    ) : (
      <button className="font-semibold text-red-600" onClick={() => void flush()}>
        Not saved. Tap to retry
      </button>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs">
        {match.tournament_id ? (
          <Link href={`/tournaments/${match.tournament_id}`} className="font-medium text-emerald-600 hover:underline">
            ← Tournament
          </Link>
        ) : (
          <Link href="/" className="font-medium text-emerald-600 hover:underline">
            ← Home
          </Link>
        )}
        <span className="flex-1" />
        {saveBadge}
      </div>

      <div className="text-center text-sm text-neutral-500">
        Best of {cfg.bestOf} · {cfg.pointsToWin} points{cfg.cap ? `, cap ${cfg.cap}` : ", no cap"}
        {state.phase !== "finished" && <> · <span className="font-semibold text-neutral-800 dark:text-neutral-100">Set {state.setIndex + 1}</span></>}
      </div>

      <div className="flex items-center justify-center gap-3 text-sm">
        <span className="font-semibold">Sets</span>
        <span className="text-2xl font-black tabular-nums">
          {state.setsWon.a} – {state.setsWon.b}
        </span>
        {state.completedSets.map((s, i) => (
          <span key={i} className="chip bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {s[0]}-{s[1]}
          </span>
        ))}
      </div>

      {state.notice && (
        <div className="rounded-xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          ⏱ A player reached {intervalAt(cfg.pointsToWin)} points: 60-second interval
          {state.notice === "interval_change_ends" ? " and change ends." : "."}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">{order.map(renderSide)}</div>

      <div className="card space-y-3">
        <CourtView state={state} names={names} />
        {inSet && (
          <p className="text-center text-sm">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{serverName}</span> serves from the{" "}
            <span className="font-semibold">{state.server.court}</span> court to{" "}
            <span className="font-semibold text-amber-600 dark:text-amber-400">{receiverName}</span>
          </p>
        )}
      </div>

      {state.phase === "between_sets" && lastSetWinner && lastSet && (
        <div className="card space-y-3 border-emerald-500">
          <p className="font-semibold">
            Set {state.setIndex + 1} goes to {labels[lastSetWinner]} ({lastSet[0]}–{lastSet[1]})
          </p>
          <p className="text-sm text-neutral-500">
            Players change ends. {labels[state.servingSide]} serves first in the next set.
          </p>
          {doubles && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(["a", "b"] as Side[]).map((s) => (
                <div key={s}>
                  <label className="label">{labels[s]}: starts in right court</label>
                  <select
                    className="input"
                    value={nextRight[s]}
                    onChange={(e) => setNextRight({ ...nextRight, [s]: Number(e.target.value) as PlayerIndex })}
                  >
                    {[0, 1].map((i) => (
                      <option key={i} value={i}>
                        {names[s][i]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn-primary w-full" onClick={() => push({ t: "n", aRight: nextRight.a, bRight: nextRight.b })}>
            Start set {state.setIndex + 2}
          </button>
        </div>
      )}

      {state.phase === "finished" && state.winner && (
        <div className="card space-y-2 border-emerald-500 text-center">
          <p className="text-2xl">🏆</p>
          <p className="text-lg font-bold">{labels[state.winner]} wins</p>
          <p className="text-sm text-neutral-500">
            {state.setsWon.a}–{state.setsWon.b} in sets ({state.completedSets.map((s) => `${s[0]}-${s[1]}`).join(", ")})
          </p>
          <Link
            href={match.tournament_id ? `/tournaments/${match.tournament_id}` : "/"}
            className="btn btn-primary mt-2 w-full"
          >
            {match.tournament_id ? "Back to tournament" : "Back to home"}
          </Link>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button className="btn btn-secondary flex-1" disabled={events.length === 0} onClick={undo}>
          ↶ Undo last point
        </button>
        <button className="btn btn-ghost text-xs text-red-600" onClick={() => void deleteMatch()}>
          Delete match
        </button>
      </div>
    </div>
  );
}

export default function MatchPage() {
  const params = useParams<{ id: string }>();
  return (
    <Shell title="Match" back="/">
      <MatchContent id={params.id} />
    </Shell>
  );
}
