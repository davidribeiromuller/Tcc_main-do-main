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
    const userEmail = (req.user.email || '').toLowerCase().trim();
    if (userEmail === 'diretoria@helenawysocki.com') {
      return next();
    }

    const dbUser = await getUserByUid(req.user.uid);
    if (dbUser && dbUser.email?.toLowerCase().trim() === 'diretoria@helenawysocki.com') {
      return next();
    }

    return res.status(403).json({
      error: 'Acesso negado: Apenas a conta oficial da Diretoria do Colégio Estadual Helena Wysocki possui privilégios de Administrador.'
    });
  } catch (error) {
    console.error('Erro no middleware requireAdmin:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao verificar privilégios de administrador' });
  }
};
