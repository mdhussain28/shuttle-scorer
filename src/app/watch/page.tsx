"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// The public home page lives at "/". This keeps old /watch links working.
export default function WatchRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
