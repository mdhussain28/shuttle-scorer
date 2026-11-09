import type { MatchConfig, MatchEvent } from "@/lib/scoring/engine";
import type { KnockoutConfig, Stage } from "@/lib/knockout";
import type { MultiWayRule, TwoWayRule } from "@/lib/scoring/standings";

export type EntryType = "singles" | "doubles";

export interface Tournament {
  id: string;
  owner_id?: string;
  name: string;
  /** Whether anyone with the link can watch this tournament. Optional until the latest schema.sql has run. */
  is_public?: boolean;
  venue: string | null;
  start_date: string | null;
  points_per_win: number;
  /** Optional so the app still loads before the latest schema.sql has been run. */
  tie_two?: TwoWayRule;
  tie_multi?: MultiWayRule;
  created_at: string;
  expires_at: string;
}

export interface Category {
  id: string;
  tournament_id: string;
  name: string;
  knockout?: KnockoutConfig | null;
  created_at: string;
}

export interface Pool {
  id: string;
  category_id: string;
  name: string;
  created_at: string;
}

export interface Entry {
  id: string;
  category_id: string;
  pool_id: string | null;
  entry_type: EntryType;
  team_name: string | null;
  player1: string;
  player2: string | null;
  created_at: string;
}

export interface MatchRow {
  id: string;
  tournament_id: string | null;
  category_id: string | null;
  pool_id: string | null;
  entry_a_id: string | null;
  entry_b_id: string | null;
  match_type: EntryType;
  a_label: string;
  b_label: string;
  a_players: string[];
  b_players: string[];
  config: MatchConfig;
  events: MatchEvent[];
  status: "live" | "finished";
  winner: "a" | "b" | null;
  set_scores: Array<[number, number]>;
  sets_a: number;
  sets_b: number;
  points_a: number;
  points_b: number;
  stage?: Stage | null;
  slot?: number | null;
  is_decider?: boolean;
  /** Whether the public live page may show this match. Optional until the latest schema.sql has run. */
  is_public?: boolean;
  created_at: string;
  finished_at: string | null;
  expires_at: string;
}

/** Name shown for an entry: the team name for doubles, the player's name for singles. */
export function entryLabel(e: Entry): string {
  return e.entry_type === "doubles" ? e.team_name || `${e.player1} / ${e.player2}` : e.player1;
}

export function entryPlayers(e: Entry): string[] {
  return e.entry_type === "doubles" ? [e.player1, e.player2 ?? ""] : [e.player1];
}

export interface TournamentMember {
  tournament_id: string;
  user_id: string;
  email: string;
  created_at: string;
}
