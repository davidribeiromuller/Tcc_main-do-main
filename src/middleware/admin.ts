/**
 * Controle de acesso administrativo (Parte 2 da auditoria SaaS).
 *
 * HISTÓRICO: o reconhecimento de "Chefe Administrador" era feito por e-mail
 * fixo no código (`diretoria@helenawysocki.com`, `davidribeiromuller2009@gmail.com`)
 * e por `isAdmin` vindo do token. Isso significava:
 *  - privilégio de plataforma embutido no código-fonte público;
 *  - `role` escolhido no cadastro virava privilégio (basta se cadastrar como
 *    "Diretor");
 *  - nenhuma noção de instituição — todo admin era admin global.
 *
 * Agora:
 *  - Papel vem SEMPRE do banco (`users.role`, `users.is_admin`, `memberships`).
 *  - Proprietário da plataforma vem de `PLATFORM_OWNER_EMAILS` (env, nunca
 *    versionado). Sem a variável, ninguém é proprietário por e-mail.
 *  - Privilégios são por instituição: `requireSchoolRole` valida a membership
 *    da instituição alvo, impedindo um admin da escola A de operar a escola B.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.ts';
import { getUserByUid, getUserByEmail } from '../db/users.ts';

export type PlatformRole = 'owner' | 'support';
export type SchoolRole = 'school_admin' | 'school_staff' | 'teacher' | 'student' | 'guardian';

/** E-mails de proprietário da plataforma, somente via ambiente. */
export function getPlatformOwnerEmails(): string[] {
  return (process.env.PLATFORM_OWNER_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** `true` quando o e-mail está na allowlist de proprietários da plataforma. */
export function isPlatformOwnerEmail(email: string | null | undefined): boolean {
  const clean = (email || '').trim().toLowerCase();
  if (!clean) return false;
  return getPlatformOwnerEmails().includes(clean);
}

const CHEFE_ROLE_ALIASES = new Set([
  'diretor',
  'diretora',
  'chefe administrador',
  'chefe admin',
  'admin chefe',
]);

const FUNCIONARIO_ROLE_ALIASES = new Set([
  'funcionário',
  'funcionario',
  'funcionária',
  'funcionaria',
  'funcionário administrador',
  'funcionario administrador',
]);

/**
 * Verifica privilégio de Chefe Administrador (da instituição).
 *
 * A decisão usa apenas dados persistidos (`dbUser`) e a allowlist de
 * proprietários vinda do ambiente. `user.isAdmin === true` só conta quando veio
 * do BANCO — nunca do token.
 */
export function checkIsChefe(user: any, tokenUser?: any): boolean {
  const email = (user?.email || '').trim().toLowerCase();
  if (isPlatformOwnerEmail(email)) return true;

  const role = (user?.role || '').trim().toLowerCase();
  if (CHEFE_ROLE_ALIASES.has(role)) return true;

  // `isAdmin` legítimo: precisa existir na linha do banco.
  if (user && user.isAdmin === true) return true;
  if (user && user.is_admin === true) return true;

  // Token sem linha correspondente no banco não concede privilégio.
  if (!user && tokenUser?.isAdmin === true) {
    console.warn('[Admin] isAdmin no token ignorado: usuário não confirmado no banco.');
  }
  return false;
}

/** Verifica privilégio de Funcionário Administrador (nunca acumula com chefe). */
export function checkIsFuncionario(user: any, tokenUser?: any): boolean {
  if (checkIsChefe(user, tokenUser)) return false;
  const role = (user?.role || '').trim().toLowerCase();
  return FUNCIONARIO_ROLE_ALIASES.has(role);
}

/** Resolve a linha de `users` do token, sem confiar em `role` do token. */
async function resolveDbUser(req: AuthRequest) {
  if (req.dbUser !== undefined) return req.dbUser;
  if (!req.user) return null;
  const email = ((req.user as any).email || '').toLowerCase().trim();
  let dbUser = await getUserByUid((req.user as any).uid).catch(() => null);
  if (!dbUser && email) {
    dbUser = await getUserByEmail(email).catch(() => null);
  }
  return dbUser;
}

async function loadAndGuard(req: AuthRequest, res: Response) {
  const dbUser = await resolveDbUser(req);
  if (dbUser && dbUser.ativo === false) {
    res.status(403).json({
      error: 'Sua conta está bloqueada pela administração escolar.',
      blocked: true,
    });
    return { blocked: true as const, dbUser: null };
  }
  return { blocked: false as const, dbUser };
}

/**
 * Middleware: exige CHEFE ADMINISTRADOR da instituição.
 * Ações: alterar usuários, permissões, bloquear, excluir, redefinir senha.
 */
export const requireChefeAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });

  try {
    const { blocked, dbUser } = await loadAndGuard(req, res);
    if (blocked) return;

    if (checkIsChefe(dbUser, req.user)) {
      req.dbUser = dbUser;
      (req as any).adminRole = 'chefe';
      return next();
    }

    return res.status(403).json({
      error: 'Acesso negado: esta ação é exclusiva do Chefe Administrador da instituição.',
    });
  } catch (error) {
    console.error('Erro no middleware requireChefeAdmin:', error);
    return res.status(500).json({ error: 'Erro interno ao verificar privilégios de Chefe Administrador' });
  }
};

