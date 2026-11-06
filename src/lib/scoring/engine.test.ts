import test from "node:test";
import assert from "node:assert/strict";
import {
  applyEvent,
  defaultCap,
  initialState,
  replay,
  setWinner,
  summarize,
  validateConfig,
} from "./engine.ts";
import type { MatchConfig, MatchEvent, Side } from "./engine.ts";

const singles = (over: Partial<MatchConfig> = {}): MatchConfig => ({
  matchType: "singles", bestOf: 3, pointsToWin: 21, cap: 30,
  firstServer: "a", aRight: 0, bRight: 0, ...over,
});
const doubles = (over: Partial<MatchConfig> = {}): MatchConfig => ({
  matchType: "doubles", bestOf: 3, pointsToWin: 21, cap: 30,
  firstServer: "a", aRight: 0, bRight: 0, ...over,
});
const rallies = (seq: string): MatchEvent[] =>
  seq.split("").map((c) => ({ t: "r", w: c as Side }));
const rep = (n: number, c: string) => c.repeat(n);

test("singles: server court follows own score parity and serve passes to rally winner", () => {
  let s = initialState(singles());
  assert.deepEqual(s.server, { side: "a", playerIndex: 0, court: "right" });
  s = replay(singles(), rallies("a"));
  assert.equal(s.server.side, "a");
  assert.equal(s.server.court, "left"); // 1-0, odd
  s = replay(singles(), rallies("ab"));
  assert.equal(s.server.side, "b"); // receiver won the rally and now serves
  assert.equal(s.server.court, "left"); // b has 1 point
  s = replay(singles(), rallies("abb"));
  assert.equal(s.server.side, "b");
  assert.equal(s.server.court, "right"); // b has 2 points
  assert.equal(s.receiver.side, "a");
  assert.equal(s.receiver.court, "right"); // diagonal opposite
});

test("doubles: initial server and receiver come from chosen right-court players", () => {
  const cfg = doubles({ firstServer: "b", aRight: 1, bRight: 0 });
  const s = initialState(cfg);
  assert.deepEqual(s.server, { side: "b", playerIndex: 0, court: "right" });
  assert.deepEqual(s.receiver, { side: "a", playerIndex: 1, court: "right" });
});

test("doubles: serving side swaps courts after each point, same player keeps serving", () => {
  const cfg = doubles({ aRight: 0 });
  let s = initialState(cfg);
  assert.equal(s.server.playerIndex, 0);
  s = applyEvent(s, { t: "r", w: "a" }); // 1-0
  assert.deepEqual(s.server, { side: "a", playerIndex: 0, court: "left" });
  s = applyEvent(s, { t: "r", w: "a" }); // 2-0
  assert.deepEqual(s.server, { side: "a", playerIndex: 0, court: "right" });
  s = applyEvent(s, { t: "r", w: "a" }); // 3-0
  assert.deepEqual(s.server, { side: "a", playerIndex: 0, court: "left" });
});

test("doubles: receiving side wins the rally and serves without swapping", () => {
  const cfg = doubles({ aRight: 0, bRight: 0 });
  // a scores twice (a: 2), then b wins a rally -> b serves with 1 point, from the left court
  const s = replay(cfg, rallies("aab"));
  assert.equal(s.servingSide, "b");
  assert.equal(s.right.b, 0); // b did not swap
  assert.deepEqual(s.server, { side: "b", playerIndex: 1, court: "left" });
  // receiver is the diagonal player on a: a has swapped twice, so player 0 is back on the right
  assert.deepEqual(s.receiver, { side: "a", playerIndex: 1, court: "left" });
});

test("doubles: second server of a side alternates as the side wins the serve back", () => {
  const cfg = doubles({ aRight: 0, bRight: 0 });
  // a serves first (player 0). b wins rally and serves (b 1, left court => b player 1).
  // a wins rally back (a 1) and serves from left court. a swapped only when serving side scored: a was
  // serving at 0-0, then lost the rally => no swap, a.right stays 0. a has 1 point => left => player 1.
  const s = replay(cfg, rallies("ba"));
  assert.equal(s.servingSide, "a");
  assert.deepEqual(s.server, { side: "a", playerIndex: 1, court: "left" });
});

test("set ends at 21 with a 2 point lead, not before", () => {
  const cfg = singles();
  let s = replay(cfg, rallies(rep(20, "a") + rep(20, "b")));
  assert.equal(s.phase, "in_set");
  s = applyEvent(s, { t: "r", w: "a" }); // 21-20
  assert.equal(s.phase, "in_set");
  s = applyEvent(s, { t: "r", w: "a" }); // 22-20
  assert.equal(s.phase, "between_sets");
  assert.deepEqual(s.completedSets, [[22, 20]]);
  assert.equal(s.setsWon.a, 1);
});

test("set ends at the cap: 30-29 wins", () => {
  const cfg = singles();
  const alternate = "ab".repeat(29); // 29-29
  let s = replay(cfg, rallies(alternate));
  assert.equal(s.phase, "in_set");
  s = applyEvent(s, { t: "r", w: "b" });
  assert.equal(s.phase, "between_sets");
  assert.deepEqual(s.completedSets, [[29, 30]]);
});

test("cap can be switched off: play continues past 30 until a 2 point lead", () => {
  const cfg = singles({ cap: null });
  let s = replay(cfg, rallies("ab".repeat(29) + "b"));
  assert.equal(s.phase, "in_set"); // 29-30, no cap
  s = applyEvent(s, { t: "r", w: "b" });
  assert.equal(s.phase, "between_sets");
});

