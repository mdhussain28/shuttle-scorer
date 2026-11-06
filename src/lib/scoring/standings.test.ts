import test from "node:test";
import assert from "node:assert/strict";
import { computeStandings } from "./standings.ts";
import type { StandingMatch } from "./standings.ts";

const m = (aId: string, bId: string, sets: Array<[number, number]>): StandingMatch => ({ aId, bId, sets });
const order = (rows: { id: string }[]) => rows.map((r) => r.id).join("");

test("ranks by matches won", () => {
  const rows = computeStandings(["A", "B", "C"], [
    m("A", "B", [[21, 10], [21, 10]]),
    m("A", "C", [[21, 10], [21, 10]]),
    m("B", "C", [[21, 10], [21, 10]]),
  ]);
  assert.equal(order(rows), "ABC");
  assert.deepEqual(rows.map((r) => r.matchPoints), [4, 2, 0]);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3]);
});

test("two-way tie is decided by head-to-head even if the loser has a better game difference", () => {
  const rows = computeStandings(["A", "B", "C", "D"], [
    m("A", "B", [[21, 19], [19, 21], [21, 18]]), // A beats B 2-1
    m("A", "D", [[21, 19], [19, 21], [21, 18]]), // A beats D 2-1
    m("C", "A", [[21, 10], [21, 10]]), // C beats A 2-0
    m("B", "C", [[21, 10], [21, 10]]), // B beats C 2-0
    m("B", "D", [[21, 10], [21, 10]]), // B beats D 2-0
    m("D", "C", [[21, 15], [21, 15]]), // D beats C 2-0
  ]);
  // A and B both have 2 wins; B has the better game difference but A won the match between them.
  // C and D both have 1 win; D beat C.
  assert.equal(order(rows), "ABDC");
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.ok(byId.B.setDiff > byId.A.setDiff);
});

test("three-way tie is decided by game difference", () => {
  const rows = computeStandings(["A", "B", "C"], [
    m("A", "B", [[21, 10], [21, 10]]), // A +2
    m("B", "C", [[21, 15], [15, 21], [21, 15]]), // B +1, C -1
    m("C", "A", [[21, 15], [15, 21], [21, 15]]), // C +1, A -1
  ]);
  // A: +2 -1 = +1, C: -1 +1 = 0, B: -2 +1 = -1
  assert.equal(order(rows), "ACB");
  assert.ok(rows.every((r) => !r.tied));
});

test("three-way tie with equal game difference falls to points difference", () => {
  const rows = computeStandings(["A", "B", "C"], [
    m("A", "B", [[21, 5], [21, 5]]),
    m("B", "C", [[21, 15], [21, 15]]),
    m("C", "A", [[21, 19], [21, 19]]),
  ]);
  // every team 1-1 in matches and 0 game difference; points decide
  // A: +32 -4 = +28, B: -32 +12 = -20, C: -12 +4 = -8
  assert.equal(order(rows), "ACB");
});

test("fully level teams share a rank and are flagged as tied", () => {
  const rows = computeStandings(["A", "B", "C"], [
    m("A", "B", [[21, 15], [21, 15]]),
    m("B", "C", [[21, 15], [21, 15]]),
    m("C", "A", [[21, 15], [21, 15]]),
  ]);
  assert.ok(rows.every((r) => r.rank === 1 && r.tied));
});

test("before any match every team is level at rank 1 with zero played", () => {
  const rows = computeStandings(["A", "B"], []);
  assert.ok(rows.every((r) => r.rank === 1 && r.played === 0));
});

test("matches outside the pool are ignored and pointsPerWin is configurable", () => {
  const rows = computeStandings(["A", "B"], [
    m("A", "B", [[21, 10], [21, 10]]),
    m("A", "X", [[21, 10], [21, 10]]),
  ], { pointsPerWin: 1 });
  assert.equal(rows[0].id, "A");
  assert.equal(rows[0].played, 1);
  assert.equal(rows[0].matchPoints, 1);
});

test("walkover winner override counts a win without sets", () => {
  const rows = computeStandings(["A", "B"], [{ aId: "A", bId: "B", sets: [], winner: "b" }]);
  assert.equal(rows[0].id, "B");
  assert.equal(rows[0].won, 1);
});
