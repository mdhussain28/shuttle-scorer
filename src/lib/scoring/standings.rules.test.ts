import test from "node:test";
import assert from "node:assert/strict";
import { computeStandings, computeStandingsDetailed, isPoolComplete, poolProgress } from "./standings.ts";
import type { StandingMatch } from "./standings.ts";

const m = (aId: string, bId: string, sets: Array<[number, number]>, decider = false): StandingMatch => ({
  aId, bId, sets, decider,
});
const win = (a: string, b: string, decider = false) => m(a, b, [[21, 10], [21, 10]], decider);
const order = (rows: { id: string }[]) => rows.map((r) => r.id).join("");

// Four teams: A and B both finish on 2 wins (A beat B), C and D both on 1 win (D beat C).
const fourTeamPool: StandingMatch[] = [
  m("A", "B", [[21, 19], [19, 21], [21, 18]]),
  m("A", "D", [[21, 19], [19, 21], [21, 18]]),
  m("C", "A", [[21, 10], [21, 10]]),
  m("B", "C", [[21, 10], [21, 10]]),
  m("B", "D", [[21, 10], [21, 10]]),
  m("D", "C", [[21, 15], [21, 15]]),
];
const ids4 = ["A", "B", "C", "D"];

test("two-way head-to-head (default) is unchanged", () => {
  assert.equal(order(computeStandings(ids4, fourTeamPool)), "ABDC");
  const explicit = computeStandings(ids4, fourTeamPool, { twoWay: "head_to_head" });
  assert.equal(order(explicit), "ABDC");
});

test("two-way decider: level teams stay tied and a decider is requested", () => {
  const { rows, pending } = computeStandingsDetailed(ids4, fourTeamPool, { twoWay: "decider" });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.ok(byId.A.tied && byId.B.tied && byId.C.tied && byId.D.tied);
  assert.equal(byId.A.rank, 1);
  assert.equal(byId.B.rank, 1);
  assert.equal(byId.C.rank, 3);
  assert.equal(pending.length, 2);
  assert.deepEqual(pending.map((p) => p.pairs[0].slice().sort().join("")).sort(), ["AB", "CD"]);
});

test("two-way decider: the decider result orders the teams, even against head-to-head", () => {
  const withDeciders = [...fourTeamPool, win("B", "A", true), win("C", "D", true)];
  const { rows, pending } = computeStandingsDetailed(ids4, withDeciders, { twoWay: "decider" });
  assert.equal(order(rows), "BACD");
  assert.equal(pending.length, 0);
  assert.ok(rows.every((r) => !r.tied));
});

test("decider matches never count in played, won, sets or points", () => {
  const withDeciders = [...fourTeamPool, win("B", "A", true)];
  const plain = computeStandings(ids4, fourTeamPool, { twoWay: "decider" });
  const after = computeStandings(ids4, withDeciders, { twoWay: "decider" });
  const strip = (rows: typeof plain) =>
    Object.fromEntries(rows.map((r) => [r.id, [r.played, r.won, r.lost, r.setsWon, r.pointsFor]]));
  assert.deepEqual(strip(after), strip(plain));
});

// Three teams, each beats one other: a three-way tie on wins.
const cycle: StandingMatch[] = [
  m("A", "B", [[21, 10], [21, 10]]),
  m("B", "C", [[21, 15], [15, 21], [21, 15]]),
  m("C", "A", [[21, 15], [15, 21], [21, 15]]),
];

test("three-way: set and points difference is the default (BWF)", () => {
  assert.equal(order(computeStandings(["A", "B", "C"], cycle)), "ACB");
  assert.equal(order(computeStandings(["A", "B", "C"], cycle, { multiWay: "set_point_diff" })), "ACB");
});

test("three-way decider league: all pairings are requested, then wins decide", () => {
  const first = computeStandingsDetailed(["A", "B", "C"], cycle, { multiWay: "decider" });
  assert.equal(first.pending.length, 1);
  assert.equal(first.pending[0].pairs.length, 3);
  assert.ok(first.rows.every((r) => r.tied && r.rank === 1));

  const partial = computeStandingsDetailed(["A", "B", "C"], [...cycle, win("A", "B", true)], { multiWay: "decider" });
  assert.equal(partial.pending[0].pairs.length, 2); // A-B played, two left

  const league = [...cycle, win("C", "A", true), win("C", "B", true), win("B", "A", true)];
  const done = computeStandingsDetailed(["A", "B", "C"], league, { multiWay: "decider" });
  assert.equal(order(done.rows), "CBA");
  assert.equal(done.pending.length, 0);
});

test("three-way decider league that is a cycle stays tied", () => {
  const league = [...cycle, win("A", "B", true), win("B", "C", true), win("C", "A", true)];
  const { rows } = computeStandingsDetailed(["A", "B", "C"], league, { multiWay: "decider" });
  assert.ok(rows.every((r) => r.tied && r.rank === 1));
});

test("pool progress and completion", () => {
  const ids = ["A", "B", "C"];
  assert.deepEqual(poolProgress(ids, []), { played: 0, total: 3 });
  assert.equal(isPoolComplete(ids, cycle.slice(0, 2)), false);
  assert.equal(isPoolComplete(ids, cycle), true);
  // deciders do not complete a pool
  assert.equal(isPoolComplete(ids, [win("A", "B", true), win("B", "C", true), win("A", "C", true)]), false);
  assert.equal(isPoolComplete(["A"], []), false);
});
