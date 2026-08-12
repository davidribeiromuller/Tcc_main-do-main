import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.ts';
import { getUserByUid } from '../db/users.ts';

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const dbUser = await getUserByUid(req.user.uid);
    if (!dbUser || !dbUser.isAdmin) {
      return res.status(403).json({ error: 'Acesso negado: Requer privilégios de Administrador' });
    }
    next();
  } catch (error) {
    console.error('Erro no middleware requireAdmin:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao verificar privilégios' });
  }
};
