import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Project defaults for EloEscola
const DEFAULT_SUPABASE_URL = "https://jaoheenjltzzglfncgfq.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_bpCOfPvR2p5aVpbDMOsCqw_D-E0TlcL";

/**
 * URL efetiva do projeto Supabase (build-time).
 *
 * Parte 2 da auditoria: existia aqui um "override" lido de `localStorage`.
 * Qualquer script na página — inclusive um XSS — podia trocar o endereço do
 * banco e passar a receber os dados que o app enviava. A origem do backend
 * não é configuração de usuário: vem do build (`VITE_SUPABASE_URL`).
 */
export function getEffectiveSupabaseUrl(): string {
  const envUrl =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
    (typeof process !== "undefined" ? process.env?.SUPABASE_URL : "") ||
    DEFAULT_SUPABASE_URL;

  return (envUrl || DEFAULT_SUPABASE_URL).trim();
}

/**
 * Chave publicável (anon) do Supabase, definida no build.
 *
 * Mesmo motivo da URL: a chave não deve ser substituível em tempo de execução.
 * Ela é pública por natureza (a proteção vem das políticas RLS), mas trocá-la
 * em `localStorage` permitiria apontar o app para outro projeto.
 */
export function getEffectiveSupabaseAnonKey(): string {
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
