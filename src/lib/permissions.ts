import { User } from "../types.ts";

export type AdminRole = "chefe" | "funcionario" | "user";

/**
 * Retorna se o usuário possui permissão de Chefe Administrador (acesso total).
 *
 * Parte 2 da auditoria: os e-mails da diretoria estavam HARDCODED aqui, no
 * server e na loja de fallback — privilégio de plataforma embutido no código
 * público. Agora a decisão usa apenas o que está persistido no usuário
 * (`role` e `isAdmin`), administrado pelo painel. A allowlist de proprietário
 * da PLATAFORMA continua existindo, mas só no servidor, via variável de
 * ambiente (`PLATFORM_OWNER_EMAILS`) — nunca versionada.
 */
export function isChefeAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = (user.role || "").trim().toLowerCase();
  if (
    role === "diretor" ||
    role === "chefe administrador" ||
    role === "chefe admin" ||
    role === "admin chefe"
  ) {
    return true;
  }
  return user.isAdmin === true;
}

/**
 * Proprietário da PLATAFORMA (painel Master).
 *
 * Diferente de `isChefeAdmin` (que é por instituição), este papel controla a
 * operação comercial do SaaS. A fonte de verdade é a allowlist do AMBIENTE
 * (`PLATFORM_OWNER_EMAILS`), exposta ao cliente somente como sinalizador de
 * interface — a autorização real é revalidada em cada rota do servidor por
 * `requirePlatformOwner`.
 */
export function getPlatformOwnerEmails(): string[] {
  const raw = (import.meta as any)?.env?.VITE_PLATFORM_OWNER_EMAILS || "";
  return String(raw)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformOwner(user: User | null | undefined): boolean {
  if (!user) return false;
  const email = (user.email || "").trim().toLowerCase();
  if (!email) return false;
  const owners = getPlatformOwnerEmails();
  if (owners.length === 0) return false;
  return owners.includes(email) && isChefeAdmin(user);
}

/**
 * Retorna se o usuário possui permissão de Funcionário Administrador (acesso limitado).
 * Apenas se não for Chefe Administrador.
 */
export function isFuncionarioAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  if (isChefeAdmin(user)) return false;
  const role = (user.role || "").trim().toLowerCase();
  return (
    role === "funcionário" ||
    role === "funcionario" ||
    role === "funcionário administrador" ||
    role === "funcionario administrador"
  );
}

/**
 * Verifica se o usuário tem qualquer nível de acesso administrativo (Chefe ou Funcionário).
 */
export function canAccessAdminPanel(user: User | null | undefined): boolean {
  return isChefeAdmin(user) || isFuncionarioAdmin(user);
}

/**
 * Retorna o nível de permissão categorizado.
 */
export function getAdminRoleType(user: User | null | undefined): AdminRole {
  if (isChefeAdmin(user)) return "chefe";
  if (isFuncionarioAdmin(user)) return "funcionario";
  return "user";
}

/**
 * Rótulo amigável em português para exibição nas tabelas e crachás.
 */
export function getRoleBadgeLabel(role?: string, isAdmin?: boolean): string {
  const clean = (role || "").trim();
  const lower = clean.toLowerCase();
  if (lower === "diretor" || lower === "chefe administrador" || isAdmin) {
    return "Chefe Administrador";
  }
  if (
    lower === "funcionário" ||
    lower === "funcionario" ||
    lower === "funcionário administrador" ||
    lower === "funcionario administrador"
  ) {
    return "Funcionário Administrador";
  }
  return clean || "Aluno";
}
