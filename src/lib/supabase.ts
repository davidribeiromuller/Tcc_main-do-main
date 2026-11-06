import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Project defaults for EloEscola
const DEFAULT_SUPABASE_URL = "https://jaoheenjltzzglfncgfq.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_bpCOfPvR2p5aVpbDMOsCqw_D-E0TlcL";

/**
 * Retrieves the effective Supabase URL from environment or localStorage override.
 */
export function getEffectiveSupabaseUrl(): string {
  if (typeof window !== "undefined") {
    try {
      const override = window.localStorage?.getItem("ELOESCOLA_OVERRIDE_SUPABASE_URL");
      if (override && override.startsWith("https://") && override.includes(".supabase.co")) {
        return override.trim();
      }
    } catch (_) {}
  }

  const envUrl =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
    (typeof process !== "undefined" ? process.env?.SUPABASE_URL : "") ||
    DEFAULT_SUPABASE_URL;

  return (envUrl || DEFAULT_SUPABASE_URL).trim();
}

/**
 * Retrieves the effective Supabase Anon/Publishable Key from environment or localStorage override.
 */
export function getEffectiveSupabaseAnonKey(): string {
  if (typeof window !== "undefined") {
    try {
      const override = window.localStorage?.getItem("ELOESCOLA_OVERRIDE_SUPABASE_ANON_KEY");
      if (override && override.length > 20) {
        return override.trim();
      }
    } catch (_) {}
  }

  const envKey =
    (typeof import.meta !== "undefined" && (import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY)) ||
    (typeof process !== "undefined" ? (process.env?.SUPABASE_PUBLISHABLE_KEY || process.env?.SUPABASE_ANON_KEY) : "") ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY;

  return (envKey || DEFAULT_SUPABASE_PUBLISHABLE_KEY).trim();
}

let cachedClient: SupabaseClient | null = null;
let cachedUrl = "";
let cachedKey = "";

/**
 * Checks if Supabase credentials are configured with a real project.
 */
export function isSupabaseConfigured(): boolean {
  const url = getEffectiveSupabaseUrl();
  const key = getEffectiveSupabaseAnonKey();
  return !!(
    url &&
    key &&
    url.startsWith("https://") &&
    url.includes(".supabase.co") &&
    !url.includes("placeholder") &&
    !url.includes("[ID_DO_SEU_PROJETO]")
  );
}

/**
 * Returns or creates the singleton Supabase client instance.
 */
export function getSupabaseClient(): SupabaseClient {
  const url = getEffectiveSupabaseUrl();
  const key = getEffectiveSupabaseAnonKey();

  const safeUrl = isSupabaseConfigured() ? url : "https://placeholder.supabase.co";
  const safeKey = isSupabaseConfigured() ? key : "placeholder-anon-key";

  if (!cachedClient || cachedUrl !== safeUrl || cachedKey !== safeKey) {
    cachedUrl = safeUrl;
    cachedKey = safeKey;
    cachedClient = createClient(safeUrl, safeKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return cachedClient;
}

// Export default singleton for direct usage
export const supabase = getSupabaseClient();
