// Server-only helpers for account management. Uses the service key, so never import this from a client component.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Fail = { error: string; status: number };
export const fail = (error: string, status: number): Fail => ({ error, status });
export const isFail = (v: unknown): v is Fail => typeof v === "object" && v !== null && "status" in v && "error" in v;

export function adminClient(): SupabaseClient | Fail {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return fail("The server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in Vercel and redeploy.", 500);
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Confirms the caller is signed in as an admin. Returns the admin's id and email. */
export async function requireAdmin(request: Request, db: SupabaseClient): Promise<{ id: string; email: string } | Fail> {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return fail("Sign in first.", 401);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return fail("Your session has expired. Sign in again.", 401);
  if (data.user.app_metadata?.role === "umpire") return fail("Only an admin can do this.", 403);
  return { id: data.user.id, email: data.user.email ?? "" };
}

export interface AccountUser {
  id: string;
  email: string;
  role: "admin" | "user";
  createdAt: string;
  lastSignInAt: string | null;
}

export async function listAllUsers(db: SupabaseClient): Promise<AccountUser[]> {
  const out: AccountUser[] = [];
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users as Array<{
      id: string;
      email?: string | null;
      created_at: string;
      last_sign_in_at?: string | null;
      app_metadata?: { role?: string };
    }>) {
      out.push({
        id: u.id,
        email: u.email ?? "",
        role: u.app_metadata?.role === "umpire" ? "user" : "admin",
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
      });
    }
    if (data.users.length < 200) break;
  }
  return out;
}

const OWNED_TABLES = ["tournaments", "categories", "pools", "entries", "matches"];

/**
 * Deletes an account. Everything the account created (matches they scored, and so on) is first handed to
 * another admin, because deleting a user would otherwise delete the rows they own.
 */
export async function deleteAccount(db: SupabaseClient, userId: string, heirId: string): Promise<string | null> {
  for (const table of OWNED_TABLES) {
    const r = await db.from(table).update({ owner_id: heirId }).eq("owner_id", userId);
    if (r.error) return r.error.message;
  }
  const del = await db.auth.admin.deleteUser(userId);
  return del.error ? del.error.message : null;
}

/** The oldest admin account, used as the new owner of data left behind by deleted accounts. */
export async function pickHeir(db: SupabaseClient, exceptId?: string): Promise<string | null> {
  const users = await listAllUsers(db);
  const admins = users
    .filter((u) => u.role === "admin" && u.id !== exceptId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return admins[0]?.id ?? null;
}

/** Deletes every account whose expiry time has passed. Returns the number removed. */
export async function purgeExpiredUsers(db: SupabaseClient, heirId?: string): Promise<number> {
  const due = await db
    .from("app_users")
    .select("user_id")
    .not("expires_at", "is", null)
    .lte("expires_at", new Date().toISOString());
  if (due.error || !due.data || due.data.length === 0) return 0;
  const heir = heirId ?? (await pickHeir(db));
  if (!heir) return 0;
  let removed = 0;
  for (const row of due.data as Array<{ user_id: string }>) {
    if (row.user_id === heir) continue;
    if ((await deleteAccount(db, row.user_id, heir)) === null) removed++;
  }
  return removed;
}
