"use client";

import { Icon } from "@/components/Icon";
import type { StandingRow } from "@/lib/scoring/standings";

/** Points table with the qualification line drawn in. */
export function PublicStandings({
  rows,
  labels,
  cut,
  focusIds,
  qualified,
}: {
  rows: StandingRow[];
  labels: Record<string, string>;
  /** Number of qualifying places. */
  cut: number;
  /** Rows to spotlight, for example search results. */
  focusIds?: string[];
  /** When the knockout stage exists, the teams that actually qualified. */
  qualified?: Set<string>;
}) {
  if (rows.length === 0) return <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-neutral-500">
        <img src="/art/shuttle.svg" alt="" width={44} height={44} className="h-11 w-11 opacity-80" />
        No teams or players in this pool yet.
      </div>;

  const isIn = (r: StandingRow) => (qualified ? qualified.has(r.id) : r.rank <= cut);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="text-xs font-medium text-neutral-500">
            <th className="w-9 py-2 pl-3 text-left font-medium">#</th>
            <th className="py-2 text-left font-medium">Team / player</th>
            <th className="px-2 text-center font-medium">P</th>
            <th className="px-2 text-center font-medium">W</th>
            <th className="px-2 text-center font-medium">L</th>
            <th className="px-2 text-center font-medium">Sets</th>
            <th className="px-2 text-center font-medium">Pts +/-</th>
            <th className="pr-3 text-center font-medium">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const inside = isIn(r);
            const focus = focusIds?.includes(r.id);
            const lineAfter = !qualified && i === cut - 1 && i < rows.length - 1;
            return (
              <tr
                key={r.id}
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                className={`animate-rise border-t border-neutral-100 transition-colors dark:border-neutral-800 ${
                  focus
                    ? "bg-brand-50 ring-2 ring-inset ring-brand-400 dark:bg-brand-950/40"
                    : inside
                      ? "bg-green-50/70 dark:bg-green-950/20"
                      : ""
                } ${lineAfter ? "border-b-2 !border-b-green-500/60" : ""}`}
              >
                <td className="py-3 pl-3">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      inside
                        ? "bg-green-600 text-white"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                    }`}
                  >
                    {r.rank}
                    {r.tied ? "=" : ""}
                  </span>
                </td>
                <td className="py-3 font-semibold">
                  <span className="flex items-center gap-2">
                    <span className="truncate">{labels[r.id] ?? "?"}</span>
                    {inside && (
                      <span className="badge badge-green hidden sm:inline-flex">
                        <Icon name="check" size={11} />
                        {qualified ? "Qualified" : "In"}
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-2 text-center tabular-nums">{r.played}</td>
                <td className="px-2 text-center tabular-nums">{r.won}</td>
                <td className="px-2 text-center tabular-nums">{r.lost}</td>
                <td className="px-2 text-center tabular-nums">
                  {r.setsWon}-{r.setsLost}
                </td>
                <td className="px-2 text-center tabular-nums">{r.pointDiff > 0 ? `+${r.pointDiff}` : r.pointDiff}</td>
                <td className="pr-3 text-center font-bold tabular-nums">{r.matchPoints}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!qualified && rows.length > cut && (
        <p className="mt-2 flex items-center gap-2 px-3 text-xs text-neutral-500">
          <span className="h-0.5 w-6 rounded bg-green-500/60" />
          Qualification line: top {cut}
        </p>
      )}
    </div>
  );
}
