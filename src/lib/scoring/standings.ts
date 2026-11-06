// Pool (round-robin group) standings, following the BWF group ranking order:
//   1. Matches won.
//   2. If exactly two are still tied: the result of the match between them.
//   3. If three or more are tied: game (set) difference, then points difference.
//      Whenever a tie narrows down to exactly two, head-to-head is applied again.
//   4. Anything still level is shown as tied (BWF resolves these by drawing lots).
// Please confirm against the current BWF General Competition Regulations for your event.

export interface StandingMatch {
  aId: string;
  bId: string;
  /** Final set scores as [a, b] pairs. */
  sets: Array<[number, number]>;
  /** Optional override, e.g. walkover or retirement. Otherwise derived from the sets. */
  winner?: "a" | "b";
}

export interface StandingRow {
  id: string;
  played: number;
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  setDiff: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  /** Table points: wins x pointsPerWin. */
  matchPoints: number;
  rank: number;
  /** True when this row is level with another on every criterion (draw of lots needed). */
  tied: boolean;
}

export function computeStandings(
  ids: string[],
  matches: StandingMatch[],
  opts: { pointsPerWin?: number } = {},
): StandingRow[] {
  const pointsPerWin = opts.pointsPerWin ?? 2;
  const rows = new Map<string, StandingRow>();
  for (const id of ids) {
    rows.set(id, {
      id, played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, setDiff: 0,
      pointsFor: 0, pointsAgainst: 0, pointDiff: 0, matchPoints: 0, rank: 1, tied: false,
    });
  }

  // head-to-head wins: key "x>y" counts matches x won against y
  const h2h = new Map<string, number>();

  for (const m of matches) {
    const ra = rows.get(m.aId);
    const rb = rows.get(m.bId);
    if (!ra || !rb || m.aId === m.bId) continue;

    let setsA = 0;
    let setsB = 0;
    let ptsA = 0;
    let ptsB = 0;
    for (const [x, y] of m.sets) {
      ptsA += x;
      ptsB += y;
      if (x > y) setsA++;
      else if (y > x) setsB++;
    }
    const winner = m.winner ?? (setsA > setsB ? "a" : setsB > setsA ? "b" : null);
    if (!winner) continue;

    ra.played++; rb.played++;
    ra.setsWon += setsA; ra.setsLost += setsB;
    rb.setsWon += setsB; rb.setsLost += setsA;
    ra.pointsFor += ptsA; ra.pointsAgainst += ptsB;
    rb.pointsFor += ptsB; rb.pointsAgainst += ptsA;
    const [w, l] = winner === "a" ? [ra, rb] : [rb, ra];
    w.won++; l.lost++;
    h2h.set(`${w.id}>${l.id}`, (h2h.get(`${w.id}>${l.id}`) ?? 0) + 1);
  }

  for (const r of rows.values()) {
    r.setDiff = r.setsWon - r.setsLost;
    r.pointDiff = r.pointsFor - r.pointsAgainst;
    r.matchPoints = r.won * pointsPerWin;
  }

  const headToHeadWinner = (x: string, y: string): string | null => {
    const xw = h2h.get(`${x}>${y}`) ?? 0;
    const yw = h2h.get(`${y}>${x}`) ?? 0;
    if (xw > yw) return x;
    if (yw > xw) return y;
    return null;
  };

  type Criterion = (r: StandingRow) => number;
  const criteria: Criterion[] = [(r) => r.won, (r) => r.setDiff, (r) => r.pointDiff];

  function resolve(group: string[], crits: Criterion[]): string[][] {
    if (group.length === 1) return [group];
    if (group.length === 2) {
      const w = headToHeadWinner(group[0], group[1]);
      if (w) return [[w], [w === group[0] ? group[1] : group[0]]];
    }
    if (crits.length === 0) return [group]; // still level: draw of lots
    const [c, ...rest] = crits;
    const sorted = [...group].sort((x, y) => c(rows.get(y)!) - c(rows.get(x)!));
    const parts: string[][] = [];
    for (const id of sorted) {
      const last = parts[parts.length - 1];
      if (last && c(rows.get(last[0])!) === c(rows.get(id)!)) last.push(id);
      else parts.push([id]);
    }
    return parts.flatMap((p) => resolve(p, rest));
  }

  const ordered = resolve([...ids], criteria);
  const result: StandingRow[] = [];
  let position = 0;
  for (const g of ordered) {
    for (const id of g) {
      const r = rows.get(id)!;
      r.rank = position + 1;
      r.tied = g.length > 1;
      result.push(r);
    }
    position += g.length;
  }
  return result;
}