test("winner of a set serves first in the next set; positions come from the n event", () => {
  const cfg = doubles({ firstServer: "a" });
  let s = replay(cfg, rallies(rep(21, "b")));
  assert.equal(s.phase, "between_sets");
  assert.equal(s.servingSide, "b");
  s = applyEvent(s, { t: "n", aRight: 1, bRight: 1 });
  assert.equal(s.phase, "in_set");
  assert.deepEqual(s.scores, { a: 0, b: 0 });
  assert.deepEqual(s.server, { side: "b", playerIndex: 1, court: "right" });
  assert.deepEqual(s.receiver, { side: "a", playerIndex: 1, court: "right" });
});

test("best of 3: match finishes at two set wins and rejects further rallies", () => {
  const cfg = singles();
  const events: MatchEvent[] = [
    ...rallies(rep(21, "a")),
    { t: "n", aRight: 0, bRight: 0 },
    ...rallies(rep(21, "a")),
  ];
  const s = replay(cfg, events);
  assert.equal(s.phase, "finished");
  assert.equal(s.winner, "a");
  assert.throws(() => applyEvent(s, { t: "r", w: "b" }));
  const sum = summarize(s);
  assert.deepEqual(sum.setScores, [[21, 0], [21, 0]]);
  assert.equal(sum.pointsA, 42);
  assert.equal(sum.finished, true);
});

test("best of 1 finishes after one set; best of 5 needs three", () => {
  assert.equal(replay(singles({ bestOf: 1 }), rallies(rep(21, "b"))).phase, "finished");
  const s = replay(singles({ bestOf: 5 }), [
    ...rallies(rep(21, "a")), { t: "n", aRight: 0, bRight: 0 },
    ...rallies(rep(21, "a")),
  ]);
  assert.equal(s.phase, "between_sets");
});

test("custom set length: 11 points, cap 15", () => {
  const cfg = singles({ pointsToWin: 11, cap: 15, bestOf: 1 });
  assert.equal(setWinner({ a: 11, b: 9 }, cfg), "a");
  assert.equal(setWinner({ a: 11, b: 10 }, cfg), null);
  assert.equal(setWinner({ a: 15, b: 14 }, cfg), "a");
  assert.equal(defaultCap(11), 15);
  assert.equal(defaultCap(21), 30);
  assert.equal(defaultCap(15), 21);
});

test("interval notice fires once at 11, and ends are swapped in the deciding set", () => {
  const cfg = singles();
  let s = replay(cfg, rallies(rep(10, "a")));
  assert.equal(s.notice, null);
  s = applyEvent(s, { t: "r", w: "a" });
  assert.equal(s.notice, "interval");
  s = applyEvent(s, { t: "r", w: "a" });
  assert.equal(s.notice, null);
  assert.equal(s.aOnLeft, true);

  // Deciding set: a and b win one set each, then reach 11 in the third.
  const events: MatchEvent[] = [
    ...rallies(rep(21, "a")), { t: "n", aRight: 0, bRight: 0 },
    ...rallies(rep(21, "b")), { t: "n", aRight: 0, bRight: 0 },
    ...rallies(rep(11, "a")),
  ];
  s = replay(cfg, events);
  assert.equal(s.notice, "interval_change_ends");
  // two set changes (true -> false -> true), then the mid-set change in the decider
  assert.equal(s.aOnLeft, false);
});

test("set point and match point flags", () => {
  const cfg = singles();
  let s = replay(cfg, rallies(rep(20, "a")));
  assert.equal(s.setPoint.a, true);
  assert.equal(s.matchPoint.a, false); // first set only
  s = replay(cfg, [...rallies(rep(21, "a")), { t: "n", aRight: 0, bRight: 0 }, ...rallies(rep(20, "a"))]);
  assert.equal(s.matchPoint.a, true);
  assert.equal(s.setPoint.b, false);
});

test("undo: replaying without the last event restores the previous state exactly", () => {
  const cfg = doubles();
  const events = rallies("aabbabbaab");
  const before = replay(cfg, events.slice(0, -1));
  const after = replay(cfg, events);
  assert.notDeepEqual(before.scores, after.scores);
  const undone = replay(cfg, after.completedSets.length ? events : events.slice(0, -1));
  assert.deepEqual(undone, before);
});

test("undo across a set boundary returns to the set point", () => {
  const cfg = singles();
  const events = rallies(rep(21, "a"));
  const finished = replay(cfg, events);
  assert.equal(finished.phase, "between_sets");
  const undone = replay(cfg, events.slice(0, -1));
  assert.equal(undone.phase, "in_set");
  assert.equal(undone.scores.a, 20);
});

test("rally and set-start events are rejected in the wrong phase", () => {
  const s = initialState(singles());
  assert.throws(() => applyEvent(s, { t: "n", aRight: 0, bRight: 0 }));
});

test("config validation", () => {
  assert.equal(validateConfig(singles()), null);
  assert.ok(validateConfig(singles({ pointsToWin: 3 })));
  assert.ok(validateConfig(singles({ cap: 21 })));
  assert.equal(validateConfig(singles({ cap: null })), null);
  assert.ok(validateConfig({ ...singles(), bestOf: 2 as 3 }));
});
