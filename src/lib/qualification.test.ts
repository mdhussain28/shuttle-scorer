import assert from "node:assert/strict";
import { test } from "node:test";
import { qualificationFor } from "./qualification.ts";
import type { StandingRow } from "./scoring/standings.ts";

const row = (id: string, won: number, played: number, rank: number, tied = false): StandingRow => ({
  id, played, won, lost: played - won, setsWon: 0, setsLost: 0, setDiff: 0,
  pointsFor: 0, pointsAgainst: 0, pointDiff: 0, matchPoints: won * 2, rank, tied,
});

test("a finished pool: top places are qualified, the rest are not", () => {
  const rows = [row("a", 3, 3, 1), row("b", 2, 3, 2), row("c", 1, 3, 3), row("d", 0, 3, 4)];
  assert.equal(qualificationFor(rows[0], rows, 2).tone, "in");
  assert.equal(qualificationFor(rows[0], rows, 2).label, "Qualified");
  assert.equal(qualificationFor(rows[2], rows, 2).tone, "eliminated");
});

test("an unfinished pool: inside, outside and cannot catch up", () => {
  // 4 teams, each plays 3. a and b have 2 wins after 2 games, c has 1 win, d 0 wins.
  const rows = [row("a", 2, 2, 1), row("b", 2, 2, 1, true), row("c", 1, 2, 3), row("d", 0, 2, 4)];
  assert.equal(qualificationFor(rows[0], rows, 2).tone, "in");
  const c = qualificationFor(rows[2], rows, 2);
  assert.equal(c.tone, "out");
  assert.match(c.detail, /1 win behind/);
  // d can reach at most 1 win, below the last qualifying team's 2
  assert.equal(qualificationFor(rows[3], rows, 2).tone, "eliminated");
});

test("level teams across the cut-off are flagged", () => {
  const rows = [row("a", 3, 3, 1), row("b", 1, 3, 2, true), row("c", 1, 3, 2, true), row("d", 1, 3, 2, true)];
  const q = qualificationFor(rows[1], rows, 2);
  assert.equal(q.tone, "level");
  assert.match(q.detail, /2 other teams/);
});

test("the cut-off can be moved", () => {
  const rows = [row("a", 3, 3, 1), row("b", 2, 3, 2), row("c", 1, 3, 3)];
  assert.equal(qualificationFor(rows[1], rows, 1).tone, "eliminated");
  assert.equal(qualificationFor(rows[2], rows, 3).tone, "in");
});
