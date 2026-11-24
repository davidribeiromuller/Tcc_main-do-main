/**
 * Camada de endurecimento HTTP (Parte 2 da auditoria).
 *
 * Antes: nenhum Helmet, nenhum CSP, nenhum rate limit global, CORS implícito e
 * `x-powered-by` exposto. Rotas de autenticação aceitavam tentativa ilimitada.
 *
 * Depois:
 *  - Helmet com CSP explícita (necessária porque o app usa Google Maps, Leaflet
 *    tiles, Supabase e imagens em data URL);
 *  - HSTS em produção;
 *  - `express-rate-limit` global + limites agressivos em login/cadastro/IA;
 *  - CORS por allowlist (`ALLOWED_ORIGINS`), com credenciais apenas para os
 *    domínios listados;
 *  - `trust proxy` controlado por ambiente para rate limit por IP real.
 */
import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

export interface SecurityOptions {
  isProduction: boolean;
}

/** Origens permitidas. Sem configuração, apenas same-origin (CORS desligado). */
export function getAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function contentSecurityPolicy(isProduction: boolean) {
  return {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"],
    scriptSrc: isProduction
      ? ["'self'", "https://maps.googleapis.com", "https://maps.gstatic.com"]
      : ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://maps.googleapis.com", "https://maps.gstatic.com"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
    imgSrc: [
      "'self'",
      "data:",
      "blob:",
      "https:",
    ],
    connectSrc: [
      "'self'",
      "https://*.supabase.co",
      "wss://*.supabase.co",
      "https://maps.googleapis.com",
      "https://nominatim.openstreetmap.org",
      "https://*.tile.openstreetmap.org",
      "https://*.basemaps.cartocdn.com",
      ...getAllowedOrigins(),
    ],
    frameSrc: ["'self'", "https://accounts.google.com", "https://*.supabase.co"],
    workerSrc: ["'self'", "blob:"],
    manifestSrc: ["'self'"],
    upgradeInsecureRequests: isProduction ? [] : null,
  };
}

/** Aplica Helmet, CORS por allowlist, limite de corpo e rate limit global. */
export function applyHttpSecurity(app: Express, options: SecurityOptions) {
  const { isProduction } = options;

  app.disable("x-powered-by");

  // Necessário para rate limit por IP atrás do proxy da plataforma.
  if (process.env.TRUST_PROXY === "1" || isProduction) {
    app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: contentSecurityPolicy(isProduction) as any,
      },
      crossOriginEmbedderPolicy: false, // mapas/imagens externas
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      hsts: isProduction
        ? { maxAge: 15552000, includeSubDomains: true, preload: false }
        : false,
      frameguard: { action: "sameorigin" },
    })
  );

  // CORS explícito: só responde com CORS às origens da allowlist.
  const allowed = getAllowedOrigins();
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && allowed.includes(origin.replace(/\/$/, ""))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key, Stripe-Signature");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // Rate limit global (protege contra varredura e força bruta distribuída).
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_PER_MINUTE || 240),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Muitas requisições. Aguarde um instante e tente novamente." },
  });
  app.use("/api/", globalLimiter);
}

/** Rate limiter para rotas sensíveis (login, cadastro, recuperação). */
export function authLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.AUTH_RATE_LIMIT || 20),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
      error: "Muitas tentativas de acesso. Por segurança, aguarde 15 minutos antes de tentar novamente.",
    },
  });
}

/** Rate limiter da IA: protege a cota e o custo do provedor. */
export function aiLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.AI_RATE_LIMIT || 12),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Limite de mensagens por minuto do assistente atingido. Aguarde alguns segundos." },
  });
}

/** Rate limiter de escrita pública (leads, sugestões). */
export function publicWriteLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: Number(process.env.PUBLIC_WRITE_RATE_LIMIT || 30),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Muitos envios deste endereço. Tente novamente mais tarde." },
  });
}
