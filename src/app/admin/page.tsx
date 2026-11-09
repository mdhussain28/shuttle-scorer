"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icon";
import { Segmented } from "@/components/Segmented";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { DataCleanup } from "@/components/admin/DataCleanup";
import { AdminTournaments } from "@/components/admin/AdminTournaments";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { fetchUsers } from "@/lib/adminApi";
import type { AdminUser, MatchLite, TournamentLite } from "@/lib/adminTypes";
import { getSupabase } from "@/lib/supabase";
import { useRole } from "@/lib/useRole";

type Tab = "overview" | "users" | "tournaments";

function AdminContent() {
  const role = useRole();
  const [tab, setTab] = useState<Tab>("overview");
  const [tournaments, setTournaments] = useState<TournamentLite[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [matches, setMatches] = useState<MatchLite[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [meId, setMeId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const sb = getSupabase();
    const [t, c, m] = await Promise.all([
      sb.from("tournaments").select("id,name,venue,start_date,created_at,expires_at").order("created_at", { ascending: false }),
      sb.from("categories").select("id,tournament_id"),
      sb.from("matches").select("id,tournament_id,status,a_label,b_label,sets_a,sets_b,created_at").order("created_at", { ascending: false }),
    ]);
    const failure = t.error ?? c.error ?? m.error;
    if (failure) setErr(failure.message);
    setTournaments((t.data ?? []) as TournamentLite[]);
    const counts: Record<string, number> = {};
    for (const row of (c.data ?? []) as Array<{ tournament_id: string }>) {
      counts[row.tournament_id] = (counts[row.tournament_id] ?? 0) + 1;
    }
    setCategoryCounts(counts);
    setMatches((m.data ?? []) as MatchLite[]);
    try {
      const res = await fetchUsers();
      setUsers(res.users);
      setMeId(res.me);
      if (!failure) setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!role.loading && role.isAdmin) void load();
    if (!role.loading && !role.isAdmin) setLoading(false);
  }, [role.loading, role.isAdmin, load]);

  if (role.loading || loading) return <p className="text-sm text-neutral-500">Loading…</p>;

  if (!role.isAdmin) {
    return (
      <div className="card mx-auto max-w-md space-y-3 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
          <Icon name="lock" size={20} />
        </span>
        <p className="font-semibold">Admins only</p>
        <p className="text-sm text-neutral-500">Your account does not have access to the admin console.</p>
        <Link href="/dashboard" className="btn btn-primary">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[16rem] flex-1">
          <Segmented
            ariaLabel="Admin sections"
            value={tab}
            onChange={setTab}
            options={[
              { value: "overview" as Tab, label: "Overview" },
              { value: "users" as Tab, label: "Users" },
              { value: "tournaments" as Tab, label: "Tournaments" },
            ]}
          />
        </div>
        <button className="btn btn-secondary" onClick={() => void load()}>
          <Icon name="refresh" size={14} />
          Refresh
        </button>
      </div>

      {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}

      {tab === "overview" && (
        <>
          <AdminOverview tournaments={tournaments} matches={matches} users={users} />
          <DataCleanup
            tournaments={tournaments.length}
            matches={matches.length}
            casual={matches.filter((m) => m.tournament_id === null).length}
            onDone={load}
          />
        </>
      )}
      {tab === "users" && <AdminUsers users={users} tournaments={tournaments} meId={meId} onChanged={load} />}
      {tab === "tournaments" && (
        <AdminTournaments
          tournaments={tournaments}
          categoryCounts={categoryCounts}
          matches={matches}
          users={users}
          onChanged={load}
        />
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <Shell title="Admin console" back="/dashboard">
      <AdminContent />
    </Shell>
  );
}
