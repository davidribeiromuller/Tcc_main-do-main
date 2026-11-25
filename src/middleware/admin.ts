import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.ts';
import { getUserByUid, getUserByEmail } from '../db/users.ts';

/**
 * Verifica se um usuário do banco possui privilégios de Chefe Administrador.
 */
export function checkIsChefe(user: any, tokenUser?: any): boolean {
  const email = (user?.email || tokenUser?.email || '').toLowerCase().trim();
  if (
    email === 'diretoria@helenawysocki.com' ||
    email === 'davidribeiromuller2009@gmail.com'
  ) {
    return true;
  }
  const role = (user?.role || tokenUser?.role || '').trim().toLowerCase();
  if (
    role === 'diretor' ||
    role === 'chefe administrador' ||
    role === 'chefe admin' ||
    role === 'admin chefe'
  ) {
    return true;
  }
  return user?.isAdmin === true || tokenUser?.isAdmin === true;
}

/**
 * Verifica se um usuário possui privilégios de Funcionário Administrador.
 */
export function checkIsFuncionario(user: any, tokenUser?: any): boolean {
  if (checkIsChefe(user, tokenUser)) return false;
  const role = (user?.role || tokenUser?.role || '').trim().toLowerCase();
  return (
    role === 'funcionário' ||
    role === 'funcionario' ||
    role === 'funcionário administrador' ||
    role === 'funcionario administrador'
  );
}

/**
 * Middleware: Exige nível de CHEFE ADMINISTRADOR (acesso total).
 * Ações: Alterar usuários, permissões, níveis de admin, bloquear, desbloquear, excluir.
 */
export const requireChefeAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const userEmail = (req.user.email || '').toLowerCase().trim();
    let dbUser = await getUserByUid(req.user.uid);
    if (!dbUser && userEmail) {
      dbUser = await getUserByEmail(userEmail);
    }

    if (dbUser && dbUser.ativo === false) {
      return res.status(403).json({
        error: 'Sua conta está bloqueada pela administração escolar.',
        blocked: true
      });
    }

    if (checkIsChefe(dbUser, req.user)) {
      (req as any).dbUser = dbUser;
      (req as any).adminRole = 'chefe';
      return next();
    }

    return res.status(403).json({
      error: 'Acesso negado: Esta ação é exclusiva do Chefe Administrador da Escola Estadual Helena Wysocki.'
    });
  } catch (error) {
    console.error('Erro no middleware requireChefeAdmin:', error);
    res.status(500).json({ error: 'Erro interno ao verificar privilégios de Chefe Administrador' });
  }
};

/**
 * Middleware: Permite CHEFE ADMINISTRADOR ou FUNCIONÁRIO ADMINISTRADOR.
 * Ações: Acessar painel administrativo, visualizar diretório de usuários, criar eventos.
 */
export const requireAdminOrStaff = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const userEmail = (req.user.email || '').toLowerCase().trim();
    let dbUser = await getUserByUid(req.user.uid);
    if (!dbUser && userEmail) {
      dbUser = await getUserByEmail(userEmail);
    }

    if (dbUser && dbUser.ativo === false) {
      return res.status(403).json({
        error: 'Sua conta está bloqueada pela administração escolar.',
        blocked: true
      });
    }

    const isChefe = checkIsChefe(dbUser, req.user);
    const isFuncionario = checkIsFuncionario(dbUser, req.user);

    if (isChefe || isFuncionario) {
      (req as any).dbUser = dbUser;
      (req as any).adminRole = isChefe ? 'chefe' : 'funcionario';
      return next();
    }

    return res.status(403).json({
      error: 'Acesso negado: Requer privilégios administrativos da Escola Estadual Helena Wysocki.'
    });
  } catch (error) {
    console.error('Erro no middleware requireAdminOrStaff:', error);
    res.status(500).json({ error: 'Erro interno ao verificar privilégios administrativos' });
  }
};

// Mantém compatibilidade com chamadas anteriores de requireAdmin
export const requireAdmin = requireChefeAdmin;

