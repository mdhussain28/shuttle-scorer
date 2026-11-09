import { NextResponse } from "next/server";
import {
  adminClient, deleteAccount, fail, isFail, listAllUsers, purgeExpiredUsers, requireAdmin, type Fail,
} from "@/lib/server/adminUsers";

// Admin-only account management. It runs on the server because it needs the service key.
//   GET     list every account with its expiry and tournaments
//   POST    { email, password, role, expiresAt, tournamentIds }  create an account
//   PATCH   { userId, password?, expiresAt? }                     reset password / change or clear expiry
//   DELETE  { userId }                                            delete an account

export const dynamic = "force-dynamic";

const reply = (f: Fail) => NextResponse.json({ error: f.error }, { status: f.status });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** null/"" = never, otherwise a future ISO time. Returns undefined when the value is not valid. */
function parseExpiry(v: unknown): string | null | undefined {
  if (v === null || v === "" || v === undefined) return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return undefined;
  if (d.getTime() <= Date.now() + 30_000) return undefined;
  return d.toISOString();
}

export async function GET(request: Request) {
  const db = adminClient();
  if (isFail(db)) return reply(db);
  const me = await requireAdmin(request, db);
  if (isFail(me)) return reply(me);

  try {
    await purgeExpiredUsers(db, me.id);
    const [users, profiles, members] = await Promise.all([
      listAllUsers(db),
      db.from("app_users").select("user_id,expires_at"),
      db.from("tournament_members").select("user_id,tournament_id"),
    ]);
    if (profiles.error) return reply(fail(profiles.error.message, 500));
    if (members.error) return reply(fail(members.error.message, 500));
    const expiry = new Map<string, string | null>(
      (profiles.data as Array<{ user_id: string; expires_at: string | null }>).map((p) => [p.user_id, p.expires_at]),
    );
    const tids = new Map<string, string[]>();
    for (const m of members.data as Array<{ user_id: string; tournament_id: string }>) {
      tids.set(m.user_id, [...(tids.get(m.user_id) ?? []), m.tournament_id]);
    }
    return NextResponse.json({
      me: me.id,
      users: users
        .map((u) => ({ ...u, expiresAt: expiry.get(u.id) ?? null, tournamentIds: tids.get(u.id) ?? [] }))
        .sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role === "admin" ? -1 : 1)),
    });
  } catch (e) {
    return reply(fail((e as Error).message, 500));
  }
}

export async function POST(request: Request) {
  const db = adminClient();
  if (isFail(db)) return reply(db);
  const me = await requireAdmin(request, db);
  if (isFail(me)) return reply(me);
  const body = await request.json().catch(() => ({}));

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = body.role === "admin" ? "admin" : "user";
  if (!EMAIL.test(email)) return reply(fail("Enter a valid email address.", 400));
  if (password.length < 8) return reply(fail("The password must be at least 8 characters.", 400));
  const expiresAt = parseExpiry(body.expiresAt);
  if (expiresAt === undefined) return reply(fail("The deletion time must be in the future.", 400));
  const tournamentIds: string[] = role === "user" && Array.isArray(body.tournamentIds) ? body.tournamentIds.map(String) : [];

  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: role === "admin" ? "admin" : "umpire" },
  });
  if (created.error || !created.data.user) {
    const msg = created.error?.message ?? "Could not create the account.";
    return reply(fail(/already|registered|exists/i.test(msg) ? "An account with that email already exists." : msg, 400));
  }
  const user = created.data.user;

  const profile = await db
    .from("app_users")
    .upsert({ user_id: user.id, email, role, expires_at: expiresAt, created_by: me.id }, { onConflict: "user_id" });
  if (profile.error) {
    await db.auth.admin.deleteUser(user.id);
    return reply(fail(profile.error.message.includes("app_users") ? `${profile.error.message}. Run the latest supabase/schema.sql.` : profile.error.message, 500));
  }
  if (tournamentIds.length > 0) {
    const link = await db
      .from("tournament_members")
      .insert(tournamentIds.map((tournament_id) => ({ tournament_id, user_id: user.id, email })));
    if (link.error) return reply(fail(link.error.message, 500));
  }
  return NextResponse.json({ ok: true, userId: user.id, email, expiresAt });
}

export async function PATCH(request: Request) {
  const db = adminClient();
  if (isFail(db)) return reply(db);
  const me = await requireAdmin(request, db);
  if (isFail(me)) return reply(me);
  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId ?? "");
  if (!userId) return reply(fail("Missing user.", 400));

  const existing = await db.auth.admin.getUserById(userId);
  if (existing.error || !existing.data.user) return reply(fail("User not found.", 404));
  const target = existing.data.user;

  if (typeof body.password === "string" && body.password !== "") {
    if (body.password.length < 8) return reply(fail("The password must be at least 8 characters.", 400));
    const res = await db.auth.admin.updateUserById(userId, { password: body.password });
    if (res.error) return reply(fail(res.error.message, 400));
  }

  if ("expiresAt" in body) {
    if (userId === me.id) return reply(fail("You cannot set a deletion time on your own account.", 400));
    const expiresAt = parseExpiry(body.expiresAt);
    if (expiresAt === undefined) return reply(fail("The deletion time must be in the future.", 400));
    const role = target.app_metadata?.role === "umpire" ? "user" : "admin";
    const res = await db
      .from("app_users")
      .upsert({ user_id: userId, email: target.email ?? "", role, expires_at: expiresAt }, { onConflict: "user_id" });
    if (res.error) return reply(fail(res.error.message, 500));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const db = adminClient();
  if (isFail(db)) return reply(db);
  const me = await requireAdmin(request, db);
  if (isFail(me)) return reply(me);
  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId ?? "");
  if (!userId) return reply(fail("Missing user.", 400));
  if (userId === me.id) return reply(fail("You cannot delete your own account.", 400));

  const err = await deleteAccount(db, userId, me.id);
  if (err) return reply(fail(err, 500));
  return NextResponse.json({ ok: true });
}
