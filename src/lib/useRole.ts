"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

export interface Role {
  loading: boolean;
  userId: string | null;
  email: string;
  /** Accounts an admin created for scoring. The role is set on the server, users cannot change it. */
  isUmpire: boolean;
  /** Admins have every right. Any account that is not a user counts as an admin. */
  isAdmin: boolean;
  /** When this account will be deleted automatically, if an admin set a time. */
  expiresAt: string | null;
}

const EMPTY: Role = { loading: false, userId: null, email: "", isUmpire: false, isAdmin: false, expiresAt: null };

/** Who is signed in. Pages use it to hide controls; the database enforces the same limits. */
export function useRole(): Role {
  const [role, setRole] = useState<Role>({ ...EMPTY, loading: true });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabase();
        const { data } = await sb.auth.getSession();
        const u = data.session?.user;
        if (!u) {
          if (alive) setRole(EMPTY);
          return;
        }
        const isUmpire = u.app_metadata?.role === "umpire";
        let expiresAt: string | null = null;
        const own = await sb.from("app_users").select("expires_at").eq("user_id", u.id).maybeSingle();
        if (!own.error && own.data) expiresAt = (own.data as { expires_at: string | null }).expires_at;
        if (alive) setRole({ loading: false, userId: u.id, email: u.email ?? "", isUmpire, isAdmin: !isUmpire, expiresAt });
      } catch {
        if (alive) setRole(EMPTY);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return role;
}
