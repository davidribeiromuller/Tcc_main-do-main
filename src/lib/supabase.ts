import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClientInstance: SupabaseClient | null = null;

/**
 * Checks if Supabase credentials are set in the environment.
 */
export function isSupabaseConfigured(): boolean {
  const supabaseUrl = (typeof process !== "undefined" && process.env?.SUPABASE_URL) ||
    (typeof window !== "undefined" && (window as any)._env_?.VITE_SUPABASE_URL) ||
    ((import.meta as any).env && (import.meta as any).env.VITE_SUPABASE_URL) ||
    "";
    
  const supabaseAnonKey = (typeof process !== "undefined" && process.env?.SUPABASE_ANON_KEY) ||
    (typeof window !== "undefined" && (window as any)._env_?.VITE_SUPABASE_ANON_KEY) ||
    ((import.meta as any).env && (import.meta as any).env.VITE_SUPABASE_ANON_KEY) ||
    "";

  return !!(supabaseUrl && supabaseAnonKey);
}

/**
 * Lazily initializes and returns the Supabase client.
 * Does not crash at module load if credentials are missing.
 */
export function getSupabaseClient(): SupabaseClient {
  if (supabaseClientInstance) {
    return supabaseClientInstance;
  }

  const supabaseUrl = (typeof process !== "undefined" && process.env?.SUPABASE_URL) ||
    (typeof window !== "undefined" && (window as any)._env_?.VITE_SUPABASE_URL) ||
    ((import.meta as any).env && (import.meta as any).env.VITE_SUPABASE_URL) ||
    "";
    
  const supabaseAnonKey = (typeof process !== "undefined" && process.env?.SUPABASE_ANON_KEY) ||
    (typeof window !== "undefined" && (window as any)._env_?.VITE_SUPABASE_ANON_KEY) ||
    ((import.meta as any).env && (import.meta as any).env.VITE_SUPABASE_ANON_KEY) ||
    "";

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase credentials are not configured. Please define SUPABASE_URL and SUPABASE_ANON_KEY."
    );
  }

  supabaseClientInstance = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClientInstance;
}
