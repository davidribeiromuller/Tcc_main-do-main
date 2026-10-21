import { User } from "../types.ts";

export type AdminRole = "chefe" | "funcionario" | "user";

/**
 * Retorna se o usuário possui permissão de Chefe Administrador (acesso total).
 * Considera:
 * - Emails canônicos da diretoria (davidribeiromuller2009@gmail.com, diretoria@helenawysocki.com)
 * - Papel no banco: "Diretor", "Chefe Administrador"
 * - Flag de sistema: isAdmin === true
 */
export function isChefeAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  const cleanEmail = (user.email || "").toLowerCase().trim();
  if (
    cleanEmail === "davidribeiromuller2009@gmail.com" ||
    cleanEmail === "diretoria@helenawysocki.com"
  ) {
    return true;
  }
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
