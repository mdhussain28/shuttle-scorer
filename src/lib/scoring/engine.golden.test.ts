import test from "node:test";
import assert from "node:assert/strict";
import { applyEvent, initialState, replay, setWinner, validateConfig } from "./engine.ts";
import type { MatchConfig, MatchEvent, Side } from "./engine.ts";

const golden = (over: Partial<MatchConfig> = {}): MatchConfig => ({
  matchType: "singles", bestOf: 3, pointsToWin: 21, cap: 30,
  firstServer: "a", aRight: 0, bRight: 0, goldenPoint: true, ...over,
});
const rallies = (seq: string): MatchEvent[] =>
  seq.split("").map((c) => ({ t: "r", w: c as Side }));

test("golden point: the first to 21 wins, even from 20-20, with no 2 point lead", () => {
  const cfg = golden();
  const level = rallies("ab".repeat(20)); // 20-20
  let s = replay(cfg, level);
  assert.equal(s.phase, "in_set");
  assert.equal(s.goldenPointNow, true);
  assert.deepEqual(s.setPoint, { a: true, b: true });
  s = applyEvent(s, { t: "r", w: "b" });
  assert.equal(s.phase, "between_sets");
  assert.deepEqual(s.completedSets, [[20, 21]]);
  assert.equal(s.goldenPointNow, false);
});

test("golden point: 21-19 and 21-0 end the set, 20-19 does not", () => {
  const cfg = golden();
  assert.equal(setWinner({ a: 21, b: 19 }, cfg), "a");
  assert.equal(setWinner({ a: 21, b: 20 }, cfg), "a");
  assert.equal(setWinner({ a: 20, b: 19 }, cfg), null);
  assert.equal(setWinner({ a: 0, b: 21 }, cfg), "b");
});

test("golden point ignores the cap and is not flagged before the level score", () => {
  const cfg = golden({ cap: 25 });
  assert.equal(validateConfig(cfg), null);
  const s = replay(cfg, rallies("ab".repeat(19))); // 19-19
  assert.equal(s.goldenPointNow, false);
});

test("golden point works with other set lengths", () => {
  const cfg = golden({ pointsToWin: 11, bestOf: 1 });
  const s = replay(cfg, rallies("ab".repeat(10)));
  assert.equal(s.goldenPointNow, true); // 10-10
  assert.equal(applyEvent(s, { t: "r", w: "a" }).phase, "finished");
});

test("standard scoring is unchanged when goldenPoint is off or missing", () => {
  const cfg: MatchConfig = { ...golden(), goldenPoint: undefined };
  const s = replay(cfg, rallies("ab".repeat(20) + "a"));
  assert.equal(s.phase, "in_set"); // 21-20 still needs a 2 point lead
  assert.equal(s.goldenPointNow, false);
  assert.equal(initialState(cfg).goldenPointNow, false);
});
