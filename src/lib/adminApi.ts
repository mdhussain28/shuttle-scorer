"use client";

import { getSupabase } from "@/lib/supabase";
import type { AdminUser } from "@/lib/adminTypes";

async function request(method: string, body?: Record<string, unknown>) {
  const { data } = await getSupabase().auth.getSession();
  const res = await fetch("/api/admin/users", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : `Request failed (${res.status})`);
  return json;
}

export async function fetchUsers(): Promise<{ me: string; users: AdminUser[] }> {
  return (await request("GET")) as unknown as { me: string; users: AdminUser[] };
}

export const createUser = (body: {
  email: string;
  password: string;
  role: "user" | "admin";
  expiresAt: string | null;
  tournamentIds: string[];
}) => request("POST", body);

export const updateUser = (body: { userId: string; password?: string; expiresAt?: string | null }) =>
  request("PATCH", body);

export const deleteUser = (userId: string) => request("DELETE", { userId });
