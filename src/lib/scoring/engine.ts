// Pure badminton match engine. No UI, no network, no browser APIs.
// A match is stored as a config plus an ordered list of events.
// The full state (scores, server, court positions) is rebuilt by replaying
// the events, which makes "undo" simply "drop the last event".

export type Side = "a" | "b";
export type MatchType = "singles" | "doubles";
export type Court = "right" | "left";
export type PlayerIndex = 0 | 1;

export interface MatchConfig {
  matchType: MatchType;
  /** Number of sets the match is played over: 1, 3 or 5. */
  bestOf: 1 | 3 | 5;
  /** Points needed to win a set (BWF standard: 21). */
  pointsToWin: number;
  /** Score at which the next point wins the set outright (BWF standard: 30). null = no cap. */
  cap: number | null;
  /** Side that serves first in the first set. */
  firstServer: Side;
  /** Doubles: index (0 or 1) of side A's player who starts in the RIGHT court. */
  aRight: PlayerIndex;
  /** Doubles: index (0 or 1) of side B's player who starts in the RIGHT court. */
  bRight: PlayerIndex;
}

export type MatchEvent =
  /** A rally was won by side `w`. */
  | { t: "r"; w: Side }
  /** The next set starts, with the chosen starting positions (doubles). */
  | { t: "n"; aRight: PlayerIndex; bRight: PlayerIndex };

export interface Role {
  side: Side;
  playerIndex: PlayerIndex;
  court: Court;
}

export type Notice = "interval" | "interval_change_ends" | null;

export interface MatchState {
  config: MatchConfig;
  phase: "in_set" | "between_sets" | "finished";
  /** 0-based index of the current (or just-finished) set. */
  setIndex: number;
  /** Score of the current set (or of the last set when between sets / finished). */
  scores: Record<Side, number>;
  setsWon: Record<Side, number>;
  completedSets: Array<[number, number]>;
  servingSide: Side;
  /** Doubles: which player index of each side is currently in the RIGHT court. */
  right: Record<Side, PlayerIndex>;
  server: Role;
  receiver: Role;
  /** True when side A defends the left end of the court as drawn on screen. */
  aOnLeft: boolean;
  intervalDone: boolean;
  notice: Notice;
  /** True if the next point by this side wins the current set. */
  setPoint: Record<Side, boolean>;
  /** True if the next point by this side wins the whole match. */
  matchPoint: Record<Side, boolean>;
  winner: Side | null;
}

export const other = (s: Side): Side => (s === "a" ? "b" : "a");
const flip = (i: PlayerIndex): PlayerIndex => (i === 0 ? 1 : 0);