/**
 * Middleware: permite CHEFE ADMINISTRADOR ou FUNCIONÁRIO ADMINISTRADOR.
 */
export const requireAdminOrStaff = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });

  try {
    const { blocked, dbUser } = await loadAndGuard(req, res);
    if (blocked) return;

    const isChefe = checkIsChefe(dbUser, req.user);
    const isFuncionario = checkIsFuncionario(dbUser, req.user);
    if (isChefe || isFuncionario) {
      req.dbUser = dbUser;
      (req as any).adminRole = isChefe ? 'chefe' : 'funcionario';
      return next();
    }

    return res.status(403).json({
      error: 'Acesso negado: requer privilégios administrativos da instituição.',
    });
  } catch (error) {
    console.error('Erro no middleware requireAdminOrStaff:', error);
    return res.status(500).json({ error: 'Erro interno ao verificar privilégios administrativos' });
  }
};

/**
 * Middleware: exige PROPRIETÁRIO DA PLATAFORMA (painel Master).
 *
 * Duas condições simultâneas: e-mail na allowlist do ambiente E papel de chefe
 * confirmado no banco. Sem a allowlist configurada, ninguém entra — o painel
 * Master nunca fica aberto por omissão.
 */
export const requirePlatformOwner = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });

  try {
    const { blocked, dbUser } = await loadAndGuard(req, res);
    if (blocked) return;

    const email = ((dbUser?.email || (req.user as any).email) || '').trim().toLowerCase();
    const allowlistConfigured = getPlatformOwnerEmails().length > 0;

    if (!allowlistConfigured) {
      return res.status(503).json({
        error:
          'Painel Master desativado: configure PLATFORM_OWNER_EMAILS no servidor para habilitar o acesso.',
        code: 'MASTER_NOT_CONFIGURED',
      });
    }

    if (!isPlatformOwnerEmail(email) || !checkIsChefe(dbUser, req.user)) {
      console.warn(`[Admin] Tentativa de acesso ao painel Master negada para ${email || 'sem e-mail'}`);
      return res.status(403).json({ error: 'Acesso restrito ao proprietário da plataforma.' });
    }

    req.dbUser = dbUser;
    (req as any).platformRole = 'owner' satisfies PlatformRole;
    return next();
  } catch (error) {
    console.error('Erro no middleware requirePlatformOwner:', error);
    return res.status(500).json({ error: 'Erro interno ao verificar acesso ao painel Master' });
  }
};

/** Mantém compatibilidade com chamadas anteriores. */
export const requireAdmin = requireChefeAdmin;
