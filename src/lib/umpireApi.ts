"use client";

import { getSupabase } from "@/lib/supabase";

async function request(method: string, body: Record<string, unknown>) {
  const { data } = await getSupabase().auth.getSession();
  const res = await fetch("/api/umpires", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : `Request failed (${res.status})`);
  return json;
}

export const createUmpire = (body: { tournamentId: string; email: string; password: string; expiresAt: string | null }) =>
  request("POST", body);
export const resetUmpirePassword = (userId: string, password: string) => request("PATCH", { userId, password });
export const deleteUmpire = (userId: string) => request("DELETE", { userId });
