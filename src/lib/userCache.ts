import type { User } from "../types";

/**
 * Cache local do diretório de usuários (`local_users_db`).
 *
 * Regra de segurança (Rodada 4): dados sensíveis de perfil — senha, CPF e
 * telefone — NUNCA são persistidos no `localStorage`. A gestão desses dados é
 * exclusiva do Chefe Administrador e deve vir do backend/Supabase autenticado,
 * não de um cache acessível a qualquer sessão do navegador.
 */
export const LOCAL_USERS_CACHE_KEY = "local_users_db";

/** Campos que jamais podem ser gravados no cache do navegador. */
const SENSITIVE_FIELDS = ["password", "cpf", "phone", "personalEmail"] as const;

/**
 * Remove os campos sensíveis do usuário antes de persistir/transportar.
 * O chefe recebe esses dados pela API autenticada, não pelo cache.
 */
export function stripSensitiveUserFields<T extends Partial<User>>(user: T): T {
  const clone: any = { ...user };
  for (const field of SENSITIVE_FIELDS) {
    delete clone[field];
  }
  return clone as T;
}

/** Higieniza uma lista inteira de usuários para persistência local. */
export function stripSensitiveFieldsFromList(users: Partial<User>[]): Partial<User>[] {
  return users.map(stripSensitiveUserFields);
}

/** Grava o diretório de usuários no cache local, sem dados sensíveis. */
export function saveUsersCache(users: Partial<User>[]): void {
  try {
    localStorage.setItem(LOCAL_USERS_CACHE_KEY, JSON.stringify(stripSensitiveFieldsFromList(users)));
  } catch {
    // Cache é best-effort: falha de quota/modo privado não deve quebrar o app.
  }
}

/**
 * Lê o diretório de usuários do cache local.
 * Higieniza na leitura para também limpar caches antigos já gravados.
 */
export function readUsersCache(): Partial<User>[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const cleaned = stripSensitiveFieldsFromList(parsed);
    // Limpa retroativamente caches gravados antes da correção.
    localStorage.setItem(LOCAL_USERS_CACHE_KEY, JSON.stringify(cleaned));
    return cleaned;
  } catch {
    return null;
  }
}
