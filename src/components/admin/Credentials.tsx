"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

export interface Shown {
  title: string;
  email: string;
  password: string;
  note?: string;
}

/** Login details to hand to a user. The password is only known right after it is set. */
export function Credentials({ shown, onHide }: { shown: Shown; onHide: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = [
      "Shuttle Scorer login",
      `Website: ${window.location.origin}/login`,
      "Sign in as: User",
      `Email: ${shown.email}`,
      `Password: ${shown.password}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm dark:border-green-900 dark:bg-green-950/30">
      <p className="flex items-center gap-2 font-medium text-green-900 dark:text-green-200">
        <Icon name="check" size={16} />
        {shown.title}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-neutral-500">Email</dt>
        <dd className="break-all font-mono">{shown.email}</dd>
        <dt className="text-neutral-500">Password</dt>
        <dd className="break-all font-mono">{shown.password}</dd>
      </dl>
      <p className="text-xs text-neutral-500">
        {shown.note ?? "The password is shown only now. You can set a new one later if it is lost."}
      </p>
      <div className="flex gap-2">
        <button className="btn btn-secondary btn-sm" onClick={() => void copy()}>
          <Icon name={copied ? "check" : "copy"} size={14} />
          {copied ? "Copied" : "Copy login details"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onHide}>
          Hide
        </button>
      </div>
    </div>
  );
}
