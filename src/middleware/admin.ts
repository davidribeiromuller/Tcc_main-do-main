import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.ts';
import { getUserByUid, getUserByEmail } from '../db/users.ts';

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const userEmail = (req.user.email || '').toLowerCase().trim();
    const tokenRole = (req.user as any).role;
    const tokenIsAdmin = (req.user as any).isAdmin;

    if (
      userEmail === 'diretoria@helenawysocki.com' ||
      userEmail === 'davidribeiromuller2009@gmail.com' ||
      tokenIsAdmin === true ||
      tokenRole === 'Diretor'
    ) {
      return next();
    }

    let dbUser = await getUserByUid(req.user.uid);
    if (!dbUser && userEmail) {
      dbUser = await getUserByEmail(userEmail);
    }

    if (
      dbUser &&
      (dbUser.isAdmin ||
        dbUser.role === 'Diretor' ||
        dbUser.email?.toLowerCase().trim() === 'diretoria@helenawysocki.com' ||
        dbUser.email?.toLowerCase().trim() === 'davidribeiromuller2009@gmail.com')
    ) {
      return next();
    }

    return res.status(403).json({
      error: 'Acesso negado: Requer privilégios de Administrador ou Diretor da Escola Estadual Helena Wysocki.'
    });
  } catch (error) {
    console.error('Erro no middleware requireAdmin:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao verificar privilégios de administrador' });
  }
};
