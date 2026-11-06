import test from "node:test";
import assert from "node:assert/strict";
import { bracketOrder, buildFixtures, buildSlots, podium, validateQualifiers } from "./knockout.ts";
import type { KnockoutConfig, PlayedTie } from "./knockout.ts";

const pool = (name: string, n: number) => Array.from({ length: n }, (_, i) => `${name}${i + 1}`);
const poolOf = (id: string | null) => (id ? id[0] : null);

function firstRoundPairs(slots: Array<string | null>): Array<[string | null, string | null]> {
  const out: Array<[string | null, string | null]> = [];
  for (let i = 0; i < slots.length; i += 2) out.push([slots[i], slots[i + 1]]);
  return out;
}
function sameGroupClashes(slots: Array<string | null>): number {
  return firstRoundPairs(slots).filter(([a, b]) => a && b && poolOf(a) === poolOf(b)).length;
}

test("bracket order", () => {
  assert.deepEqual(bracketOrder(2), [1, 2]);
  assert.deepEqual(bracketOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(bracketOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

test("two pools, semi-finals: group winner meets the other group's runner-up", () => {
  const slots = buildSlots([pool("A", 4), pool("B", 4)], 2, 4);
  assert.deepEqual(firstRoundPairs(slots), [["A1", "B2"], ["B1", "A2"]]);
});

test("two pools, quarter-finals with four from each pool: all cross-pool, winners in opposite halves", () => {
  const slots = buildSlots([pool("A", 4), pool("B", 4)], 4, 8);
  assert.equal(sameGroupClashes(slots), 0);
  assert.deepEqual(firstRoundPairs(slots)[0], ["A1", "B4"]);
  assert.ok(slots.indexOf("A1") < 4 && slots.indexOf("B1") >= 4, "A1 and B1 must be in opposite halves");
  assert.equal(new Set(slots).size, 8);
});

test("four pools, quarter-finals with two from each: no same-pool matches", () => {
  const slots = buildSlots([pool("A", 4), pool("B", 4), pool("C", 4), pool("D", 4)], 2, 8);
  assert.equal(sameGroupClashes(slots), 0);
  assert.equal(new Set(slots).size, 8);
});

test("three pools, quarter-finals with two each: top two seeds get byes, no same-pool clash", () => {
  const slots = buildSlots([pool("A", 3), pool("B", 3), pool("C", 3)], 2, 8);
  assert.equal(slots.filter((s) => s === null).length, 2);
  assert.equal(sameGroupClashes(slots), 0);
  const pairs = firstRoundPairs(slots);
  assert.ok(pairs.some(([a, b]) => a === "A1" && b === null), "seed 1 has a bye");
  assert.ok(pairs.some(([a, b]) => (a === "B1" && b === null) || (a === null && b === "B1")), "seed 2 has a bye");
});

test("one pool, semi-finals: 1 v 4 and 2 v 3", () => {
  const slots = buildSlots([pool("A", 5)], 4, 4);
  assert.deepEqual(firstRoundPairs(slots), [["A1", "A4"], ["A2", "A3"]]);
});

test("three qualifiers in the semi-finals: seed 1 has a bye", () => {
  const slots = buildSlots([pool("A", 2), pool("B", 1)], 2, 4);
  assert.equal(slots.filter((s) => s === null).length, 1);
});

test("qualifier count validation", () => {
  assert.equal(validateQualifiers(8, "qf"), null);
  assert.equal(validateQualifiers(5, "qf"), null);
  assert.ok(validateQualifiers(4, "qf"));
  assert.ok(validateQualifiers(9, "qf"));
  assert.equal(validateQualifiers(4, "sf"), null);
  assert.equal(validateQualifiers(3, "sf"), null);
  assert.ok(validateQualifiers(2, "sf"));
  assert.throws(() => buildSlots([pool("A", 5), pool("B", 5)], 5, 8));
});

function tie(stage: PlayedTie["stage"], slot: number, aId: string | null, bId: string | null, winner: "a" | "b" | null, status: "live" | "finished" = "finished"): PlayedTie {
  return { stage, slot, matchId: `${stage}${slot}`, status, aId, bId, winner };
}

test("results flow through quarter-finals, semi-finals, final and third place", () => {
  const cfg: KnockoutConfig = {
    stage: "qf",
    slots: buildSlots([pool("A", 4), pool("B", 4)], 4, 8),
    thirdPlace: true,
  };
  let fx = buildFixtures(cfg, []);
  assert.equal(fx.length, 4 + 2 + 1 + 1);
  const sf1 = () => fx.find((f) => f.stage === "sf" && f.slot === 1)!;
  assert.equal(sf1().aId, null);
  assert.equal(sf1().aFrom, "Winner QF1");

  const qf = fx.filter((f) => f.stage === "qf");
  const played: PlayedTie[] = qf.map((f, i) => tie("qf", i + 1, f.aId, f.bId, "a"));
  fx = buildFixtures(cfg, played);
  const qfWinners = qf.map((f) => f.aId);
  assert.equal(sf1().aId, qfWinners[0]);
  assert.equal(sf1().bId, qfWinners[1]);
  const sf2 = fx.find((f) => f.stage === "sf" && f.slot === 2)!;
  assert.equal(sf2.aId, qfWinners[2]);
  assert.equal(sf2.bId, qfWinners[3]);

  played.push(tie("sf", 1, sf1().aId, sf1().bId, "b"), tie("sf", 2, sf2.aId, sf2.bId, "a"));
  fx = buildFixtures(cfg, played);
  const final = fx.find((f) => f.stage === "final")!;
  const third = fx.find((f) => f.stage === "third")!;
  assert.equal(final.aId, sf1().bId);
  assert.equal(final.bId, sf2.aId);
  assert.equal(third.aId, qfWinners[0]); // loser of SF1 (it was side a)
  assert.equal(third.bId, qfWinners[3]); // loser of SF2 (it was side b)

  played.push(tie("final", 1, final.aId, final.bId, "a"), tie("third", 1, third.aId, third.bId, "b"));
  fx = buildFixtures(cfg, played);
  assert.deepEqual(podium(fx), { champion: final.aId, runnerUp: final.bId, third: third.bId });
});

test("a live match is shown but does not advance anyone", () => {
  const cfg: KnockoutConfig = { stage: "sf", slots: ["A1", "B2", "B1", "A2"], thirdPlace: false };
  const fx = buildFixtures(cfg, [tie("sf", 1, "A1", "B2", null, "live")]);
  const sf1 = fx.find((f) => f.stage === "sf" && f.slot === 1)!;
  assert.equal(sf1.status, "live");
  assert.equal(sf1.winnerId, null);
  assert.equal(fx.find((f) => f.stage === "final")!.aId, null);
  assert.equal(fx.some((f) => f.stage === "third"), false);
});

test("byes advance automatically and need no match", () => {
  const slots = buildSlots([pool("A", 3), pool("B", 3), pool("C", 3)], 2, 8);
  const cfg: KnockoutConfig = { stage: "qf", slots, thirdPlace: false };
  const fx = buildFixtures(cfg, []);
  const byes = fx.filter((f) => f.stage === "qf" && f.bye);
  assert.equal(byes.length, 2);
  for (const b of byes) assert.ok(b.winnerId);
  // the bye winner is already in the semi-final
  const semiIds = fx.filter((f) => f.stage === "sf").flatMap((f) => [f.aId, f.bId]);
  for (const b of byes) assert.ok(semiIds.includes(b.winnerId));
});
