import type { StandingRow } from "./scoring/standings.ts";

export type QualTone = "in" | "out" | "level" | "eliminated" | "pending";

export interface Qualification {
  tone: QualTone;
  /** Short label for a badge. */
  label: string;
  /** One sentence explaining the position. */
  detail: string;
}

/**
 * Where a team stands against the qualification line.
 * `rows` must be the pool's ranked standings, `cut` the number of qualifying places.
 */
export function qualificationFor(row: StandingRow, rows: StandingRow[], cut: number): Qualification {
  const opponents = Math.max(0, rows.length - 1);
  const left = Math.max(0, opponents - row.played);
  const poolDone = rows.every((r) => r.played >= opponents);
  const places = `${cut} ${cut === 1 ? "place" : "places"}`;

  // Everyone sharing this rank occupies rank .. rank + k - 1.
  const group = rows.filter((r) => r.rank === row.rank).length;
  const straddles = row.rank <= cut && row.rank + group - 1 > cut;

  if (straddles && group > 1) {
    return {
      tone: "level",
      label: "Level at the line",
      detail: poolDone
        ? `Level with ${group - 1} other ${group === 2 ? "team" : "teams"} across the qualification line. A decider or a draw settles it.`
        : `Level with ${group - 1} other ${group === 2 ? "team" : "teams"} across the qualification line for now.`,
    };
  }

  if (row.rank <= cut) {
    return poolDone
      ? { tone: "in", label: "Qualified", detail: `Finished in a qualifying place (${places}).` }
      : {
          tone: "in",
          label: "In a qualifying place",
          detail: `Currently inside the top ${cut}. ${left} ${left === 1 ? "match" : "matches"} still to play.`,
        };
  }

  // Outside: how far behind the last qualifying team on wins.
  const lastIn = rows.filter((r) => r.rank <= cut).sort((a, b) => b.rank - a.rank)[0];
  const behind = lastIn ? Math.max(0, lastIn.won - row.won) : 0;

  if (poolDone || left === 0) {
    return { tone: "eliminated", label: "Not qualified", detail: `Finished outside the top ${cut}.` };
  }
  const reach = row.won + left;
  if (lastIn && reach < lastIn.won) {
    return {
      tone: "eliminated",
      label: "Cannot catch up",
      detail: `Even with ${left} ${left === 1 ? "win" : "wins"} left they cannot reach the top ${cut}.`,
    };
  }
  return {
    tone: "out",
    label: "Outside the line",
    detail:
      behind > 0
        ? `${behind} ${behind === 1 ? "win" : "wins"} behind the last qualifying place with ${left} ${left === 1 ? "match" : "matches"} to play.`
        : `Level on wins but ranked lower, with ${left} ${left === 1 ? "match" : "matches"} to play.`,
  };
}
