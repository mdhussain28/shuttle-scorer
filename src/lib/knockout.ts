// Knockout stage logic: seeding the pool qualifiers into a bracket, and following
// match results through it. Pure functions, no UI and no database.
//
// Seeding: every pool winner is seeded first, then every runner-up, and so on, and the
// seeds are placed in a standard bracket (1 v 8, 4 v 5, 2 v 7, 3 v 6). With two pools this
// gives the usual cross-over: Group A winner v Group B runner-up, Group B winner v
// Group A runner-up. Teams from the same pool are kept apart in round one wherever possible.

export type Stage = "qf" | "sf" | "final" | "third";

export const STAGE_LABEL: Record<Stage, string> = {
  qf: "Quarter-final",
  sf: "Semi-final",
  final: "Final",
  third: "Third place",
};
export const STAGE_SHORT: Record<Stage, string> = { qf: "QF", sf: "SF", final: "Final", third: "3rd place" };
export const STAGE_ORDER: Stage[] = ["qf", "sf", "final", "third"];

export interface KnockoutConfig {
  stage: "qf" | "sf";
  /** Bracket positions in playing order: slots[0] v slots[1] is match 1, slots[2] v slots[3] match 2... null = bye. */
  slots: Array<string | null>;
  thirdPlace: boolean;
}

export const stageSize = (stage: "qf" | "sf"): number => (stage === "qf" ? 8 : 4);

/** Seed numbers in bracket order. 4 -> [1,4,2,3]; 8 -> [1,8,4,5,2,7,3,6]. */
export function bracketOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

/** Null when the number of qualifying teams fits the stage, otherwise a message to show. */
export function validateQualifiers(total: number, stage: "qf" | "sf"): string | null {
  const size = stageSize(stage);
  const name = stage === "qf" ? "quarter-finals" : "semi-finals";
  if (total > size) {
    return `${total} teams would qualify but the ${name} have ${size} places. Reduce the number advancing from each pool.`;
  }
  if (total <= size / 2) {
    return `Only ${total} teams would qualify, which is too few for the ${name}. Increase the number advancing from each pool or choose an earlier round.`;
  }
  return null;
}

interface Seeded {
  id: string;
  pool: number;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([item, ...p]);
  });
  return out;
}

/**
 * Places qualifiers into bracket slots.
 * `pools[i]` lists pool i's team ids in finishing order; the first `perPool` of each qualify.
 * Free places (fewer qualifiers than slots) become byes for the top seeds.
 */
export function buildSlots(pools: string[][], perPool: number, size: number): Array<string | null> {
  const tiers: Seeded[][] = [];
  for (let p = 0; p < perPool; p++) {
    const tier: Seeded[] = [];
    pools.forEach((ids, pool) => {
      if (ids[p] !== undefined) tier.push({ id: ids[p], pool });
    });
    tiers.push(tier);
  }
  const flat = tiers.flat();
  if (flat.length > size) throw new Error("More qualifiers than bracket places.");

  const seeds: Array<Seeded | null> = [...flat];
  while (seeds.length < size) seeds.push(null);

  const order = bracketOrder(size);
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < size; i += 2) pairs.push([order[i] - 1, order[i + 1] - 1]);
  const clashes = (list: Array<Seeded | null>): number =>
    pairs.reduce((n, [x, y]) => {
      const a = list[x];
      const b = list[y];
      return n + (a && b && a.pool === b.pool ? 1 : 0);
    }, 0);

  // Winners keep their seeds. Each later tier is reordered to avoid same-pool first-round matches.
  let start = tiers[0]?.length ?? 0;
  for (let t = 1; t < tiers.length; t++) {
    const tier = tiers[t];
    if (tier.length > 1 && tier.length <= 6) {
      let best = tier;
      let bestScore = Infinity;
      for (const perm of permutations(tier)) {
        const trial = [...seeds];
        perm.forEach((s, i) => {
          trial[start + i] = s;
        });
        const score = clashes(trial);
        if (score < bestScore) {
          bestScore = score;
          best = perm;
        }
      }
      best.forEach((s, i) => {
        seeds[start + i] = s;
      });
    }
    start += tier.length;
  }
  return order.map((seed) => seeds[seed - 1]?.id ?? null);
}

