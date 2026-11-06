import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Organiser-only endpoint for umpire accounts. It runs on the server because creating
// accounts needs the service key, which must never reach the browser.
//   POST   { tournamentId, email, password }  create (or re-use) an umpire and add them to the tournament
//   PATCH  { tournamentId, userId, password } set a new password
//   DELETE { tournamentId, userId }           remove the umpire from the tournament

export const dynamic = "force-dynamic";

type Fail = { error: string; status: number };
const fail = (error: string, status: number): Fail => ({ error, status });
const isFail = (v: unknown): v is Fail => typeof v === "object" && v !== null && "status" in v;

function adminClient(): SupabaseClient | Fail {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return fail("The server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in Vercel and redeploy.", 500);
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Confirms the caller is signed in as an organiser who owns the tournament. */
async function authorise(request: Request, admin: SupabaseClient, tournamentId: unknown): Promise<string | Fail> {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return fail("Sign in first.", 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return fail("Your session has expired. Sign in again.", 401);
  if (data.user.app_metadata?.role === "umpire") return fail("Only the organiser can manage umpires.", 403);
  if (typeof tournamentId !== "string" || !tournamentId) return fail("Missing tournament.", 400);
  const t = await admin.from("tournaments").select("owner_id").eq("id", tournamentId).maybeSingle();
  if (t.error || !t.data) return fail("Tournament not found.", 404);
  if (t.data.owner_id !== data.user.id) return fail("This is not your tournament.", 403);
  return data.user.id;
}

async function findUserByEmail(admin: SupabaseClient, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u: { email?: string | null }) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

const reply = (f: Fail) => NextResponse.json({ error: f.error }, { status: f.status });

export async function POST(request: Request) {
  const admin = adminClient();
  if (isFail(admin)) return reply(admin);
  const body = await request.json().catch(() => ({}));
  const owner = await authorise(request, admin, body.tournamentId);
  if (isFail(owner)) return reply(owner);

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(fail("Enter a valid email address.", 400));

  try {
    let user = await findUserByEmail(admin, email);
    let created = false;
    if (user) {
      // An existing umpire can be added to another tournament. Organiser accounts are never touched.
      if (user.app_metadata?.role !== "umpire") {
        return reply(fail("That email already belongs to a non-umpire account. Use a different email.", 409));
      }
    } else {
      if (password.length < 8) return reply(fail("The password must be at least 8 characters.", 400));
      const res = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role: "umpire" },
      });
      if (res.error || !res.data.user) return reply(fail(res.error?.message ?? "Could not create the account.", 400));
      user = res.data.user;
      created = true;
    }

    const link = await admin
      .from("tournament_members")
      .upsert({ tournament_id: body.tournamentId, user_id: user.id, email }, { onConflict: "tournament_id,user_id" });
    if (link.error) return reply(fail(link.error.message, 500));
    return NextResponse.json({ ok: true, created, userId: user.id, email });
  } catch (e) {
    return reply(fail((e as Error).message, 500));
  }
}

export async function PATCH(request: Request) {
  const admin = adminClient();
  if (isFail(admin)) return reply(admin);
  const body = await request.json().catch(() => ({}));
  const owner = await authorise(request, admin, body.tournamentId);
  if (isFail(owner)) return reply(owner);

  const password = String(body.password ?? "");
  if (password.length < 8) return reply(fail("The password must be at least 8 characters.", 400));
  const m = await admin
    .from("tournament_members")
    .select("user_id")
    .eq("tournament_id", body.tournamentId)
    .eq("user_id", String(body.userId ?? ""))
    .maybeSingle();
  if (!m.data) return reply(fail("That umpire is not on this tournament.", 404));
  const res = await admin.auth.admin.updateUserById(m.data.user_id, { password });
  if (res.error) return reply(fail(res.error.message, 400));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const admin = adminClient();
  if (isFail(admin)) return reply(admin);
  const body = await request.json().catch(() => ({}));
  const owner = await authorise(request, admin, body.tournamentId);
  if (isFail(owner)) return reply(owner);

  // The account itself is kept, so matches the umpire scored keep their history.
  const res = await admin
    .from("tournament_members")
    .delete()
    .eq("tournament_id", body.tournamentId)
    .eq("user_id", String(body.userId ?? ""));
  if (res.error) return reply(fail(res.error.message, 500));
  return NextResponse.json({ ok: true });
}
