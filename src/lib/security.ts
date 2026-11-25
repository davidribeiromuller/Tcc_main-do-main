/**
 * Núcleo de segurança do eloEscola.
 *
 * HISTÓRICO DO PROBLEMA (Parte 2 da auditoria SaaS):
 *  - Os tokens de sessão eram strings MONTADAS NO NAVEGADOR no formato
 *    `local-<uid>|<role>|<nome>|<email>` e o servidor aceitava qualquer uma
 *    delas sem verificar assinatura. Bastava escrever `local-1|Diretor|...`
 *    no `localStorage` para virar administrador.
 *  - As senhas eram gravadas e comparadas em texto claro (`users.password`,
 *    `school_accounts.password`).
 *  - Quando a verificação do Firebase falhava, o middleware decodificava o
 *    JWT sem conferir assinatura ("fallback para preview"), aceitando qualquer
 *    payload forjado.
 *
 * Este módulo concentra as primitivas corretas:
 *  - senha: scrypt (N=16384, r=8, p=1, 64 bytes) com salt aleatório de 16 bytes
 *    e comparação em tempo constante;
 *  - sessão: token opaco no formato `elo1.<payload b64url>.<hmac>`, assinado
 *    com HMAC-SHA256 por `SESSION_SECRET` (fail-closed se o segredo faltar);
 *  - JWT de provedor (Supabase): verificação de assinatura RS256/ES256 contra
 *    o JWKS público, com cache — nunca "decodificação sem verificação".
 *
 * Nada aqui depende de pacote externo: usa apenas `node:crypto`, para não
 * introduzir dependência nativa no build do TCC.
 */
/*
  Import nomeado (e não `import crypto from "node:crypto"`).

  O `default` some no bundle do navegador: o Vite emitia `const Du = {}` e a
  primeira chamada estourava `Du.randomBytes is not a function` — o cadastro
  no GitHub Pages nunca funcionava. Com nomes explícitos, o alias de
  `node:crypto` em `vite.config.ts` resolve cada função e, se alguma faltar,
  o erro é de build, não de execução disfarçado de "falha de conexão".
*/
import {
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
  verify as verifySignature,
  type KeyObject,
} from "node:crypto";

// ---------------------------------------------------------------------------
// SENHAS
// ---------------------------------------------------------------------------

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const PASSWORD_PREFIX = "scrypt";

/** Gera o hash de uma senha no formato `scrypt$N$r$p$saltHex$hashHex`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize("NFKC"), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    PASSWORD_PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

/** `true` quando o valor guardado NÃO é um hash scrypt (formato legado). */
export function isLegacyPassword(stored: string | null | undefined): boolean {
  if (!stored) return false;
  return !stored.startsWith(`${PASSWORD_PREFIX}$`);
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface PasswordCheck {
  ok: boolean;
  /** `true` quando o registro ainda está em texto claro e precisa ser migrado. */
  needsUpgrade: boolean;
}

/**
 * Compara a senha informada com o valor guardado.
 *
 * Compatibilidade: aceita registros legados em texto claro UMA vez e sinaliza
 * `needsUpgrade` para que o chamador reescreva o registro com `hashPassword`.
 * Comparações usam `timingSafeEqual` para não vazar prefixo por tempo.
 */
export function verifyPassword(password: string, stored: string | null | undefined): PasswordCheck {
  if (!stored) return { ok: false, needsUpgrade: false };

  if (isLegacyPassword(stored)) {
    const ok = safeEqual(String(password ?? ""), stored);
    return { ok, needsUpgrade: ok };
  }

  const parts = stored.split("$");
  if (parts.length !== 6) return { ok: false, needsUpgrade: false };
  const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return { ok: false, needsUpgrade: false };
  }

  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = scryptSync(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    });
    const ok = derived.length === expected.length && timingSafeEqual(derived, expected);
    return { ok, needsUpgrade: false };
  } catch {
    return { ok: false, needsUpgrade: false };
  }
}

