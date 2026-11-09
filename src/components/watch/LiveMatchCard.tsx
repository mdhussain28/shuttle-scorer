"use client";

import Link from "next/link";
import { FlipNumber } from "@/components/FlipNumber";
import { Icon } from "@/components/Icon";
import type { LiveSnap } from "@/lib/liveScore";

export interface CardMatch {
  id: string;
  aLabel: string;
  bLabel: string;
  setsA: number;
  setsB: number;
  status: "live" | "finished";
  setScores: Array<[number, number]>;
  snap: LiveSnap | null;
}

/** A match with its score. Live matches show flip-card points and who is serving. */
export function LiveMatchCard({ m, context }: { m: CardMatch; context?: string }) {
  const live = m.status === "live";
  const row = (label: string, sets: number, points: number | null, serving: boolean, winner: boolean) => (
    <div className="flex items-center gap-3">
      <span className="flex h-5 w-5 items-center justify-center">
        {serving && <Icon name="shuttle" size={15} className="text-green-500" />}
      </span>
      <span className={`min-w-0 flex-1 truncate text-sm ${winner ? "font-bold" : "font-medium"}`}>{label}</span>
      <span className="w-6 text-center text-sm font-semibold tabular-nums text-neutral-500">{sets}</span>
      {points !== null && <FlipNumber value={points} className="text-3xl text-white" />}
    </div>
  );

  const finalWinner = !live ? (m.setsA > m.setsB ? "a" : m.setsB > m.setsA ? "b" : null) : null;

  return (
    <Link href={`/watch/m/${m.id}`} className="card group block space-y-3 !p-4">
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        {live ? (
          <span className="badge badge-red">
            <span className="live-dot" />
            Live{m.snap ? ` · Set ${m.snap.setNo}` : ""}
          </span>
        ) : (
          <span className="badge badge-green">Final</span>
        )}
        <span className="min-w-0 flex-1 truncate">{context}</span>
        <Icon name="chevron-right" size={16} className="text-neutral-300 transition group-hover:translate-x-1" />
      </div>
      <div className="space-y-2">
        {row(m.aLabel, m.setsA, live && m.snap ? m.snap.a : null, m.snap?.serving === "a", finalWinner === "a")}
        {row(m.bLabel, m.setsB, live && m.snap ? m.snap.b : null, m.snap?.serving === "b", finalWinner === "b")}
      </div>
      {!live && m.setScores.length > 0 && (
        <p className="text-xs tabular-nums text-neutral-500">{m.setScores.map((s) => `${s[0]}-${s[1]}`).join(" · ")}</p>
      )}
    </Link>
  );
}