export function setsToWin(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

/** Usual cap for a given set length: 21 -> 30 (BWF), 15 -> 21, 11 -> 15. */
export function defaultCap(points: number): number {
  const known: Record<number, number> = { 21: 30, 15: 21, 11: 15 };
  return known[points] ?? points + 9;
}

/** Score at which the mid-set interval happens (11 in a 21-point set). */
export function intervalAt(points: number): number {
  return Math.ceil(points / 2);
}

export function validateConfig(c: MatchConfig): string | null {
  if (![1, 3, 5].includes(c.bestOf)) return "Number of sets must be 1, 3 or 5.";
  if (!Number.isInteger(c.pointsToWin) || c.pointsToWin < 5 || c.pointsToWin > 50) {
    return "Points per set must be a whole number between 5 and 50.";
  }
  if (c.cap !== null && (!Number.isInteger(c.cap) || c.cap <= c.pointsToWin)) {
    return "The cap must be higher than the points per set (or switch the cap off).";
  }
  return null;
}

/** Who has won a set at this score, if anyone. */
export function setWinner(scores: Record<Side, number>, cfg: MatchConfig): Side | null {
  for (const x of ["a", "b"] as Side[]) {
    const y = other(x);
    if (cfg.cap !== null && scores[x] >= cfg.cap) return x;
    if (scores[x] >= cfg.pointsToWin && scores[x] - scores[y] >= 2) return x;
  }
  return null;
}

function wouldWinSet(scores: Record<Side, number>, side: Side, cfg: MatchConfig): boolean {
  const next = { ...scores, [side]: scores[side] + 1 } as Record<Side, number>;
  return setWinner(next, cfg) === side;
}

function computeRoles(s: MatchState): { server: Role; receiver: Role } {
  const srv = s.servingSide;
  const rcv = other(srv);
  // The server stands in the right court when their own score is even, left when odd.
  // The receiver stands in the diagonally opposite court, which carries the same label
  // from the receiver's own point of view.
  const court: Court = s.scores[srv] % 2 === 0 ? "right" : "left";
  const idx = (side: Side): PlayerIndex =>
    s.config.matchType === "singles" ? 0 : court === "right" ? s.right[side] : flip(s.right[side]);
  return {
    server: { side: srv, playerIndex: idx(srv), court },
    receiver: { side: rcv, playerIndex: idx(rcv), court },
  };
}

function refresh(s: MatchState): MatchState {
  const roles = computeRoles(s);
  s.server = roles.server;
  s.receiver = roles.receiver;
  const need = setsToWin(s.config.bestOf);
  const live = s.phase === "in_set";
  for (const x of ["a", "b"] as Side[]) {
    s.setPoint[x] = live && wouldWinSet(s.scores, x, s.config);
    s.matchPoint[x] = s.setPoint[x] && s.setsWon[x] + 1 >= need;
  }
  return s;
}

export function initialState(config: MatchConfig): MatchState {
  const s: MatchState = {
    config,
    phase: "in_set",
    setIndex: 0,
    scores: { a: 0, b: 0 },
    setsWon: { a: 0, b: 0 },
    completedSets: [],
    servingSide: config.firstServer,
    right: { a: config.aRight, b: config.bRight },
    server: { side: config.firstServer, playerIndex: 0, court: "right" },
    receiver: { side: other(config.firstServer), playerIndex: 0, court: "right" },
    aOnLeft: true,
    intervalDone: false,
    notice: null,
    setPoint: { a: false, b: false },
    matchPoint: { a: false, b: false },
    winner: null,
  };
  return refresh(s);
}

function clone(s: MatchState): MatchState {
  return {
    ...s,
    scores: { ...s.scores },
    setsWon: { ...s.setsWon },
    completedSets: s.completedSets.map((x) => [x[0], x[1]] as [number, number]),
    right: { ...s.right },
    setPoint: { ...s.setPoint },
    matchPoint: { ...s.matchPoint },
    server: { ...s.server },
    receiver: { ...s.receiver },
  };
}

export function applyEvent(prev: MatchState, ev: MatchEvent): MatchState {
  const s = clone(prev);
  s.notice = null;

  if (ev.t === "n") {
    if (s.phase !== "between_sets") throw new Error("A new set can only start between sets.");
    s.setIndex += 1;
    s.scores = { a: 0, b: 0 };
    s.right = { a: ev.aRight, b: ev.bRight };
    s.aOnLeft = !s.aOnLeft; // players change ends after every set
    s.phase = "in_set";
    s.intervalDone = false;
    // servingSide was already set to the winner of the previous set.
    return refresh(s);
  }

  if (s.phase !== "in_set") throw new Error("No rally can be played right now.");
  const w = ev.w;
  s.scores[w] += 1;

  if (w === s.servingSide) {
    // The serving side won the rally: the same server serves again from the other court,
    // so in doubles the two partners swap courts. Singles players do not "swap" in the data.
    if (s.config.matchType === "doubles") s.right[w] = flip(s.right[w]);
  } else {
    // The receiving side won the rally: they take over the serve. No one swaps courts.
    s.servingSide = w;
  }

  const lead = Math.max(s.scores.a, s.scores.b);
  if (!s.intervalDone && lead >= intervalAt(s.config.pointsToWin)) {
    s.intervalDone = true;
    const need = setsToWin(s.config.bestOf);
    const deciding = s.config.bestOf > 1 && s.setsWon.a === need - 1 && s.setsWon.b === need - 1;
    s.notice = deciding ? "interval_change_ends" : "interval";
    if (deciding) s.aOnLeft = !s.aOnLeft;
  }

  const sw = setWinner(s.scores, s.config);
  if (sw) {
    s.notice = null;
    s.setsWon[sw] += 1;
    s.completedSets.push([s.scores.a, s.scores.b]);
    if (s.setsWon[sw] >= setsToWin(s.config.bestOf)) {
      s.phase = "finished";
      s.winner = sw;
    } else {
      s.phase = "between_sets";
      s.servingSide = sw; // the winner of a set serves first in the next set
    }
  }
  return refresh(s);
}

export function replay(config: MatchConfig, events: MatchEvent[]): MatchState {
  let s = initialState(config);
  for (const ev of events) s = applyEvent(s, ev);
  return s;
}

export interface MatchSummary {
  setScores: Array<[number, number]>;
  setsA: number;
  setsB: number;
  pointsA: number;
  pointsB: number;
  finished: boolean;
  winner: Side | null;
}

/** Flattened numbers for storing in the database. Includes a set that is still in progress. */
export function summarize(s: MatchState): MatchSummary {
  const setScores = s.completedSets.map((x) => [x[0], x[1]] as [number, number]);
  if (s.phase === "in_set" && s.scores.a + s.scores.b > 0) setScores.push([s.scores.a, s.scores.b]);
  return {
    setScores,
    setsA: s.setsWon.a,
    setsB: s.setsWon.b,
    pointsA: setScores.reduce((n, x) => n + x[0], 0),
    pointsB: setScores.reduce((n, x) => n + x[1], 0),
    finished: s.phase === "finished",
    winner: s.winner,
  };
}
