import { createClient, SupabaseClient } from '@supabase/supabase-js';

// O Vite exige o prefixo VITE_ para expor variáveis no frontend
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  (typeof process !== "undefined" ? process.env?.SUPABASE_URL : "") ||
  "";

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  (typeof process !== "undefined" ? process.env?.SUPABASE_ANON_KEY : "") ||
  "";

// Exporta o cliente oficial do Supabase utilizando o padrão Vite
export const supabase: SupabaseClient = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key"
);

/**
 * Checks if Supabase credentials are set in the environment.
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl !== "https://placeholder.supabase.co"
  );
}

/**
 * Retorna a instância do cliente Supabase.
 */
export function getSupabaseClient(): SupabaseClient {
  return supabase;
}
