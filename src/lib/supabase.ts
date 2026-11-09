import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Created lazily so pages can be built without the environment variables present. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
    }
    client = createClient(url, key);
  }
  return client;
}

/** Turns a Supabase error into a short message, or returns null when there is none. */
export function errorText(error: { message: string } | null | undefined): string | null {
  return error ? error.message : null;
}

let publicClient: SupabaseClient | null = null;

/**
 * Read-only client for the public live pages. It never signs in, so the database treats it as an
 * anonymous visitor even when an admin or user is signed in on the same browser.
 */
export function getPublicSupabase(): SupabaseClient {
  if (!publicClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
    }
    publicClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "shuttle-public" },
    });
  }
  return publicClient;
}
