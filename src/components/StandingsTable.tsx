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
      <table className="w-full min-w-[440px] text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-1 pr-2 text-left font-medium">#</th>
            <th className="py-1 pr-2 text-left font-medium">Name</th>
            <th className="px-1 text-center font-medium">P</th>
            <th className="px-1 text-center font-medium">W</th>
            <th className="px-1 text-center font-medium">L</th>
            <th className="px-1 text-center font-medium">Sets</th>
            <th className="px-1 text-center font-medium">Pts +/-</th>
            <th className="pl-1 text-center font-medium">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const leader = !nothingPlayed && r.rank === 1 && !r.tied;
            return (
              <tr
                key={r.id}
                className={`border-t border-neutral-100 dark:border-neutral-800 ${
                  leader ? "bg-emerald-50 dark:bg-emerald-950/30" : ""
                }`}
              >
                <td className="py-2 pr-2 font-semibold">
                  {nothingPlayed ? "–" : `${r.rank}${r.tied ? "=" : ""}`}
                </td>
                <td className="max-w-[10rem] truncate py-2 pr-2 font-medium">{labels[r.id] ?? "?"}</td>
                <td className="px-1 text-center tabular-nums">{r.played}</td>
                <td className="px-1 text-center tabular-nums">{r.won}</td>
                <td className="px-1 text-center tabular-nums">{r.lost}</td>
                <td className="px-1 text-center tabular-nums">
                  {r.setsWon}-{r.setsLost}
                </td>
                <td className="px-1 text-center tabular-nums">
                  {r.pointDiff > 0 ? `+${r.pointDiff}` : r.pointDiff}
                </td>
                <td className="pl-1 text-center font-bold tabular-nums">{r.matchPoints}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.some((r) => r.tied && r.played > 0) && (
        <p className="mt-2 text-xs text-neutral-500">
          “=” means level on every tie-break; BWF settles this by drawing lots.
        </p>
      )}
    </div>
  );
}
