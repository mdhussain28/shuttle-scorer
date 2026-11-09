"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import {
  STAGE_LABEL, STAGE_ORDER, STAGE_SHORT, buildFixtures, podium, type KnockoutConfig, type PlayedTie,
} from "@/lib/knockout";

export interface BracketInfo {
  setsA: number;
  setsB: number;
  line: string;
}

/** Read-only knockout bracket. */
export function PublicBracket({
  config,
  ties,
  labels,
  info,
}: {
  config: KnockoutConfig;
  ties: PlayedTie[];
  labels: Record<string, string>;
  info: Record<string, BracketInfo>;
}) {
  const fixtures = buildFixtures(config, ties);
  const stages = STAGE_ORDER.filter((s) => fixtures.some((f) => f.stage === s));
  const pod = podium(fixtures);

  return (
    <div className="space-y-5">
      {pod.champion && (
        <div className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 dark:border-amber-900 dark:from-amber-950/30 dark:to-yellow-950/20">
          <img src="/art/trophy.svg" alt="" width={48} height={48} className="h-12 w-12 animate-pop rounded-2xl" />
          <div className="min-w-0 text-sm">
            <p className="font-bold">Champion: {labels[pod.champion] ?? "?"}</p>
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
              .map((f) => {
                const t = f.matchId ? info[f.matchId] : null;
                const side = (which: "a" | "b") => {
                  const id = which === "a" ? f.aId : f.bId;
                  const from = which === "a" ? f.aFrom : f.bFrom;
                  const won = Boolean(id) && f.winnerId === id;
                  const sets = t ? (which === "a" ? t.setsA : t.setsB) : null;
                  return (
                    <div className={`flex items-center gap-2 px-3 py-2.5 text-sm ${won ? "font-bold" : ""} ${Boolean(id) && f.loserId === id ? "text-neutral-400" : ""}`}>
                      <span className="min-w-0 flex-1 truncate">
                        {id ? (labels[id] ?? "?") : <span className="italic text-neutral-400">{f.bye ? "Bye" : (from ?? "To be decided")}</span>}
                      </span>
                      {won && <Icon name="check" size={14} className="text-green-600" />}
                      {sets !== null && <span className="w-4 text-right tabular-nums">{sets}</span>}
                    </div>
                  );
                };
                const body = (
                  <>
                    <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
                      <span>{s === "final" || s === "third" ? STAGE_LABEL[s] : `${STAGE_SHORT[s]}${f.slot}`}</span>
                      {f.status === "live" && (
                        <span className="badge badge-red">
                          <span className="live-dot" />
                          Live
                        </span>
                      )}
                      {f.bye && <span>Advances automatically</span>}
                    </div>
                    {side("a")}
                    <div className="border-t border-neutral-100 dark:border-neutral-800/70" />
                    {side("b")}
                    {t && f.status === "finished" && t.line && (
                      <p className="border-t border-neutral-100 px-3 py-1.5 text-xs text-neutral-500 dark:border-neutral-800/70">{t.line}</p>
                    )}
                  </>
                );
                const cls = "block overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-soft dark:border-neutral-800 dark:bg-neutral-900";
                return f.matchId ? (
                  <Link key={`${f.stage}${f.slot}`} href={`/watch/m/${f.matchId}`} className={`${cls} transition hover:-translate-y-0.5 hover:shadow-lift`}>
                    {body}
                  </Link>
                ) : (
                  <div key={`${f.stage}${f.slot}`} className={cls}>
                    {body}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
