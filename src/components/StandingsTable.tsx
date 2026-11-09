import type { StandingRow } from "@/lib/scoring/standings";

export function StandingsTable({
  rows,
  labels,
}: {
  rows: StandingRow[];
  labels: Record<string, string>;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">No teams or players in this pool yet.</p>;
  }
  const nothingPlayed = rows.every((r) => r.played === 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs font-medium text-neutral-500 dark:border-neutral-800">
            <th className="w-8 py-2 pr-2 text-left font-medium">#</th>
            <th className="py-2 pr-2 text-left font-medium">Team / player</th>
            <th className="px-1.5 text-center font-medium">P</th>
            <th className="px-1.5 text-center font-medium">W</th>
            <th className="px-1.5 text-center font-medium">L</th>
            <th className="px-1.5 text-center font-medium">Sets</th>
            <th className="px-1.5 text-center font-medium">Pts +/-</th>
            <th className="pl-1.5 text-center font-medium">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const leader = !nothingPlayed && r.rank === 1 && !r.tied;
            return (
              <tr
                key={r.id}
                className={`border-b border-neutral-100 last:border-0 dark:border-neutral-800/70 ${
                  leader ? "bg-green-50/70 dark:bg-green-950/20" : ""
                }`}
              >
                <td className="py-2.5 pr-2 font-semibold tabular-nums">
                  {nothingPlayed ? "–" : `${r.rank}${r.tied ? "=" : ""}`}
                </td>
                <td className="max-w-[11rem] truncate py-2.5 pr-2 font-medium">{labels[r.id] ?? "?"}</td>
                <td className="px-1.5 text-center tabular-nums">{r.played}</td>
                <td className="px-1.5 text-center tabular-nums">{r.won}</td>
                <td className="px-1.5 text-center tabular-nums">{r.lost}</td>
                <td className="px-1.5 text-center tabular-nums">
                  {r.setsWon}-{r.setsLost}
                </td>
                <td className="px-1.5 text-center tabular-nums">
                  {r.pointDiff > 0 ? `+${r.pointDiff}` : r.pointDiff}
                </td>
                <td className="pl-1.5 text-center font-semibold tabular-nums">{r.matchPoints}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.some((r) => r.tied && r.played > 0) && (
        <p className="mt-2 text-xs text-neutral-500">
          “=” means level on every ranking rule in use. Settle it with a decider match or by drawing lots.
        </p>
      )}
    </div>
  );
}
