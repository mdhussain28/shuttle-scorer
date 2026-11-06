// Pool (round-robin group) standings with selectable tie-break rules.
//
// Order of finish:
//   1. Matches won.
//   2. Teams level on wins are separated by the rules the organiser chose:
//        exactly two tied  -> "head_to_head": the result of the match between them (BWF)
//                             "decider":      a separate decider match between the two
//        three or more     -> "set_point_diff": set difference, then points difference (BWF);
//                             whenever the tie narrows to two, the two-team rule applies again
//                             "decider": a mini league of decider matches among the tied teams
//   3. Anything still level is flagged as tied (BWF settles this by drawing lots).
//
// Decider matches never count towards played / won / lost / sets / points in the table.
// They are only used to separate teams that are level.

export type TwoWayRule = "head_to_head" | "decider";
export type MultiWayRule = "set_point_diff" | "decider";

export interface StandingMatch {
  aId: string;
  bId: string;
  /** Final set scores as [a, b] pairs. */
  sets: Array<[number, number]>;
  /** Optional override, e.g. walkover or retirement. Otherwise derived from the sets. */
  winner?: "a" | "b";
  /** True for a decider (tie-break) match. */
  decider?: boolean;
}

export interface StandingOptions {
  /** Table points per match win (default 2). Does not change the order. */
  pointsPerWin?: number;
  twoWay?: TwoWayRule;
  multiWay?: MultiWayRule;
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
  /** True when this row is level with another on every rule in use. */
  tied: boolean;
}

/** A group of level teams that still needs decider matches, and which pairings are missing. */
export interface PendingDecider {
  ids: string[];
  pairs: Array<[string, string]>;
}

export interface StandingResult {
  rows: StandingRow[];
  pending: PendingDecider[];
}

function partition(sorted: string[], key: (id: string) => number): string[][] {
  const parts: string[][] = [];
  for (const id of sorted) {
    const last = parts[parts.length - 1];
    if (last && key(last[0]) === key(id)) last.push(id);
    else parts.push([id]);
  }
  return parts;
}

function pairsOf(group: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) out.push([group[i], group[j]]);
  return out;
}

export function computeStandingsDetailed(
  ids: string[],
  matches: StandingMatch[],
  opts: StandingOptions = {},
): StandingResult {
  const pointsPerWin = opts.pointsPerWin ?? 2;
  const twoWay: TwoWayRule = opts.twoWay ?? "head_to_head";
  const multiWay: MultiWayRule = opts.multiWay ?? "set_point_diff";

  const rows = new Map<string, StandingRow>();
  for (const id of ids) {
    rows.set(id, {
      id, played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, setDiff: 0,
      pointsFor: 0, pointsAgainst: 0, pointDiff: 0, matchPoints: 0, rank: 1, tied: false,
    });
  }

  // "x>y" -> number of matches x won against y
  const regularWins = new Map<string, number>();
  const deciderWins = new Map<string, number>();

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
    const [w, l] = winner === "a" ? [ra, rb] : [rb, ra];
    const key = `${w.id}>${l.id}`;

    if (m.decider) {
      deciderWins.set(key, (deciderWins.get(key) ?? 0) + 1);
      continue;
    }

    ra.played++; rb.played++;
    ra.setsWon += setsA; ra.setsLost += setsB;
    rb.setsWon += setsB; rb.setsLost += setsA;
    ra.pointsFor += ptsA; ra.pointsAgainst += ptsB;
    rb.pointsFor += ptsB; rb.pointsAgainst += ptsA;
    w.won++; l.lost++;
    regularWins.set(key, (regularWins.get(key) ?? 0) + 1);
  }

  for (const r of rows.values()) {
    r.setDiff = r.setsWon - r.setsLost;
    r.pointDiff = r.pointsFor - r.pointsAgainst;
    r.matchPoints = r.won * pointsPerWin;
  }

  const winnerOf = (book: Map<string, number>, x: string, y: string): string | null => {
    const xw = book.get(`${x}>${y}`) ?? 0;
    const yw = book.get(`${y}>${x}`) ?? 0;
    if (xw > yw) return x;
    if (yw > xw) return y;
    return null;
  };

  const pending: PendingDecider[] = [];
  type Key = (id: string) => number;
  const bySetDiff: Key = (id) => rows.get(id)!.setDiff;
  const byPointDiff: Key = (id) => rows.get(id)!.pointDiff;

  function resolveByDiff(group: string[], crits: Key[]): string[][] {
    if (crits.length === 0) return [group];
    const [c, ...rest] = crits;
    const sorted = [...group].sort((x, y) => c(y) - c(x));
    return partition(sorted, c).flatMap((p) =>
      p.length === 1 ? [p] : p.length === 2 ? resolvePair(p, rest) : resolveByDiff(p, rest),
    );
  }

  // Two teams level. `remaining` are the BWF criteria still to use if no direct result exists.
  function resolvePair(pair: string[], remaining: Key[]): string[][] {
    const [x, y] = pair;
    const w = winnerOf(twoWay === "decider" ? deciderWins : regularWins, x, y);
    if (w) return [[w], [w === x ? y : x]];
    if (twoWay === "decider") {
      pending.push({ ids: [x, y], pairs: [[x, y]] });
      return [pair];
    }
    return resolveByDiff(pair, remaining); // head-to-head not played: fall back to the BWF order
  }

  // Three or more level, decider mode: everyone plays a decider against each other.
  function resolveDeciderLeague(group: string[]): string[][] {
    const missing = pairsOf(group).filter(([x, y]) => !winnerOf(deciderWins, x, y));
    if (missing.length > 0) {
      pending.push({ ids: group, pairs: missing });
      return [group];
    }
    const leagueWins: Key = (id) =>
      group.reduce((n, o) => (o !== id && winnerOf(deciderWins, id, o) === id ? n + 1 : n), 0);
    const sorted = [...group].sort((x, y) => leagueWins(y) - leagueWins(x));
    return partition(sorted, leagueWins).flatMap((p) =>
      p.length === 1 ? [p] : p.length === 2 ? resolvePair(p, []) : [p],
    );
  }

  function resolveByWins(group: string[]): string[][] {
    if (group.length === 1) return [group];
    if (group.length === 2) return resolvePair(group, [bySetDiff, byPointDiff]);
    if (multiWay === "decider") return resolveDeciderLeague(group);
    return resolveByDiff(group, [bySetDiff, byPointDiff]);
  }

  const wins: Key = (id) => rows.get(id)!.won;
  const sortedByWins = [...ids].sort((x, y) => wins(y) - wins(x));
  const ordered = partition(sortedByWins, wins).flatMap(resolveByWins);

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
  return { rows: result, pending };
}

export function computeStandings(
  ids: string[],
  matches: StandingMatch[],
  opts: StandingOptions = {},
): StandingRow[] {
  return computeStandingsDetailed(ids, matches, opts).rows;
}

/** How many of the pool's regular (non-decider) matches have been played. */
export function poolProgress(ids: string[], matches: StandingMatch[]): { played: number; total: number } {
  const seen = new Set<string>();
  for (const m of matches) {
    if (m.decider) continue;
    seen.add(`${m.aId}|${m.bId}`);
    seen.add(`${m.bId}|${m.aId}`);
  }
  const pairs = pairsOf(ids);
  return { played: pairs.filter(([x, y]) => seen.has(`${x}|${y}`)).length, total: pairs.length };
}

/** True when every pair in the pool has played its regular match. */
export function isPoolComplete(ids: string[], matches: StandingMatch[]): boolean {
  if (ids.length < 2) return false;
  const p = poolProgress(ids, matches);
  return p.played === p.total;
}
