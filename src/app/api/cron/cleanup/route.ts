import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Called once a day by Vercel Cron (see vercel.json).
// Deletes tournaments (and, through ON DELETE CASCADE, their categories, pools,
// entries and matches) older than 3 months, plus expired casual matches.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Supabase settings are missing on the server." }, { status: 500 });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const now = new Date().toISOString();

  const tournaments = await admin
    .from("tournaments")
    .delete({ count: "exact" })
    .lt("expires_at", now);
  const casual = await admin
    .from("matches")
    .delete({ count: "exact" })
    .is("tournament_id", null)
    .lt("expires_at", now);

  if (tournaments.error || casual.error) {
    return NextResponse.json(
      { error: tournaments.error?.message ?? casual.error?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    deletedTournaments: tournaments.count ?? 0,
    deletedCasualMatches: casual.count ?? 0,
    ranAt: now,
  });
}
