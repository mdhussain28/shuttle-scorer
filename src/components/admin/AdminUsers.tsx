"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { Segmented } from "@/components/Segmented";
import { Credentials, type Shown } from "@/components/admin/Credentials";
import { ExpiryPicker, NEVER, resolveExpiry, type ExpiryChoice } from "@/components/admin/ExpiryPicker";
import { createUser, deleteUser, updateUser } from "@/lib/adminApi";
import type { AdminUser, TournamentLite } from "@/lib/adminTypes";
import { fmtDateTime, timeLeft } from "@/lib/format";
import { makePassword } from "@/lib/password";
import { getSupabase } from "@/lib/supabase";

function initial(email: string): string {
  return (email.trim()[0] ?? "?").toUpperCase();
}

function StatusBadge({ user }: { user: AdminUser }) {
  if (!user.expiresAt) return <span className="badge badge-green">Active</span>;
  const gone = new Date(user.expiresAt).getTime() <= Date.now();
  return gone ? (
    <span className="badge badge-red">Expired</span>
  ) : (
    <span className="badge badge-amber">
      <Icon name="clock" size={12} />
      Deleted {timeLeft(user.expiresAt)}
    </span>
  );
}

export function AdminUsers({
  users,
  tournaments,
  meId,
  onChanged,
}: {
  users: AdminUser[];
  tournaments: TournamentLite[];
  meId: string;
  onChanged: () => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);

  // create form
  const [role, setRole] = useState<"user" | "admin">("user");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => makePassword());
  const [expiry, setExpiry] = useState<ExpiryChoice>(NEVER);
  const [assign, setAssign] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // per-user expiry editor
  const [editExpiry, setEditExpiry] = useState<ExpiryChoice>(NEVER);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? users.filter((u) => u.email.toLowerCase().includes(q)) : users;
  }, [users, query]);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setErr(null);
    const when = resolveExpiry(expiry);
    if (when === "invalid") return setErr("Choose a deletion date and time in the future.");
    setBusy(true);
    try {
      await createUser({
        email: email.trim(),
        password,
        role,
        expiresAt: when,
        tournamentIds: role === "user" ? assign : [],
      });
      setShown({
        title: role === "admin" ? "Admin account created." : "User account created.",
        email: email.trim().toLowerCase(),
        password,
        note:
          (when ? `This account will be deleted ${timeLeft(when)}. ` : "") +
          "The password is shown only now. You can set a new one later if it is lost.",
      });
      setEmail("");
      setPassword(makePassword());
      setExpiry(NEVER);
      setAssign([]);
      setCreating(false);
      await onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleAccess(u: AdminUser, tid: string, on: boolean) {
    setErr(null);
    const sb = getSupabase();
    const res = on
      ? await sb.from("tournament_members").insert({ tournament_id: tid, user_id: u.id, email: u.email })
      : await sb.from("tournament_members").delete().eq("tournament_id", tid).eq("user_id", u.id);
    if (res.error) return setErr(res.error.message);
    await onChanged();
  }

  async function saveExpiry(u: AdminUser) {
    setErr(null);
    const when = resolveExpiry(editExpiry);
    if (when === "invalid") return setErr("Choose a deletion date and time in the future.");
    try {
      await updateUser({ userId: u.id, expiresAt: when });
      await onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function clearExpiry(u: AdminUser) {
    setErr(null);
    try {
      await updateUser({ userId: u.id, expiresAt: null });
      setEditExpiry(NEVER);
      await onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function resetPassword(u: AdminUser) {
    if (!confirm(`Set a new password for ${u.email}? Their current password stops working.`)) return;
    setErr(null);
    const next = makePassword();
    try {
      await updateUser({ userId: u.id, password: next });
      setShown({ title: "New password set.", email: u.email, password: next });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function remove(u: AdminUser) {
    if (
      !confirm(
        `Delete ${u.email}? They are signed out and can no longer log in. Matches they scored are kept.`,
      )
    )
      return;
    setErr(null);
    try {
      await deleteUser(u.id);
      setOpen(null);
      await onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  function toggleOpen(u: AdminUser) {
    if (open === u.id) return setOpen(null);
    setOpen(u.id);
    setEditExpiry(NEVER);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[12rem] flex-1">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            className="input !pl-9"
            placeholder="Search by email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search users"
          />
        </div>
        <button className="btn btn-primary" onClick={() => setCreating((c) => !c)}>
          <Icon name={creating ? "x" : "user-plus"} size={16} />
          {creating ? "Close" : "Add user"}
        </button>
      </div>

      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}
      {shown && <Credentials shown={shown} onHide={() => setShown(null)} />}

      {creating && (
        <form onSubmit={submit} className="card space-y-4">
          <h3 className="font-semibold">New account</h3>
          <div>
            <label className="label">Account type</label>
            <Segmented
              ariaLabel="Account type"
              value={role}
              onChange={setRole}
              options={[
                { value: "user" as const, label: "User (scores matches)" },
                { value: "admin" as const, label: "Admin (full access)" },
              ]}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="new-email">Email</label>
              <input
                id="new-email"
                className="input"
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="new-password">Password</label>
              <div className="flex gap-2">
                <input
                  id="new-password"
                  className="input font-mono"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" className="btn btn-secondary shrink-0" onClick={() => setPassword(makePassword())}>
                  <Icon name="refresh" size={14} />
                  New
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="new-expiry">Delete this account automatically</label>
            <ExpiryPicker id="new-expiry" value={expiry} onChange={setExpiry} />
            <p className="mt-1.5 text-xs text-neutral-500">
              After this time the account loses access straight away and is then deleted. Matches it scored are kept.
            </p>
          </div>
          {role === "user" && (
            <div>
              <label className="label">Tournaments this user can score</label>
              {tournaments.length === 0 ? (
                <p className="text-sm text-neutral-500">No tournaments yet. You can assign them later.</p>
              ) : (
                <ul className="max-h-44 divide-y divide-neutral-100 overflow-y-auto rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                  {tournaments.map((t) => (
                    <li key={t.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                        <input
                          type="checkbox"
                          checked={assign.includes(t.id)}
                          onChange={(e) =>
                            setAssign(e.target.checked ? [...assign, t.id] : assign.filter((x) => x !== t.id))
                          }
                        />
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <button className="btn btn-primary w-full" disabled={busy}>
            <Icon name="user-plus" size={16} />
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>
      )}

      <div className="card !p-0">
        {list.length === 0 ? (
          <p className="p-5 text-sm text-neutral-500">{users.length === 0 ? "No accounts yet." : "No accounts match your search."}</p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {list.map((u) => {
              const isOpen = open === u.id;
              const self = u.id === meId;
              return (
                <li key={u.id}>
                  <button
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                    onClick={() => toggleOpen(u)}
                    aria-expanded={isOpen}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {initial(u.email)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{u.email}</span>
                        {self && <span className="badge badge-neutral">You</span>}
                      </span>
                      <span className="block truncate text-xs text-neutral-500">
                        {u.role === "admin"
                          ? "Full access to everything"
                          : `${u.tournamentIds.length} ${u.tournamentIds.length === 1 ? "tournament" : "tournaments"}`}
                        {" · "}
                        {u.lastSignInAt ? `Last sign-in ${fmtDateTime(u.lastSignInAt)}` : "Never signed in"}
                      </span>
                    </span>
                    <span className={`badge ${u.role === "admin" ? "badge-green" : "badge-neutral"}`}>
                      <Icon name={u.role === "admin" ? "shield" : "user"} size={12} />
                      {u.role === "admin" ? "Admin" : "User"}
                    </span>
                    <span className="hidden sm:block">
                      <StatusBadge user={u} />
                    </span>
                    <Icon name={isOpen ? "chevron-down" : "chevron-right"} className="text-neutral-400" />
                  </button>

                  {isOpen && (
                    <div className="space-y-5 border-t border-neutral-100 bg-neutral-50/60 px-4 py-4 dark:border-neutral-800 dark:bg-neutral-950/30">
                      <div className="sm:hidden">
                        <StatusBadge user={u} />
                      </div>

                      {u.role === "user" && (
                        <div>
                          <p className="section-title mb-2">Tournament access</p>
                          {tournaments.length === 0 ? (
                            <p className="text-sm text-neutral-500">There are no tournaments yet.</p>
                          ) : (
                            <ul className="max-h-48 divide-y divide-neutral-100 overflow-y-auto rounded-lg border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
                              {tournaments.map((t) => (
                                <li key={t.id}>
                                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={u.tournamentIds.includes(t.id)}
                                      onChange={(e) => void toggleAccess(u, t.id, e.target.checked)}
                                    />
                                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                                  </label>
                                </li>
                              ))}
                            </ul>
                          )}
                          {u.tournamentIds.some((id) => !tournaments.some((t) => t.id === id)) && (
                            <p className="mt-1 text-xs text-neutral-500">
                              Also linked to {u.tournamentIds.filter((id) => !tournaments.some((t) => t.id === id)).length} tournament(s) that no longer exist.
                            </p>
                          )}
                        </div>
                      )}

                      <div>
                        <p className="section-title mb-2">Automatic deletion</p>
                        <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">
                          {u.expiresAt
                            ? `This account will be deleted on ${fmtDateTime(u.expiresAt)} (${timeLeft(u.expiresAt)}).`
                            : "This account is kept until you delete it."}
                        </p>
                        {self ? (
                          <p className="text-xs text-neutral-500">You cannot set a deletion time on your own account.</p>
                        ) : (
                          <div className="flex flex-wrap items-start gap-2">
                            <div className="min-w-[14rem] flex-1">
                              <ExpiryPicker id={`exp-${u.id}`} value={editExpiry} onChange={setEditExpiry} />
                            </div>
                            <button className="btn btn-secondary" onClick={() => void saveExpiry(u)}>
                              <Icon name="clock" size={14} />
                              Set time
                            </button>
                            {u.expiresAt && (
                              <button className="btn btn-ghost" onClick={() => void clearExpiry(u)}>
                                Keep account
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
                        <button className="btn btn-secondary" onClick={() => void resetPassword(u)}>
                          <Icon name="key" size={14} />
                          Reset password
                        </button>
                        <button
                          className="btn btn-secondary text-red-700 dark:text-red-400"
                          disabled={self}
                          onClick={() => void remove(u)}
                        >
                          <Icon name="trash" size={14} />
                          Delete account
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
