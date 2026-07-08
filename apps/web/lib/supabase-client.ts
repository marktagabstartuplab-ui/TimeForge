import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Browser-side Supabase client for Realtime only — this app authenticates
 * with its own JWTs (not Supabase Auth), so this client never reads/writes
 * tables directly. `null` when Supabase isn't configured (safe no-op).
 */
export const supabase = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;
