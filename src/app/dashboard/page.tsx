"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icon";
import { getSupabase } from "@/lib/supabase";
import { useRole } from "@/lib/useRole";
import type { MatchRow, Tournament } from "@/lib/types";
import { daysLeft, fmtDate, scoreLine } from "@/lib/format";

type CasualItem = Pick<
  MatchRow,
  "id" | "a_label" | "b_label" | "status" | "set_scores" | "sets_a" | "sets_b" | "created_at" | "expires_at"
>;

function HomeContent() {
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [casual, setCasual] = useState<CasualItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const role = useRole();

  useEffect(() => {
    const sb = getSupabase();
    (async () => {
      const [t, c] = await Promise.all([
        sb.from("tournaments").select("*").order("created_at", { ascending: false }),
        sb
          .from("matches")
          .select("id,a_label,b_label,status,set_scores,sets_a,sets_b,created_at,expires_at")
          .is("tournament_id", null)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      const failure = t.error ?? c.error;
      if (failure) setErr(failure.message);
      setTournaments((t.data ?? []) as Tournament[]);
      setCasual((c.data ?? []) as CasualItem[]);
    })();
  }, []);

  const allActions = [
    {
      href: "/tournaments/new",
      art: "/art/trophy.svg",
      title: "New tournament",
      text: "Categories, pools, rankings and knockout rounds",
    },
    {
      href: "/match/new",
      art: "/art/shuttle.svg",
      title: "Casual match",
      text: "Score a single game without any setup",
    },
    {
      href: "/admin",
      art: "/art/admin.png",
      title: "Admin console",
      text: "Users, access and every tournament in one place",
    },
  ];

  // What a user sees depends on what the admin allowed: hosting, adding umpires, or scoring only.
  const actions = allActions.filter((a) =>
    a.href === "/admin" ? role.isAdmin : a.href === "/match/new" ? true : role.canHost,
  );

  return (
    <div className="space-y-8">
      {actions.length > 0 && (
      <div className="stagger grid gap-3 sm:grid-cols-3">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="card group flex items-center gap-4"
          >
            <img
              src={a.art}
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 shrink-0 rounded-2xl shadow-md shadow-brand-900/20 transition duration-300 group-hover:-rotate-3 group-hover:scale-110"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{a.title}</span>
              <span className="block text-sm text-neutral-500">{a.text}</span>
            </span>
            <Icon name="chevron-right" className="text-neutral-400" />
          </Link>
        ))}
      </div>
      )}

      {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}

      <section>
        <h2 className="section-title mb-3">Tournaments</h2>
        {tournaments === null ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : tournaments.length === 0 ? (
          <div className="card text-center text-sm text-neutral-500">
            <img src="/art/calendar.png" alt="" width={56} height={56} className="mx-auto mb-2 h-14 w-14" />
            {!role.canHost
              ? "You have not been added to a tournament yet. Ask an admin or the tournament host to add you."
              : "No tournaments yet. Create your first one above."}
          </div>
        ) : (
          <ul className="stagger space-y-2">
            {tournaments.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tournaments/${t.id}`}
                  className="card flex items-center gap-3 !p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{t.name}</p>
                    <p className="truncate text-xs text-neutral-500">
                      {[t.venue, fmtDate(t.start_date)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="badge badge-neutral">
                    <Icon name="clock" size={12} />
                    {daysLeft(t.expires_at)} days left
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="section-title mb-3">Recent casual matches</h2>
        {casual === null ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : casual.length === 0 ? (
          <div className="card text-center text-sm text-neutral-500"><img src="/art/racket.png" alt="" width={72} height={60} className="mx-auto mb-2 h-14 w-auto" />No casual matches yet.</div>
        ) : (
          <ul className="stagger space-y-2">
            {casual.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/match/${m.id}`}
                  className="card flex items-center gap-3 !p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {m.a_label} <span className="font-normal text-neutral-400">vs</span> {m.b_label}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {m.set_scores.length ? scoreLine(m.set_scores) : "Not started"} · {fmtDate(m.created_at)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    {m.sets_a}–{m.sets_b}
                  </span>
                  <span className={`badge ${m.status === "live" ? "badge-amber" : "badge-green"}`}>
                    {m.status === "live" ? (
                            <>
                              <span className="h-1.5 w-1.5 animate-glow rounded-full bg-amber-500" />
                              Live
                            </>
                          ) : (
                            "Final"
                          )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Shell title="Dashboard">
      <HomeContent />
    </Shell>
  );
}