/** A knockout match that has been created (live or finished). */
export interface PlayedTie {
  stage: Stage;
  slot: number;
  matchId: string;
  status: "live" | "finished";
  aId: string | null;
  bId: string | null;
  winner: "a" | "b" | null;
}

export interface Fixture {
  stage: Stage;
  /** 1-based position within the stage. */
  slot: number;
  aId: string | null;
  bId: string | null;
  /** Shown while a side is not known yet, e.g. "Winner QF1". */
  aFrom: string | null;
  bFrom: string | null;
  matchId: string | null;
  status: "live" | "finished" | null;
  winnerId: string | null;
  loserId: string | null;
  bye: boolean;
}

const tag = (f: Fixture): string => `${STAGE_SHORT[f.stage]}${f.slot}`;

function makeFixture(
  played: PlayedTie[],
  stage: Stage,
  slot: number,
  aId: string | null,
  bId: string | null,
  aFrom: string | null,
  bFrom: string | null,
  firstRound: boolean,
): Fixture {
  const p = played.find((x) => x.stage === stage && x.slot === slot) ?? null;
  let winnerId: string | null = null;
  let loserId: string | null = null;
  let bye = false;
  if (firstRound && (aId === null) !== (bId === null)) {
    bye = true;
    winnerId = aId ?? bId;
  } else if (p && p.status === "finished" && p.winner) {
    winnerId = p.winner === "a" ? p.aId : p.bId;
    loserId = p.winner === "a" ? p.bId : p.aId;
  }
  return {
    stage, slot, aId, bId, aFrom, bFrom,
    matchId: p?.matchId ?? null,
    status: p?.status ?? null,
    winnerId, loserId, bye,
  };
}

/** Every fixture of the knockout, with participants filled in from results played so far. */
export function buildFixtures(cfg: KnockoutConfig, played: PlayedTie[]): Fixture[] {
  const out: Fixture[] = [];
  const count = cfg.slots.length / 2;

  let current: Fixture[] = [];
  for (let i = 0; i < count; i++) {
    current.push(
      makeFixture(played, cfg.stage, i + 1, cfg.slots[2 * i] ?? null, cfg.slots[2 * i + 1] ?? null, null, null, true),
    );
  }
  out.push(...current);

  let semis: Fixture[] | null = cfg.stage === "sf" ? current : null;
  const chain: Stage[] = cfg.stage === "qf" ? ["sf", "final"] : ["final"];
  for (const st of chain) {
    const next: Fixture[] = [];
    for (let j = 0; j < current.length / 2; j++) {
      const fa = current[2 * j];
      const fb = current[2 * j + 1];
      next.push(makeFixture(played, st, j + 1, fa.winnerId, fb.winnerId, `Winner ${tag(fa)}`, `Winner ${tag(fb)}`, false));
    }
    out.push(...next);
    if (st === "sf") semis = next;
    current = next;
  }

  if (cfg.thirdPlace && semis && semis.length === 2) {
    out.push(
      makeFixture(played, "third", 1, semis[0].loserId, semis[1].loserId, `Loser ${tag(semis[0])}`, `Loser ${tag(semis[1])}`, false),
    );
  }
  return out;
}

export function podium(fixtures: Fixture[]): { champion: string | null; runnerUp: string | null; third: string | null } {
  const final = fixtures.find((f) => f.stage === "final");
  const third = fixtures.find((f) => f.stage === "third");
  return {
    champion: final?.winnerId ?? null,
    runnerUp: final?.loserId ?? null,
    third: third?.winnerId ?? null,
  };
}
