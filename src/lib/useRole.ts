"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

export interface Role {
  loading: boolean;
  userId: string | null;
  /** True for accounts the organiser created for scoring. Set on the server, users cannot change it. */
  isUmpire: boolean;
}

/** Who is signed in: the organiser or an umpire. Pages use it to hide controls; the database enforces it. */
export function useRole(): Role {
  const [role, setRole] = useState<Role>({ loading: true, userId: null, isUmpire: false });
  useEffect(() => {
    let alive = true;
    getSupabase()
      .auth.getUser()
      .then(({ data }) => {
        if (!alive) return;
        const u = data.user;
        setRole({
          loading: false,
          userId: u?.id ?? null,
          isUmpire: u?.app_metadata?.role === "umpire",
        });
      })
      .catch(() => alive && setRole({ loading: false, userId: null, isUmpire: false }));
    return () => {
      alive = false;
    };
  }, []);
  return role;
}
