import { replay, type MatchConfig, type MatchEvent, type Side } from "@/lib/scoring/engine";

export interface LiveSnap {
  a: number;
  b: number;
  /** 1-based number of the set being played. */
  setNo: number;
  setsA: number;
  setsB: number;
  serving: Side | null;
  finished: boolean;
}

/** Current score of a match rebuilt from its event log. Null when the data cannot be read. */
export function liveSnapshot(config: MatchConfig, events: MatchEvent[]): LiveSnap | null {
  try {
    const s = replay(config, events);
    return {
      a: s.scores.a,
      b: s.scores.b,
      setNo: s.setIndex + 1,
      setsA: s.setsWon.a,
      setsB: s.setsWon.b,
      serving: s.phase === "in_set" ? s.servingSide : null,
      finished: s.phase === "finished",
    };
  } catch {
    return null;
  }
}
