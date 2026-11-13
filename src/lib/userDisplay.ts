import type { User } from "../types.ts";

/**
 * Nome de exibição do usuário.
 *
 * Regras (nesta ordem):
 *  1. Sessão de convidado/visitante → sempre "Convidado".
 *     Nunca derivar do e-mail: `visitante_48213@eloescola.local` aparecia
 *     como "visitante_48213" no perfil.
 *  2. Nome cadastrado.
 *  3. Parte local do e-mail, com separadores convertidos em espaço.
 *  4. Rótulo genérico.
 */
export function getUserDisplayName(
  user?: Partial<User> | null,
  fallback = "Usuário"
): string {
  if (!user) return fallback;

  if (isGuestSession(user)) return "Convidado";

  const nome = (user.nome || "").trim();
  if (nome) return nome;

  const email = (user.email || "").trim();
  if (email.includes("@")) {
    const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
    // E-mails gerados pelo app não servem como nome.
    if (local && !/^visitante[_\s-]?\d+$/i.test(local)) {
      return local;
    }
  }

  return fallback;
}

/** Iniciais para o avatar, sem nunca cair em dígitos de e-mail. */
export function getUserInitials(user?: Partial<User> | null): string {
  const nome = getUserDisplayName(user, "U");
  return nome.slice(0, 2).toUpperCase();
}

/** true quando a sessão é de convidado/visitante (sem conta real). */
export function isGuestSession(user?: Partial<User> | null): boolean {
  if (!user) return false;
  if (user.isGuest === true) return true;
  if ((user.role || "").toLowerCase() === "convidado") return true;
  const uid = String(user.uid || "");
  const email = String(user.email || "");
  return uid.startsWith("guest-") || /^visitante_\d+@/i.test(email);
}
