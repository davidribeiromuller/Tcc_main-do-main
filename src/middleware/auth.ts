import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';
import { getUserByUid, getUserByEmail } from '../db/users.ts';
import { verifySessionToken, verifyProviderJwt } from '../lib/security.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  /** Linha de `users` resolvida no banco para o token apresentado. */
  dbUser?: any;
  authSource?: 'session' | 'supabase' | 'firebase';
}

/**
 * Middleware de autenticação.
 *
 * HISTÓRICO (Parte 2 da auditoria): a versão antiga aceitava tokens montados no
 * navegador (`local-<uid>|<role>|...`), com o `role` escolhido pelo próprio
 * cliente, e — quando o Firebase falhava — decodificava o JWT sem verificar a
 * assinatura. Qualquer pessoa podia se declarar `Diretor`.
 *
 * Agora só existem três formas de entrada, todas verificadas:
 *  1. Token de sessão do eloEscola (`elo1.<payload>.<hmac>`) assinado com
 *     `SESSION_SECRET`;
 *  2. JWT do Supabase Auth verificado contra o JWKS público;
 *  3. ID token do Firebase verificado por `adminAuth.verifyIdToken`.
 *
 * O papel NUNCA vem do token: é lido de `users` (ou `school_accounts`) a cada
 * requisição. Token válido de usuário bloqueado é rejeitado.
 */
export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  // 1. Sessão própria assinada (HMAC-SHA256)
  if (token.startsWith('elo1.')) {
    const payload = verifySessionToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Unauthorized: sessão inválida ou expirada' });
    }

    let dbUser = await getUserByUid(payload.sub).catch(() => null);
    if (!dbUser) {
      // Sessões de conta escolar usam `sub = inst:<identificador>`.
      const legacyUid = payload.sub.startsWith('inst:') ? payload.sub.slice(5) : payload.sub;
      dbUser = await getUserByUid(legacyUid).catch(() => null);
    }

    if (dbUser && dbUser.ativo === false) {
      return res.status(403).json({
        error: 'Sua conta está bloqueada pela administração escolar.',
        blocked: true,
      });
    }

    req.authSource = 'session';
    req.dbUser = dbUser || undefined;
    req.user = {
      uid: payload.sub,
      sub: payload.sub,
      email: dbUser?.email || '',
      name: dbUser?.nome || '',
      role: dbUser?.role || 'Aluno',
      isAdmin: dbUser?.isAdmin === true,
      iss: 'eloescola',
      aud: 'eloescola',
      auth_time: payload.iat,
      exp: payload.exp,
      firebase: { identities: {}, sign_in_provider: payload.via || 'password' },
    } as any;
    return next();
  }

  // 2. JWT do Supabase Auth — assinatura verificada contra o JWKS
  if (token.split('.').length === 3 && !token.startsWith('google-')) {
    const verified = await verifyProviderJwt(token);
    if (verified) {
      const dbUser = await getUserByEmail(verified.email || '').catch(() => null);
      if (dbUser && dbUser.ativo === false) {
        return res.status(403).json({
          error: 'Sua conta está bloqueada pela administração escolar.',
          blocked: true,
        });
      }
      req.authSource = 'supabase';
      req.dbUser = dbUser || undefined;
      req.user = {
        uid: dbUser?.uid || verified.sub,
        sub: verified.sub,
        email: verified.email || '',
        name: dbUser?.nome || '',
        role: dbUser?.role || 'Aluno',
        isAdmin: dbUser?.isAdmin === true,
        iss: verified.iss,
        aud: 'authenticated',
        auth_time: Math.floor(Date.now() / 1000),
        exp: verified.exp,
        firebase: { identities: {}, sign_in_provider: 'google.com' },
      } as any;
      return next();
    }
  }

  // 3. ID token do Firebase
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const dbUser = await getUserByUid(decodedToken.uid).catch(() => null);
    if (dbUser && dbUser.ativo === false) {
      return res.status(403).json({
        error: 'Sua conta está bloqueada pela administração escolar.',
        blocked: true,
      });
    }
    req.authSource = 'firebase';
    req.dbUser = dbUser || undefined;
    req.user = {
      ...decodedToken,
      uid: decodedToken.uid || (decodedToken as any).sub,
      role: dbUser?.role || 'Aluno',
      isAdmin: dbUser?.isAdmin === true,
    } as any;
    return next();
  } catch {
    /* cai no 401 abaixo */
  }

  return res.status(401).json({ error: 'Unauthorized: Invalid token' });
};
