"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { CourtView } from "@/components/CourtView";
import { FlipNumber } from "@/components/FlipNumber";
import { Icon } from "@/components/Icon";
import { PublicShell, SkeletonList } from "@/components/PublicShell";
import type { MatchRow } from "@/lib/types";
import { STAGE_LABEL } from "@/lib/knockout";
import { intervalAt, replay, type Side } from "@/lib/scoring/engine";
import { getPublicSupabase } from "@/lib/supabase";
import { usePolling } from "@/lib/usePolling";

export default function WatchMatch() {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [missing, setMissing] = useState(false);
  const [crumb, setCrumb] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const sb = getPublicSupabase();
    const { data, error } = await sb.from("matches").select("*").eq("id", id).maybeSingle();
    if (error || !data) {
      setMissing(true);
      return;
    }
    const row = data as MatchRow;
    setMissing(false);
    setMatch(row);
    setUpdated(new Date());
    if (!crumb) {
      const parts: string[] = [];
      if (row.tournament_id) {
        const t = await sb.from("tournaments").select("name").eq("id", row.tournament_id).maybeSingle();
        if (t.data?.name) parts.push(t.data.name as string);
      }
      if (row.category_id) {
        const c = await sb.from("categories").select("name").eq("id", row.category_id).maybeSingle();
        if (c.data?.name) parts.push(c.data.name as string);
      }
      if (row.is_decider) parts.push("Decider");
      else if (row.stage) parts.push(row.stage === "final" || row.stage === "third" ? STAGE_LABEL[row.stage] : `${STAGE_LABEL[row.stage]} ${row.slot ?? ""}`.trim());
      setCrumb(parts.join(" · "));
    }
  }, [id, crumb]);

  // Live matches refresh quickly; finished ones rarely change.
  usePolling(load, match?.status === "finished" ? 20000 : 3000);

  const state = useMemo(() => {
    if (!match) return null;
    try {
      return replay(match.config, match.events ?? []);
    } catch {
      return null;
    }
  }, [match]);

  const back = match?.tournament_id ? { href: `/watch/t/${match.tournament_id}`, label: "Back to tournament" } : { href: "/watch", label: "Back to live scores" };

  if (missing) {
    return (
      <PublicShell title="Match" back={{ href: "/watch", label: "Back to live scores" }}>
        <div className="card mx-auto max-w-md space-y-3 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
            <Icon name="eye-off" size={20} />
          </span>
          <p className="font-semibold">This match is not available</p>
          <p className="text-sm text-neutral-500">It may be private, or it has been removed.</p>
          <Link href="/watch" className="btn btn-primary">
            See live scores
          </Link>
        </div>
      </PublicShell>
    );
  }

  if (!match || !state) {
    return (
      <PublicShell title="Match" back={{ href: "/watch", label: "Back to live scores" }}>
        <SkeletonList rows={3} />
      </PublicShell>
    );
  }

  const names: Record<Side, string[]> = { a: match.a_players, b: match.b_players };
  const labels: Record<Side, string> = { a: match.a_label, b: match.b_label };
  const doubles = match.config.matchType === "doubles";
  const inSet = state.phase === "in_set";
  const order: Side[] = state.aOnLeft ? ["a", "b"] : ["b", "a"];

  return (
    <PublicShell title={`${match.a_label} vs ${match.b_label}`} back={back}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span className="min-w-0 flex-1 truncate">{crumb}</span>
          {updated && <span>Updated {updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>}
        </div>

        <div className="space-y-4 rounded-3xl bg-gradient-to-b from-slate-900 to-brand-950 p-4 text-slate-100 shadow-lift sm:p-6">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-400">
            {match.status === "live" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-0.5 font-semibold text-red-300">
                <span className="live-dot" />
                Live
              </span>
            ) : (
              <span className="rounded-full bg-green-500/15 px-3 py-0.5 font-semibold text-green-300">Final</span>
            )}
            <span>Best of {match.config.bestOf}</span>
            <span>{match.config.pointsToWin} points</span>
            <span>{match.config.goldenPoint ? "Golden point" : match.config.cap ? `Cap ${match.config.cap}` : "No cap"}</span>
            {state.phase !== "finished" && <span className="font-semibold text-slate-100">Set {state.setIndex + 1}</span>}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Sets</span>
            <span className="text-2xl font-bold tabular-nums text-white">
              {state.setsWon.a} – {state.setsWon.b}
            </span>
            {state.completedSets.map((s, i) => (
              <span key={i} className="animate-slide rounded-full bg-slate-800 px-2.5 py-0.5 text-xs tabular-nums text-slate-300">
                {s[0]}-{s[1]}
              </span>
            ))}
          </div>

          {inSet && state.goldenPointNow && (
            <div className="flex animate-slide items-center justify-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-300">
              <Icon name="bolt" size={16} />
              Golden point: next point wins the set
            </div>
          )}
          {state.notice && (
            <div className="flex animate-slide items-center justify-center gap-2 rounded-xl bg-sky-500/15 px-4 py-2.5 text-sm font-medium text-sky-200">
              <Icon name="clock" size={16} />
              {intervalAt(match.config.pointsToWin)} points reached: 60-second interval
              {state.notice === "interval_change_ends" ? " and change ends." : "."}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {order.map((side) => {
              const serving = inSet && state.server.side === side;
              return (
                <div
                  key={side}
                  className={`flex flex-col items-center gap-3 rounded-2xl border p-4 text-center transition-all duration-300 ${
                    serving ? "border-green-500 bg-slate-800 shadow-lg shadow-green-500/10" : "border-slate-700 bg-slate-800/60"
                  }`}
                >
                  <div className="flex max-w-full items-center gap-1.5 text-sm font-semibold text-slate-100">
                    {serving && <Icon name="shuttle" size={14} className="shrink-0 text-green-400" />}
                    <span className="truncate">{labels[side]}</span>
                  </div>
                  {doubles && <div className="max-w-full truncate text-xs text-slate-400">{names[side].join(" & ")}</div>}
                  <FlipNumber value={state.scores[side]} className="text-7xl sm:text-8xl" />
                  <div className="flex min-h-[1.5rem] items-center">
                    {inSet && state.matchPoint[side] ? (
                      <span className="animate-slide rounded-full bg-red-500/20 px-3 py-0.5 text-xs font-semibold text-red-300 ring-1 ring-red-400/30">Match point</span>
                    ) : inSet && state.setPoint[side] ? (
                      <span className="animate-slide rounded-full bg-amber-500/20 px-3 py-0.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-400/30">Set point</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card space-y-3">
          <CourtView state={state} names={names} />
          {inSet && (
            <p className="text-center text-sm">
              <span className="font-semibold text-green-700 dark:text-green-400">{names[state.server.side][state.server.playerIndex]}</span> serves from the{" "}
              <span className="font-semibold">{state.server.court}</span> court to{" "}
              <span className="font-semibold text-amber-600 dark:text-amber-400">{names[state.receiver.side][state.receiver.playerIndex]}</span>
            </p>
          )}
        </div>

        {state.phase === "between_sets" && (
          <div className="card animate-rise text-center text-sm text-neutral-600 dark:text-neutral-300">
            Break between sets. The next set starts soon.
          </div>
        )}
        {state.phase === "finished" && state.winner && (
          <div className="card animate-rise space-y-2 !border-green-500 text-center">
            <img src="/art/trophy.svg" alt="" width={56} height={56} className="mx-auto h-14 w-14 animate-pop rounded-2xl" />
            <p className="text-lg font-bold">{labels[state.winner]} wins</p>
            <p className="text-sm text-neutral-500">
              {state.setsWon.a}–{state.setsWon.b} in sets ({state.completedSets.map((s) => `${s[0]}-${s[1]}`).join(", ")})
            </p>
          </div>
        )}
      </div>
    </PublicShell>
  );
}
