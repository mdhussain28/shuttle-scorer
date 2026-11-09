export interface AdminUser {
  id: string;
  email: string;
  role: "admin" | "user";
  createdAt: string;
  lastSignInAt: string | null;
  /** Users only: may create and manage their own tournaments. */
  canHost: boolean;
  /** Users only: may create umpire accounts for their tournaments. */
  canAddUmpires: boolean;
  /** Email of the account that created this one. */
  createdBy: string | null;
  /** Automatic deletion time, or null when the account is kept. */
  expiresAt: string | null;
  tournamentIds: string[];
}

export interface TournamentLite {
  id: string;
  name: string;
  venue: string | null;
  start_date: string | null;
  created_at: string;
  expires_at: string;
}

export interface MatchLite {
  id: string;
  tournament_id: string | null;
  status: "live" | "finished";
  a_label: string;
  b_label: string;
  sets_a: number;
  sets_b: number;
  created_at: string;
}