/** Força mínima de senha usada no cadastro e na redefinição. */
export function validatePasswordStrength(password: string): string | null {
  if (typeof password !== "string" || password.length < 8) {
    return "A senha deve ter no mínimo 8 caracteres.";
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "A senha deve conter letras e números.";
  }
  if (/^(senha|password|12345678|eloescola)/i.test(password)) {
    return "Escolha uma senha menos previsível.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// TOKENS DE SESSÃO (HMAC)
// ---------------------------------------------------------------------------

export interface SessionPayload {
  /** UID interno do usuário (`users.uid`). */
  sub: string;
  /** Identificador da sessão, para revogação. */
  sid: string;
  iat: number;
  exp: number;
  /** Versão do formato. */
  v: 1;
  /** Origem da autenticação. */
  via?: "password" | "google" | "supabase" | "school" | "guest";
}

let cachedDevSecret: string | null = null;

/**
 * Segredo usado para assinar sessões.
 *
 * Em produção (`NODE_ENV=production`) a ausência do segredo é FAIL-CLOSED: o
 * servidor não emite nem aceita sessões assinadas, em vez de cair num segredo
 * previsível. Em desenvolvimento geramos um segredo aleatório por processo
 * (sessões deixam de valer após reiniciar, o que é aceitável em dev).
 */
export function getSessionSecret(): string | null {
  const fromEnv = (process.env.SESSION_SECRET || "").trim();
  if (fromEnv.length >= 32) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    console.error(
      "[Security] SESSION_SECRET ausente ou com menos de 32 caracteres. " +
        "Sessões assinadas estão DESATIVADAS (fail-closed). Configure o segredo."
    );
    return null;
  }

  if (!cachedDevSecret) {
    cachedDevSecret = randomBytes(32).toString("hex");
    console.warn(
      "[Security] SESSION_SECRET não configurado — usando segredo efêmero de desenvolvimento. " +
        "As sessões expiram ao reiniciar o servidor."
    );
  }
  return cachedDevSecret;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64");
}

function signHmac(data: string, secret: string): string {
  return base64UrlEncode(createHmac("sha256", secret).update(data).digest());
}

/** Cria um token de sessão assinado. `null` quando não há segredo configurado. */
export function createSessionToken(
  payload: Omit<SessionPayload, "iat" | "exp" | "v" | "sid"> & { sid?: string; ttlSeconds?: number }
): string | null {
  const secret = getSessionSecret();
  if (!secret) return null;

  const now = Math.floor(Date.now() / 1000);
  const body: SessionPayload = {
    sub: payload.sub,
    sid: payload.sid || randomBytes(12).toString("hex"),
    iat: now,
    exp: now + (payload.ttlSeconds || 60 * 60 * 12),
    v: 1,
    via: payload.via,
  };

  const encoded = base64UrlEncode(JSON.stringify(body));
  const data = `elo1.${encoded}`;
  return `${data}.${signHmac(data, secret)}`;
}

/** Verifica assinatura e validade do token. Devolve `null` em qualquer falha. */
export function verifySessionToken(token: string | null | undefined): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const secret = getSessionSecret();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "elo1") return null;

  const data = `${parts[0]}.${parts[1]}`;
  const expected = signHmac(data, secret);
  if (!safeEqual(expected, parts[2])) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(parts[1]).toString("utf8")) as SessionPayload;
    if (parsed.v !== 1 || !parsed.sub) return null;
    if (typeof parsed.exp !== "number" || parsed.exp * 1000 < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Hash estável de um token opaco (para guardar no banco sem o valor original). */
export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Token aleatório (recuperação de senha, convites, idempotência). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Código numérico de 6 dígitos para OTP (nunca devolvido ao navegador). */
export function randomOtpCode(): string {
  return String(randomInt(100000, 1000000));
}

// ---------------------------------------------------------------------------
// JWT DE PROVEDOR (Supabase / Firebase) — VERIFICAÇÃO REAL DE ASSINATURA
// ---------------------------------------------------------------------------

interface Jwk {
  kty: string;
  kid?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
  alg?: string;
}

interface JwksCache {
  url: string;
  fetchedAt: number;
  keys: Jwk[];
}

let jwksCache: JwksCache | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

export function getJwksUrl(): string {
  return (
    process.env.SUPABASE_JWKS_URL ||
    (process.env.SUPABASE_URL
      ? `${process.env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`
      : "")
  );
}

async function loadJwks(force = false): Promise<Jwk[]> {
  const url = getJwksUrl();
  if (!url) return [];
  if (!force && jwksCache && jwksCache.url === url && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return jwksCache?.keys || [];
    const json = (await res.json()) as { keys?: Jwk[] };
    const keys = Array.isArray(json.keys) ? json.keys : [];
    jwksCache = { url, fetchedAt: Date.now(), keys };
    return keys;
  } catch {
    return jwksCache?.keys || [];
  }
}

function keyFromJwk(jwk: Jwk): KeyObject | null {
  try {
    if (jwk.kty === "RSA") {
      return createPublicKey({ key: { kty: "RSA", n: jwk.n!, e: jwk.e! }, format: "jwk" });
    }
    if (jwk.kty === "EC") {
      return createPublicKey({
        key: { kty: "EC", crv: jwk.crv || "P-256", x: jwk.x!, y: jwk.y! },
        format: "jwk",
      });
    }
    return null;
  } catch {
    return null;
  }
}

export interface VerifiedProviderToken {
  sub: string;
  email?: string;
  role?: string;
  exp: number;
  iss?: string;
  raw: Record<string, any>;
}

/**
 * Verifica um JWT de provedor (Supabase Auth) contra o JWKS.
 *
 * Diferença crítica em relação ao código antigo: NÃO existe caminho de
 * "decodificar sem verificar". Se o JWKS não puder ser obtido, o token é
 * rejeitado.
 */
export async function verifyProviderJwt(token: string): Promise<VerifiedProviderToken | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let header: any;
  let payload: any;
  try {
    header = JSON.parse(base64UrlDecode(parts[0]).toString("utf8"));
    payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return null;

  const alg: string = header?.alg || "";
  if (alg !== "RS256" && alg !== "ES256") return null;

  const keys = await loadJwks();
  if (keys.length === 0) return null;

  const candidates = keys.filter((k) => !header?.kid || k.kid === header.kid);
  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlDecode(parts[2]);
  const nodeAlg = alg === "RS256" ? "RSA-SHA256" : "sha256";

  for (const jwk of candidates.length ? candidates : keys) {
    const key = keyFromJwk(jwk);
    if (!key) continue;
    try {
      const ok =
        alg === "RS256"
          ? verifySignature(nodeAlg, signingInput, key, signature)
          : verifySignature(nodeAlg, signingInput, { key, dsaEncoding: "ieee-p1363" }, signature);
      if (ok) {
        const sub = String(payload.sub || payload.user_id || payload.uid || "");
        if (!sub) return null;
        return {
          sub,
          email: payload.email,
          role: payload.role || payload.user_metadata?.role,
          exp: payload.exp,
          iss: payload.iss,
          raw: payload,
        };
      }
    } catch {
      /* tenta a próxima chave */
    }
  }
  return null;
}
