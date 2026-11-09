import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, deleteAccount, fail, isFail, requireUmpireManager, type Fail } from "@/lib/server/adminUsers";

// Umpire accounts, for admins and for users an admin allowed to add umpires.
//   POST    { tournamentId, email, password, expiresAt? }   create an umpire for a tournament
//   PATCH   { userId, password }                            new password for an umpire you created
//   DELETE  { userId }                                      delete an umpire you created (admins: any account but their own)

export const dynamic = "force-dynamic";

const reply = (f: Fail) => NextResponse.json({ error: f.error }, { status: f.status });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseExpiry(v: unknown): string | null | undefined {
  if (v === null || v === "" || v === undefined) return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now() + 30_000) return undefined;
  return d.toISOString();
}

/** The caller can reach the tournament: admin, its owner, or a member. */
async function canReach(db: SupabaseClient, tid: string, me: { id: string; isAdmin: boolean }): Promise<boolean> {
  if (me.isAdmin) return true;
  const t = await db.from("tournaments").select("owner_id").eq("id", tid).maybeSingle();
  if ((t.data as { owner_id: string } | null)?.owner_id === me.id) return true;
  const m = await db.from("tournament_members").select("user_id").eq("tournament_id", tid).eq("user_id", me.id).maybeSingle();
  return Boolean(m.data);
}

/** The caller created this account (or is an admin), and it is not an admin account. */
async function ownsAccount(db: SupabaseClient, userId: string, me: { id: string; isAdmin: boolean }): Promise<Fail | null> {
  if (userId === me.id) return fail("You cannot change your own account here.", 400);
  const target = await db.auth.admin.getUserById(userId);
  if (target.error || !target.data.user) return fail("Account not found.", 404);
  if (target.data.user.app_metadata?.role !== "umpire") return fail("Only an admin can change admin accounts.", 403);
  if (me.isAdmin) return null;
  const row = await db.from("app_users").select("created_by").eq("user_id", userId).maybeSingle();
  if ((row.data as { created_by: string | null } | null)?.created_by !== me.id) {
    return fail("You can only change umpires you added yourself.", 403);
  }
  return null;
}

export async function POST(request: Request) {
  const db = adminClient();
  if (isFail(db)) return reply(db);
  const me = await requireUmpireManager(request, db);
  if (isFail(me)) return reply(me);
  const body = await request.json().catch(() => ({}));

  const tournamentId = String(body.tournamentId ?? "");
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!tournamentId) return reply(fail("Choose a tournament.", 400));
  if (!EMAIL.test(email)) return reply(fail("Enter a valid email address.", 400));
  if (password.length < 8) return reply(fail("The password must be at least 8 characters.", 400));
  const expiresAt = parseExpiry(body.expiresAt);
  if (expiresAt === undefined) return reply(fail("The deletion time must be in the future.", 400));
  if (!(await canReach(db, tournamentId, me))) return reply(fail("You cannot add umpires to this tournament.", 403));

  const created = await db.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: "umpire" } });
  if (created.error || !created.data.user) {
    const msg = created.error?.message ?? "Could not create the account.";
    return reply(fail(/already|registered|exists/i.test(msg) ? "An account with that email already exists." : msg, 400));
  }
  const user = created.data.user;

  const profile = await db
    .from("app_users")
    .upsert({ user_id: user.id, email, role: "user", expires_at: expiresAt, created_by: me.id }, { onConflict: "user_id" });
  if (profile.error) {
    await db.auth.admin.deleteUser(user.id);
    return reply(fail(profile.error.message, 500));
  }
  const link = await db.from("tournament_members").insert({ tournament_id: tournamentId, user_id: user.id, email });
  if (link.error) return reply(fail(link.error.message, 500));
  return NextResponse.json({ ok: true, userId: user.id, email, expiresAt });
}

export async function PATCH(request: Request) {
  const db = adminClient();
  if (isFail(db)) return reply(db);
  const me = await requireUmpireManager(request, db);
  if (isFail(me)) return reply(me);
  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId ?? "");
  const password = String(body.password ?? "");
  if (!userId) return reply(fail("Missing account.", 400));
  if (password.length < 8) return reply(fail("The password must be at least 8 characters.", 400));
  const denied = await ownsAccount(db, userId, me);
  if (denied) return reply(denied);
  const res = await db.auth.admin.updateUserById(userId, { password });
  if (res.error) return reply(fail(res.error.message, 400));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const db = adminClient();
  if (isFail(db)) return reply(db);
  const me = await requireUmpireManager(request, db);
  if (isFail(me)) return reply(me);
  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId ?? "");
  if (!userId) return reply(fail("Missing account.", 400));
  const denied = await ownsAccount(db, userId, me);
  if (denied) return reply(denied);
  // Matches the umpire scored stay, now owned by whoever deletes the account.
  const err = await deleteAccount(db, userId, me.id);
  if (err) return reply(fail(err, 500));
  return NextResponse.json({ ok: true });
}
