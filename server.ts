import express from "express";
import path from "path";
import fs from "fs";
import dns from "dns";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import * as dotenv from "dotenv";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

// Load environment variables
dotenv.config();

// Ensure verified Supabase credentials are available in environment
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://jaoheenjltzzglfncgfq.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_bpCOfPvR2p5aVpbDMOsCqw_D-E0TlcL";
process.env.SUPABASE_JWKS_URL = process.env.SUPABASE_JWKS_URL || "https://jaoheenjltzzglfncgfq.supabase.co/auth/v1/.well-known/jwks.json";
if (!process.env.SUPABASE_ANON_KEY) {
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
}

import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";
import {
  requireChefeAdmin,
  requireAdminOrStaff,
  checkIsChefe,
  checkIsFuncionario,
  requirePlatformOwner
} from "./src/middleware/admin.ts";
import {
  getOrCreateUser,
  getUserByUid,
  getUserByEmail,
  getUserByPhone,
  updateUserPassword,
  updateUserByUid,
  updateUserById,
  listAllUsers,
  deleteUserById,
  blockUserById,
  unblockUserById,
  deleteUserPermanentlyById
} from "./src/db/users.ts";
import {
  listAllEvents,
  createNewEvent,
  updateEventById,
  deleteEventById
} from "./src/db/events.ts";
import {
  requireSupabaseServerAuth,
  isSupabaseServerConfigured,
  SupabaseRequest
} from "./src/lib/supabase-server.ts";
import {
  ARAUCARIA_SCHOOLS,
  getSchoolBySlug,
  getSchoolById,
  addSchoolNews,
  addSchoolEvent
} from "./src/lib/schoolsData.ts";
import {
  archiveAndPruneExpiredEvents,
  restoreArchivedEventFallback,
  getEventArchiveLogsFallback,
  listInstitutionalAccountsFallback,
  createInstitutionalAccountFallback,
  toggleInstitutionalAccountFallback,
  resetInstitutionalPasswordFallback,
  deleteInstitutionalAccountFallback,
  authenticateInstitutionalAccountFallback,
  verifySchoolAccountFallback,
  updateSchoolAccountStatusFallback,
  getSchoolAccountAuditLogsFallback,
  logSchoolActionFallback,
  recordParticipationFallback,
  listUserParticipationsFallback,
  listArchivedEventsFallback,
  listAllEventsFallback
} from "./src/db/fallbackStore.ts";
import { EVENT_RETENTION_DAYS } from "./src/lib/eventLifecycle.ts";
import { validateEventDate } from "./src/lib/dateGuards.ts";
import { detectForbiddenContent } from "./src/lib/eventClassification.ts";
import {
  createAuthorization,
  getAuthorizationByStudentAndEvent,
  listAuthorizationsByEvent,
  listAuthorizationsByStudent
} from "./src/db/authorizations.ts";
import { applyHttpSecurity, authLimiter, aiLimiter, publicWriteLimiter } from "./src/middleware/security.ts";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  createSessionToken,
  randomToken,
  randomOtpCode,
  hashOpaqueToken
} from "./src/lib/security.ts";
import {
  createEmailResetToken,
  createPhoneOtp,
  verifyPhoneOtp,
  findValidResetToken,
  consumeResetToken,
  revokeUserSessions,
  recordSession,
  sendEmail,
  sendSms,
  maskEmail,
  maskPhone,
  recordConsent,
  createDataSubjectRequest,
  RESET_TOKEN_TTL_MINUTES,
  OTP_TTL_MINUTES
} from "./src/lib/authTokens.ts";
import { autenticarContaEscolar } from "./src/lib/schoolAccountsService.ts";
import {
  uploadSignature,
  createSignedSignatureUrl,
  SIGNED_URL_TTL_SECONDS
} from "./src/lib/signatureStorage.ts";
import {
  resolveAccessState,
  evaluateQuota,
  effectivePriceCents,
  nextPeriodEnd,
  trialEndFrom,
  featureLabel,
  TRIAL_DAYS,
  FOUNDER_SLOTS,
  FOUNDER_DISCOUNT_PERCENT,
  ANNUAL_DISCOUNT_PERCENT
} from "./src/lib/subscription.ts";
import {
  createCharge,
  getBillingDiagnostics,
  verifyStripeSignature,
  verifyGenericSignature,
  normalizeWebhook
} from "./src/lib/billing.ts";
import {
  isSaasBackendConfigured,
  getSaasAdminClient,
  listSchools,
  listAdministeredSchools,
  hasSchoolAdminRole,
  createSchool,
  addMembership,
  countActiveStudents,
  listPlans,
  listPlanAddons,
  updatePlan,
  getSubscriptionBySchool,
  listAllSubscriptions,
  updateSubscription,
  createSubscription,
  logSubscriptionEvent,
  listSubscriptionEvents,
  listEntitlements,
  syncEntitlementsFromPlan,
  recordUsage,
  countUsageInPeriod,
  createPaymentTransaction,
  updatePaymentStatus,
  listPaymentsForSchool,
  listAllPayments,
  registerWebhookEvent,
  markWebhookProcessed,
  listPartners,
  createPartner,
  setPartnerStatus,
  listCampaignsForSchool,
  createCampaign,
  decideCampaign,
  logPlatformAudit,
  listPlatformAudit,
  listSalesLeads,
  createSalesLead,
  updateSalesLeadStatus,
  getPlatformOverview
} from "./src/lib/saasStore.ts";

/**
 * Carrega a linha de `users` correspondente ao token, do jeito que o resto do
 * servidor já faz (por uid e, se falhar, por e-mail).
 */
async function resolveDbUserForRequest(req: AuthRequest): Promise<any> {
  try {
    if (!req.user) return null;
    let dbUser = await getUserByUid(req.user.uid);
    if (!dbUser && req.user.email) dbUser = await getUserByEmail(req.user.email);
    return dbUser || null;
  } catch {
    return null;
  }
}

/**
 * Identidade do próprio usuário autenticado.
 *
 * Um mesmo usuário aparece como `uid` (token) e como `id` (banco). Comparar
 * sempre o conjunto evita negar acesso legítimo por diferença de formato.
 */
function ownIdentityCandidates(req: AuthRequest, dbUser?: any): string[] {
  const values = [
    req.user?.uid,
    (req.user as any)?.id,
    dbUser?.uid,
    dbUser?.id,
    (dbUser as any)?.user_uid,
  ]
    .filter((v) => v !== undefined && v !== null)
    .map((v) => String(v));
  return Array.from(new Set(values));
}

/**
 * Mensagem padrão de recusa para dados sensíveis (autorizações de menores).
 *
 * Não distingue "não existe" de "não é seu": distinguir permitiria descobrir
 * quais ids de estudante existem.
 */
const AUTHORIZATION_FORBIDDEN = "Você não tem permissão para acessar esta autorização.";

/**
 * Erro de rede/indisponibilidade do Supabase.
 *
 * Sem isso, uma falha de conexão virava "500 — erro interno" e o painel não
 * tinha como reagir. Com o código `SAAS_UNREACHABLE` a tela pode dizer o que
 * aconteceu (banco fora do ar / rede bloqueada) em vez de sugerir bug.
 */
function isRedeIndisponivel(error: any): boolean {
  const msg = String(error?.message || error || "");
  return /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|socket hang up/i.test(msg);
}

function responderIndisponivel(res: any, mensagem: string) {
  return res.status(503).json({
    error: mensagem,
    code: "SAAS_UNREACHABLE",
    hint: "Verifique se o projeto Supabase está ativo e se o servidor tem acesso de rede até ele.",
  });
}

/** E-mail do token, quando o provedor informa (Supabase/Firebase). */
function correio(req: AuthRequest): string {
  return String((req.user as any)?.email || "");
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const isProduction = process.env.NODE_ENV === "production";

  // Body parsing middleware
  // O webhook precisa do corpo CRU para validar assinatura HMAC, então ele é
  // montado ANTES do parser JSON global e capturado como Buffer.
  app.use(
    "/api/billing/webhook",
    express.raw({ type: "*/*", limit: "1mb" }),
    (_req, _res, next) => next()
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // Endurecimento HTTP (Helmet/CSP/HSTS/CORS/rate limit) — Parte 2.
  applyHttpSecurity(app, { isProduction });

  // --- API ROUTES ---

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Supabase/Postgres Database Status Info
  /**
   * Diagnóstico de infraestrutura.
   *
   * `saasConfigured` diz se o servidor tem `SUPABASE_SECRET_KEY` — é essa
   * chave, e não o Postgres opcional, que alimenta painel, contas escolares e
   * histórico. O painel usa esse campo para avisar "não consigo ler o banco"
   * em vez de mostrar listas vazias como se não houvesse dado.
   */
  app.get("/api/db-status", async (req, res) => {
    try {
      const isSupabase = !!(process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || process.env.DIRECT_URL || process.env.POSTGRES_URL);
      const host = process.env.SUPABASE_DB_URL ? "Supabase (DB URL)" : (process.env.DATABASE_URL ? "Supabase (Custom URL)" : "Google Cloud SQL / Local");
      
      const { db, isDbCachedOffline, markDbOffline, markDbOnline, getDbHealthStats } = await import("./src/db/index.ts");
      const { sql } = await import("drizzle-orm");
      const healthStats = getDbHealthStats();
      
      // `saasConfigured`: o painel administrativo depende desta chave, não do
      // Postgres opcional acima. Vai em TODAS as respostas de diagnóstico.
      const saasConfigured = isSaasBackendConfigured();

      if (isDbCachedOffline()) {
        return res.json({
          active: false,
          provider: isSupabase ? "Supabase (PostgreSQL)" : "Google Cloud SQL (PostgreSQL)",
          host: host,
          version: "Drizzle ORM + PG Node Driver",
          cachedOffline: true,
          error: "Conexão off-line em cache",
          sdkInstalled: true,
          saasConfigured,
          health: healthStats
        });
      }
      
      const queryResult = await db.execute(sql`SELECT 1 as connection_test`);
      const active = !!(queryResult && queryResult.rows && queryResult.rows.length > 0);
      
      if (active) {
        markDbOnline();
      }

      res.json({
        active,
        provider: isSupabase ? "Supabase (PostgreSQL)" : "Google Cloud SQL (PostgreSQL)",
        host: host,
        version: "Drizzle ORM + PG Node Driver",
        sdkInstalled: true,
        saasConfigured,
        health: getDbHealthStats()
      });
    } catch (error: any) {
      console.warn("[Database] Real-time status test failed:", error.message || error);
      let healthStats = null;
      try {
        const { markDbOffline, getDbHealthStats } = await import("./src/db/index.ts");
        markDbOffline();
        healthStats = getDbHealthStats();
      } catch (e) {}
      res.json({
        active: false,
        provider: !!(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL) ? "Supabase PostgreSQL (Não conectado)" : "Cloud SQL / Local (Sem conexão)",
        error: error.message || "Erro de conexão",
        sdkInstalled: true,
        saasConfigured: isSaasBackendConfigured(),
        health: healthStats
      });
    }
  });

  // Supabase Server SDK Test Endpoint
  app.get("/api/supabase-test", requireSupabaseServerAuth("none"), async (req: SupabaseRequest, res) => {
    try {
      const isConfigured = isSupabaseServerConfigured();
      if (!isConfigured) {
        return res.json({
          configured: false,
          message: "Supabase Server SDK is installed but missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY variables."
        });
      }

      // Check if we can perform a simple request
      const ctx = req.supabaseContext;
      res.json({
        configured: true,
        message: "Supabase Server SDK initialized successfully with context!",
        authMode: ctx?.authMode,
        hasClient: !!req.supabase,
        hasAdminClient: !!req.supabaseAdmin,
      });
    } catch (error: any) {
      res.status(500).json({
        configured: false,
        error: error.message || "Internal error in Supabase server wrapper"
      });
    }
  });

  // Comprehensive Supabase Auth & Project Status Diagnostic Endpoint
  app.get("/api/auth/supabase-status", async (req, res) => {
    const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const rawKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
    const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";

    if (!rawUrl || rawUrl.includes("placeholder") || rawUrl.includes("[ID_DO_SEU_PROJETO]")) {
      return res.json({
        configured: false,
        validDns: false,
        error: "MISSING_CONFIGURATION",
        message: "As variáveis SUPABASE_URL e VITE_SUPABASE_URL não foram configuradas com um projeto Supabase real.",
        url: rawUrl,
        hasAnonKey: !!rawKey
      });
    }

    try {
      const parsedUrl = new URL(rawUrl);
      const hostname = parsedUrl.hostname;

      // Extract project ref from subdomain: <ref>.supabase.co
      const projectRef = hostname.split(".")[0];

      // Perform real DNS lookup
      const dnsResult = await new Promise<{ ok: boolean; address?: string; error?: string }>((resolve) => {
        dns.lookup(hostname, (err, address) => {
          if (err) {
            resolve({ ok: false, error: err.code });
          } else {
            resolve({ ok: true, address });
          }
        });
      });

      if (!dnsResult.ok) {
        return res.json({
          configured: true,
          validDns: false,
          error: "DNS_PROBE_FINISHED_NXDOMAIN",
          hostname,
          projectRef,
          url: rawUrl,
          hasAnonKey: !!rawKey,
          hasDbUrl: !!dbUrl,
          message: `O domínio '${hostname}' não existe no DNS (NXDOMAIN). Isso ocorre quando o projeto no Supabase foi pausado por inatividade ou excluído. Acesse https://supabase.com/dashboard para restaurar o projeto ou atualize as variáveis com o novo projeto.`
        });
      }

      return res.json({
        configured: true,
        validDns: true,
        hostname,
        projectRef,
        ipAddress: dnsResult.address,
        url: rawUrl,
        hasAnonKey: !!rawKey,
        hasDbUrl: !!dbUrl,
        message: `Domínio Supabase '${hostname}' está ativo e respondendo no DNS.`
      });
    } catch (err: any) {
      return res.status(400).json({
        configured: false,
        validDns: false,
        error: "INVALID_URL",
        message: err.message
      });
    }
  });

  // In-memory token stores for single-use, secure recovery
  interface PasswordResetSession {
    token: string;
    email: string;
    userId: number;
    expiresAt: number;
    used: boolean;
    type: "email" | "phone";
  }

  interface PhoneRecoveryOtp {
    phone: string;
    normalizedPhone: string;
    code: string;
    email: string;
    userId: number;
    expiresAt: number;
    attempts: number;
    maxAttempts: number;
    createdAt: number;
    lastRequestedAt: number;
    verified: boolean;
  }

  const resetSessionsMap = new Map<string, PasswordResetSession>();
  const phoneOtpMap = new Map<string, PhoneRecoveryOtp>();
  const recoveryRateLimitMap = new Map<string, { count: number; firstRequestTime: number }>();

  function checkRecoveryRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const record = recoveryRateLimitMap.get(key);
    if (!record || now - record.firstRequestTime > windowMs) {
      recoveryRateLimitMap.set(key, { count: 1, firstRequestTime: now });
      return true;
    }
    if (record.count >= maxRequests) {
      return false;
    }
    record.count += 1;
    return true;
  }

  // Check if email already exists before registration
  app.get("/api/auth/check-email", async (req, res) => {
    try {
      const email = req.query.email as string;
      if (!email) {
        return res.status(400).json({ error: "Email é obrigatório" });
      }
      const cleanEmail = email.trim().toLowerCase();
      const user = await getUserByEmail(cleanEmail);
      res.json({ exists: !!user });
    } catch (error: any) {
      console.error("Erro ao verificar email:", error);
      res.status(500).json({ error: error.message || "Erro ao verificar email" });
    }
  });

  // Check if phone already exists before registration
  app.get("/api/auth/check-phone", async (req, res) => {
    try {
      const rawPhone = req.query.phone as string;
      if (!rawPhone) {
        return res.status(400).json({ error: "Telefone é obrigatório" });
      }
      const cleanDigits = rawPhone.replace(/\D/g, "");
      if (cleanDigits.length < 8) {
        return res.json({ exists: false });
      }
      const user = await getUserByPhone(cleanDigits);
      res.json({ exists: !!user });
    } catch (error: any) {
      console.error("Erro ao verificar telefone:", error);
      res.status(500).json({ error: error.message || "Erro ao verificar telefone" });
    }
  });

  // =========================================================================
  // RECUPERAÇÃO DE SENHA — Parte 2 da auditoria
  // =========================================================================
  // O que mudou e por quê:
  //  1. Nenhum endpoint devolve token, código SMS ou link de reset no JSON.
  //     Antes bastava saber o e-mail de alguém para tomar a conta.
  //  2. Respostas são NEUTRAS: pedir recuperação para e-mail inexistente
  //     devolve o mesmo 200 de um e-mail válido (evita enumeração de contas).
  //  3. Tokens e OTP são persistidos com hash (tabela password_reset_tokens).
  //  4. A entrega depende de provedor real (Resend/Twilio). Sem credencial, a
  //     resposta informa `deliveryPending: true` — nunca fingimos envio.
  //  5. Senha nova passa por validação de força e é gravada como scrypt.

  const recoveryIp = (req: any) =>
    ((req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress || "ip").split(",")[0].trim();

  const genericRecoveryMessage =
    "Se os dados informados estiverem cadastrados, enviaremos as instruções de recuperação em instantes. Verifique sua caixa de entrada e o spam.";

  // PASSWORD RECOVERY: Request via Email
  app.post("/api/auth/recovery/request-email", authLimiter(), async (req, res) => {
    try {
      const { email } = req.body;
      const cleanEmail = (email || "").trim().toLowerCase();

      if (!cleanEmail) {
        return res.status(400).json({ error: "Por favor, informe seu endereço de e-mail." });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ error: "Formato de e-mail inválido. Exemplo: aluno@escola.pr.gov.br" });
      }

      const ip = recoveryIp(req);
      if (!checkRecoveryRateLimit(`email-rate-${cleanEmail}`, 5, 15 * 60 * 1000) || !checkRecoveryRateLimit(`ip-email-${ip}`, 20, 15 * 60 * 1000)) {
        return res.status(429).json({ error: "Muitas solicitações de recuperação para este e-mail. Aguarde alguns minutos." });
      }

      const user = await getUserByEmail(cleanEmail);

      // Resposta neutra quando a conta não existe: mesmo status e mesmo texto.
      if (!user) {
        return res.json({
          success: true,
          message: genericRecoveryMessage,
          deliveryPending: false,
        });
      }

      if (user.ativo === false) {
        return res.json({
          success: true,
          message: genericRecoveryMessage,
          deliveryPending: false,
          accountInactive: true,
        });
      }

      const created = await createEmailResetToken({
        email: cleanEmail,
        userUid: user.uid,
        ip,
      });

      if (created.error || !created.data) {
        console.error("[Password Recovery] Falha ao criar token:", created.error);
        return res.status(503).json({
          error:
            "A recuperação de senha está temporariamente indisponível. Fale com a secretaria da escola.",
          code: "RECOVERY_UNAVAILABLE",
        });
      }

      const baseUrl =
        (process.env.PUBLIC_APP_URL || "").replace(/\/$/, "") ||
        `${req.protocol}://${req.get("host")}`;
      const resetUrl = `${baseUrl}/?reset_token=${created.data.token}`;

      const delivery = await sendEmail(
        cleanEmail,
        "eloEscola — redefinição de senha",
        [
          "Olá!",
          "",
          "Recebemos um pedido de redefinição de senha da sua conta no eloEscola.",
          `Acesse o link abaixo nos próximos ${RESET_TOKEN_TTL_MINUTES} minutos:`,
          "",
          resetUrl,
          "",
          "Se não foi você, ignore esta mensagem — sua senha continua a mesma.",
          "",
          "eloEscola",
        ].join("\n")
      );

      // O token JÁ está persistido. Se o e-mail não saiu, o pedido fica
      // registrado para o suporte, mas NUNCA é devolvido ao navegador.
      res.json({
        success: true,
        message: delivery.delivered
          ? genericRecoveryMessage
          : "O envio automático de e-mail ainda não está configurado neste ambiente. Fale com a secretaria da escola para redefinir sua senha com segurança.",
        deliveryPending: !delivery.delivered,
        expiresMinutes: RESET_TOKEN_TTL_MINUTES,
      });
    } catch (error: any) {
      console.error("Erro na recuperação por email:", error);
      res.status(500).json({ error: "Erro ao processar recuperação por e-mail." });
    }
  });

  // PASSWORD RECOVERY: Request via Phone (SMS Code)
  app.post("/api/auth/recovery/request-phone", authLimiter(), async (req, res) => {
    try {
      const { phone } = req.body;
      const cleanPhone = (phone || "").trim();
      const digitsOnly = cleanPhone.replace(/\D/g, "");

      if (!digitsOnly || digitsOnly.length < 10) {
        return res.status(400).json({ error: "Informe um número de telefone celular válido com DDD (mínimo 10 dígitos)." });
      }

      const ip = recoveryIp(req);
      const phoneKey = digitsOnly.startsWith("55") && digitsOnly.length >= 12 ? digitsOnly.slice(2) : digitsOnly;

      if (!checkRecoveryRateLimit(`phone-cooldown-${phoneKey}`, 1, 60 * 1000)) {
        return res.status(429).json({
          error: "Aguarde 60 segundos antes de solicitar um novo código SMS.",
          cooldownSeconds: 60,
        });
      }

      if (!checkRecoveryRateLimit(`phone-rate-${phoneKey}`, 5, 60 * 60 * 1000) || !checkRecoveryRateLimit(`ip-phone-${ip}`, 15, 60 * 60 * 1000)) {
        return res.status(429).json({ error: "Limite de solicitações de SMS atingido para este número. Tente novamente mais tarde." });
      }

      const user = await getUserByPhone(digitsOnly);

      if (!user) {
        return res.json({
          success: true,
          message: "Se o telefone estiver cadastrado em uma conta, você receberá um código em instantes.",
          deliveryPending: false,
          maskedPhone: maskPhone(digitsOnly),
        });
      }

      if (user.ativo === false) {
        return res.json({
          success: true,
          message: "Se o telefone estiver cadastrado em uma conta, você receberá um código em instantes.",
          deliveryPending: false,
          accountInactive: true,
          maskedPhone: maskPhone(digitsOnly),
        });
      }

      const otp = await createPhoneOtp({
        email: user.email || "",
        phone: digitsOnly,
        userUid: user.uid,
        ip,
      });

      if (otp.error || !otp.data) {
        console.error("[Password Recovery] Falha ao criar OTP:", otp.error);
        return res.status(503).json({
          error: "A recuperação por SMS está temporariamente indisponível. Use a recuperação por e-mail.",
          code: "RECOVERY_UNAVAILABLE",
        });
      }

      const delivery = await sendSms(
        digitsOnly.startsWith("+") ? digitsOnly : `+55${phoneKey}`,
        `eloEscola: seu código de verificação é ${otp.data.code}. Vale por ${OTP_TTL_MINUTES} minutos. Não compartilhe.`
      );

      res.json({
        success: true,
        message: delivery.delivered
          ? `Código enviado para ${otp.data.maskedPhone}.`
          : "O envio de SMS ainda não está configurado neste ambiente. Use a recuperação por e-mail.",
        deliveryPending: !delivery.delivered,
        maskedPhone: otp.data.maskedPhone,
        expiresMinutes: OTP_TTL_MINUTES,
        cooldownSeconds: 60,
      });
    } catch (error: any) {
      console.error("Erro na solicitação SMS:", error);
      res.status(500).json({ error: "Erro ao solicitar código por SMS." });
    }
  });

  // PASSWORD RECOVERY: Verify Phone Code
  app.post("/api/auth/recovery/verify-phone-code", authLimiter(), async (req, res) => {
    try {
      const { phone, email, code } = req.body;
      const cleanCode = (code || "").trim();
      const cleanDigits = (phone || "").replace(/\D/g, "");

      if (!cleanCode) {
        return res.status(400).json({ error: "Informe o código recebido por SMS." });
      }

      // Precisamos do e-mail da conta para localizar o OTP; aceitamos telefone
      // OU e-mail como identificador para não expor o e-mail no formulário.
      let targetEmail = (email || "").trim().toLowerCase();
      if (!targetEmail && cleanDigits) {
        const user = await getUserByPhone(cleanDigits);
        targetEmail = (user?.email || "").trim().toLowerCase();
      }
      if (!targetEmail) {
        return res.status(400).json({ error: "Não foi possível identificar a conta. Solicite um novo código." });
      }

      const result = await verifyPhoneOtp({ email: targetEmail, code: cleanCode, ip: recoveryIp(req) });

      if (!result.token) {
        return res.status(400).json({
          error: result.error || "Código incorreto ou expirado.",
          remainingAttempts: result.remainingAttempts,
        });
      }

      res.json({
        success: true,
        message: "Telefone confirmado. Defina sua nova senha.",
        resetToken: result.token,
        expiresMinutes: RESET_TOKEN_TTL_MINUTES,
      });
    } catch (error: any) {
      console.error("Erro ao validar código SMS:", error);
      res.status(500).json({ error: "Erro ao validar código SMS." });
    }
  });

  // PASSWORD RECOVERY: Verify Token validity
  app.get("/api/auth/recovery/verify-token", async (req, res) => {
    try {
      const token = String(req.query.token || "");
      if (!token) {
        return res.status(400).json({ valid: false, error: "Token ausente." });
      }

      const found = await findValidResetToken(token);
      if (!found) {
        return res.status(404).json({ valid: false, error: "Link de recuperação inválido, expirado ou já utilizado." });
      }

      res.json({ valid: true, email: maskEmail(found.email) });
    } catch (error: any) {
      console.error("Erro ao verificar token:", error);
      res.status(500).json({ valid: false, error: "Erro ao verificar validade do link." });
    }
  });

  // PASSWORD RECOVERY: Reset Password
  app.post("/api/auth/recovery/reset-password", authLimiter(), async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token) {
        return res.status(400).json({ error: "Token de recuperação ausente." });
      }

      const strengthError = validatePasswordStrength(newPassword || "");
      if (strengthError) {
        return res.status(400).json({ error: strengthError });
      }

      const consumed = await consumeResetToken(token);
      if (!consumed) {
        return res.status(400).json({ error: "Token inválido, expirado ou já utilizado. Solicite um novo link." });
      }

      const user = await getUserByEmail(consumed.email);
      if (!user) {
        return res.status(404).json({ error: "Conta não encontrada." });
      }

      // Hash scrypt (antes: texto claro comparado com !==).
      await updateUserPassword(user.id || consumed.email, hashPassword(newPassword));

      // Troca de senha invalida sessões anteriores.
      await revokeUserSessions(user.uid);

      console.log(`[Password Recovery] Senha atualizada (hash) para ${maskEmail(consumed.email)}`);

      res.json({
        success: true,
        message: "Senha alterada com sucesso! Você já pode entrar com sua nova senha.",
        email: maskEmail(consumed.email),
      });
    } catch (error: any) {
      console.error("Erro ao redefinir senha:", error);
      res.status(500).json({ error: "Erro ao redefinir senha." });
    }
  });
  // =========================================================================
  // CADASTRO E LOGIN — Parte 2 da auditoria
  // =========================================================================
  // Mudanças obrigatórias:
  //  - senha mínima de 8 caracteres com letras e números, gravada como scrypt;
  //  - NUNCA aceitar `role` do corpo do cadastro: todo mundo nasce "Aluno";
  //  - e-mail que consta em PLATFORM_OWNER_EMAILS não vira admin por si só —
  //    privilégio agora vem de `users.role`/`users.is_admin`/`memberships`,
  //    administrados pelo painel;
  //  - a sessão é assinada (HMAC) e registrada em `auth_sessions`.

  function sessionIp(req: any): string {
    return ((req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress || "")
      .split(",")[0]
      .trim();
  }

  async function issueSession(
    req: any,
    user: { uid: string; email?: string | null },
    via: "password" | "google" | "supabase" | "school" | "guest"
  ): Promise<string | null> {
    const token = createSessionToken({ sub: user.uid, via });
    if (!token) {
      console.error("[Auth] Não foi possível assinar a sessão: SESSION_SECRET ausente em produção.");
      return null;
    }
    try {
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      await recordSession({
        sessionId: payload.sid,
        userUid: user.uid,
        via,
        ip: sessionIp(req),
        userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
        expiresAt: new Date(payload.exp * 1000).toISOString(),
      });
    } catch (err: any) {
      console.warn("[Auth] Falha ao registrar sessão:", err?.message || err);
    }
    return token;
  }

  // Dedicated Registration Endpoint with duplicate check (email + phone)
  app.post("/api/auth/register", authLimiter(), async (req, res) => {
    try {
      const { email, password, nome, cpf, phone, birthdate, gender, institution } = req.body;
      const cleanEmail = (email || "").trim().toLowerCase();

      if (!cleanEmail) {
        return res.status(400).json({ error: "O e-mail é obrigatório." });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ error: "Formato de e-mail inválido. Exemplo: aluno@escola.pr.gov.br" });
      }

      const existingUser = await getUserByEmail(cleanEmail);
      if (existingUser) {
        return res.status(400).json({ error: "Este e-mail já está cadastrado no sistema. Por favor, tente fazer login ou recupere sua senha." });
      }

      if (phone) {
        const cleanDigits = String(phone).replace(/\D/g, "");
        if (cleanDigits.length >= 8) {
          const existingPhoneUser = await getUserByPhone(cleanDigits);
          if (existingPhoneUser) {
            return res.status(400).json({ error: "Este número de telefone celular já está em uso em outra conta." });
          }
        }
      }

      const strengthError = validatePasswordStrength(password || "");
      if (strengthError) {
        return res.status(400).json({ error: strengthError });
      }

      const uid = "local-uid-" + crypto.randomBytes(6).toString("hex");
      let registeredUser = await getOrCreateUser(
        uid,
        cleanEmail,
        (nome || "").trim() || cleanEmail.split("@")[0],
        "",
        "local",
        // Papel fixo: cadastro público nunca cria administrador. A promoção é
        // feita por um Chefe Administrador no painel, com registro de auditoria.
        "Aluno",
        hashPassword(password)
      );

      if (cpf || phone || birthdate || gender || institution) {
        const updated = await updateUserByUid(uid, {
          cpf: cpf ? String(cpf).trim() : "",
          phone: phone ? String(phone).trim() : "",
          birthdate: birthdate ? String(birthdate).trim() : "",
          gender: gender ? String(gender).trim() : "",
          institution: institution ? String(institution).trim() : "Escola estadual Helena Wysocki",
        });
        if (updated) {
          registeredUser = updated;
        }
      }

      const token = await issueSession(req, { uid, email: cleanEmail }, "password");
      if (!token) {
        return res.status(503).json({
          error: "Cadastro concluído, mas a sessão não pôde ser criada. Configure SESSION_SECRET e entre novamente.",
          code: "SESSION_UNAVAILABLE",
        });
      }

      res.json({ user: registeredUser, token });
    } catch (error: any) {
      console.error("Erro no registro do usuário:", error);
      res.status(500).json({ error: error.message || "Erro ao realizar o cadastro escolar." });
    }
  });

  // Local password login with database verification
  app.post("/api/auth/local-login-password", authLimiter(), async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email e senha são obrigatórios" });
      }

      const cleanEmail = email.trim().toLowerCase();
      const user = await getUserByEmail(cleanEmail);

      if (!user) {
        // Antes: contas "conhecidas" eram criadas automaticamente com senha
        // padrão só informando o e-mail. Isso era uma porta de entrada aberta.
        return res.status(404).json({ error: "Nenhuma conta cadastrada com este e-mail. Por favor, crie uma conta primeiro." });
      }

      if (user.ativo === false) {
        return res.status(403).json({
          error: "Sua conta foi bloqueada ou desativada pela administração. Entre em contato com a diretoria da escola para solicitar o desbloqueio."
        });
      }

      // Senha em texto claro? Compara e MIGRA para hash no mesmo login.
      const check = verifyPassword(password, user.password);
      if (!check.ok) {
        return res.status(401).json({ error: "Senha incorreta. Verifique os dados digitados e tente novamente." });
      }
      if (check.needsUpgrade) {
        try {
          await updateUserPassword(user.id || cleanEmail, hashPassword(password));
          console.info(`[Auth] Senha legada convertida para scrypt: ${maskEmail(cleanEmail)}`);
        } catch (upgradeErr) {
          console.warn("[Auth] Falha ao migrar senha legada:", upgradeErr);
        }
      }

      const token = await issueSession(req, { uid: user.uid, email: user.email }, "password");
      if (!token) {
        return res.status(503).json({
          error: "Login indisponível: SESSION_SECRET não configurado no servidor.",
          code: "SESSION_UNAVAILABLE",
        });
      }

      res.json({ user, token });
    } catch (error: any) {
      console.error("Erro no login local por senha:", error);
      res.status(500).json({ error: error.message || "Erro interno no servidor" });
    }
  });

  // Direct Google Authentication endpoint (supports web preview / sandboxed iframe environments)
  app.post("/api/auth/google-direct-login", authLimiter(), async (req, res) => {
    try {
      const { email, nome, foto_perfil } = req.body;
      if (!email || typeof email !== "string" || !email.trim()) {
        return res.status(400).json({ error: "O endereço de e-mail é obrigatório para autenticação Google." });
      }
      const cleanEmail = email.trim().toLowerCase();
      const userName = nome || (cleanEmail ? cleanEmail.split("@")[0].replace(/[._]/g, " ") : "Usuário Google");
      const userPhoto = foto_perfil || "";
      let hash = 0;
      for (let i = 0; i < cleanEmail.length; i++) {
        hash = (Math.imul(31, hash) + cleanEmail.charCodeAt(i)) | 0;
      }
      const uid = "google-uid-" + Math.abs(hash);

      const user = await getOrCreateUser(
        uid,
        cleanEmail,
        userName,
        userPhoto,
        "google",
        // Papel nunca vem do corpo: consulta o existente ou nasce Aluno.
        undefined
      );

      if (user && user.ativo === false) {
        return res.status(403).json({
          error: "Sua conta foi bloqueada ou desativada pela administração escolar. Entre em contato com a diretoria da escola para solicitar o desbloqueio."
        });
      }

      const token = await issueSession(req, { uid, email: cleanEmail }, "google");
      if (!token) {
        return res.status(503).json({
          error: "Login indisponível: SESSION_SECRET não configurado no servidor.",
          code: "SESSION_UNAVAILABLE",
        });
      }

      res.json({ user, token });
    } catch (error: any) {
      console.error("Erro no login direto com Google:", error);
      res.status(500).json({ error: error.message || "Falha ao autenticar com o Google" });
    }
  });

  // Autenticação: Login / Registrar Sincronizado (token do provedor já validado)
  app.post("/api/auth/login", requireAuth, async (req: AuthRequest, res) => {
    try {
      const authUser = req.user as any;
      if (!authUser) {
        return res.status(401).json({ error: "Contexto de autenticação ausente" });
      }

      const uid = authUser.uid || authUser.sub;
      const email = authUser.email || "";
      const name = req.body?.nome || authUser.name || (email ? email.split("@")[0] : "Usuário");
      const picture = req.body?.foto_perfil || authUser.picture || "";
      const provider = req.authSource === "supabase" || authUser.iss?.includes("supabase") ? "google" : "local";

      if (!uid) {
        return res.status(400).json({ error: "UID não identificado no token de autenticação." });
      }

      const user = await getOrCreateUser(uid, email, name, picture, provider, "Aluno");

      if (user && user.ativo === false) {
        return res.status(403).json({
          error: "Sua conta foi bloqueada ou desativada pela administração. Entre em contato com a equipe do eloEscola para regularizar seu acesso."
        });
      }

      res.json({ user });
    } catch (error: any) {
      console.error("Erro no fluxo de login:", error);
      res.status(500).json({ error: error.message || "Falha geral de autenticação" });
    }
  });

  // Autenticação: Login de Convidado (Modo Visitante sem senha nem CGM)
  app.post("/api/auth/guest-login", async (req, res) => {
    try {
      const guestId = crypto.randomInt(20000, 99999);
      const guestUser = {
        id: guestId,
        uid: `guest-${guestId}`,
        nome: "Convidado",
        email: `visitante_${guestId}@eloescola.local`,
        role: "Convidado",
        isGuest: true,
        ativo: true,
        isAdmin: false,
        institution: "eloEscola",
        createdAt: new Date().toISOString()
      };

      // Convidado também recebe sessão assinada — nenhum token é montado por
      // concatenação de strings no cliente.
      const token = await issueSession(req, { uid: guestUser.uid, email: guestUser.email }, "guest");
      res.json({ user: guestUser, token });
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao iniciar sessão de convidado." });
    }
  });

  // Autenticação: Login Institucional da Escola
  app.post("/api/auth/institutional-login", authLimiter(), async (req, res) => {
    try {
      const { identificador, password } = req.body;
      if (!identificador || !password) {
        return res.status(400).json({ error: "Identificador institucional e senha são obrigatórios." });
      }

      // 1) Contas escolares na tabela dedicada (senha com hash).
      const schoolAccount = await autenticarContaEscolar(identificador, password).catch(() => null);
      if (schoolAccount?.user) {
        const token = await issueSession(
          req,
          { uid: schoolAccount.user.uid, email: schoolAccount.user.email },
          "school"
        );
        return res.json({ user: schoolAccount.user, token });
      }

      // 2) Fallback da loja institucional local (apenas quando o banco não está
      //    disponível). A senha é comparada com hash quando já migrada.
      const account = authenticateInstitutionalAccountFallback(identificador, password);
      if (!account) {
        return res.status(401).json({ error: "Identificador institucional ou senha incorretos." });
      }

      const schoolUser = {
        id: 70000 + account.escolaId,
        uid: `inst-${account.identificador}`,
        nome: account.escolaNome,
        email: account.email,
        role: "Escola",
        escolaId: account.escolaId,
        escolaNome: account.escolaNome,
        identificador: account.identificador,
        ativo: true,
        isAdmin: false,
        institution: account.escolaNome,
        createdAt: account.createdAt,
        lastLogin: new Date().toISOString()
      };

      const token = await issueSession(req, { uid: schoolUser.uid, email: schoolUser.email }, "school");
      res.json({ user: schoolUser, token, schoolAccount: account });
    } catch (err: any) {
      res.status(403).json({ error: err.message || "Falha na autenticação institucional." });
    }
  });
  // Autenticação: Obter Perfil do database
  app.get("/api/auth/profile", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Sessão inválida" });
      }

      // Se for sessão de convidado
      if (req.user.uid.startsWith("guest-")) {
        return res.json({
          user: {
            id: 99999,
            uid: req.user.uid,
            nome: "Convidado",
            email: req.user.email || "visitante@eloescola.local",
            role: "Convidado",
            isGuest: true,
            ativo: true,
            isAdmin: false,
            institution: "eloEscola"
          }
        });
      }

      // Se for conta institucional
      if (req.user.uid.startsWith("inst-")) {
        const idClean = req.user.uid.replace("inst-", "");
        const accounts = listInstitutionalAccountsFallback();
        const acc = accounts.find(a => a.identificador.toLowerCase() === idClean.toLowerCase());
        if (acc) {
          return res.json({
            user: {
              id: 70000 + acc.escolaId,
              uid: req.user.uid,
              nome: acc.escolaNome,
              email: acc.email,
              role: "Escola",
              escolaId: acc.escolaId,
              escolaNome: acc.escolaNome,
              identificador: acc.identificador,
              ativo: acc.status === "ativo",
              isAdmin: false,
              institution: acc.escolaNome
            }
          });
        }
      }

      let dbUser = await getUserByUid(req.user.uid);
      if (!dbUser && req.user.email) {
        dbUser = await getUserByEmail(req.user.email);
      }

      if (!dbUser) {
        return res.status(404).json({ error: "Usuário não encontrado no banco" });
      }

      if (dbUser.ativo === false) {
        return res.status(403).json({
          error: "Sua conta foi bloqueada ou desativada pela administração.",
          blocked: true,
          user: dbUser
        });
      }

      res.json({ user: dbUser });
    } catch (error: any) {
      console.error("Erro ao obter perfil:", error);
      res.status(500).json({ error: error.message || "Falha ao obter perfil" });
    }
  });

  // Autenticação: Logout
  app.post("/api/auth/logout", (req, res) => {
    res.json({ success: true, message: "Logout realizado com sucesso" });
  });

  // Usuário: Atualizar próprio perfil do app
  app.put("/api/users/profile", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Acesso negado" });
      }

      const { nome, cpf, phone, birthdate, gender, institution, role, foto_perfil } = req.body;

      // Sanitizar dados
      const updateData: any = {};
      if (nome !== undefined) updateData.nome = String(nome).trim();
      if (cpf !== undefined) updateData.cpf = String(cpf).trim();
      if (phone !== undefined) updateData.phone = String(phone).trim();
      if (birthdate !== undefined) updateData.birthdate = String(birthdate).trim();
      if (gender !== undefined) updateData.gender = String(gender).trim();
      if (institution !== undefined) updateData.institution = String(institution).trim();
      if (foto_perfil !== undefined) updateData.foto_perfil = String(foto_perfil).trim();

      // Segurança: Apenas o Chefe Administrador pode alterar o próprio papel para admin
      if (role !== undefined) {
        const currentUserInDb = await getUserByUid(req.user.uid);
        const isSelfChefe = checkIsChefe(currentUserInDb, req.user);
        if (isSelfChefe) {
          updateData.role = String(role).trim();
        } else if (role !== "Diretor" && role !== "Chefe Administrador" && role !== "Funcionário") {
          updateData.role = String(role).trim();
        }
      }
      updateData.lastActiveAt = new Date();

      const updatedUser = await updateUserByUid(req.user.uid, updateData);
      res.json({ user: updatedUser });
    } catch (error: any) {
      console.error("Erro ao atualizar perfil do usuário:", error);
      res.status(500).json({ error: error.message || "Erro ao salvar perfil" });
    }
  });

  // User activity ping / heartbeat
  app.post("/api/users/heartbeat", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Acesso negado" });
      }
      const now = new Date();
      await updateUserByUid(req.user.uid, { lastActiveAt: now });
      res.json({ success: true, lastActiveAt: now.toISOString() });
    } catch (error: any) {
      console.error("Erro no heartbeat de atividade do usuário:", error);
      res.json({ success: false });
    }
  });

  // Administrativo / Diretório Escolar: Listar todos os usuários com controle de permissão por nível
  app.get("/api/users", requireAuth, requireAdminOrStaff, async (req: AuthRequest, res) => {
    try {
      const allUsers = await listAllUsers();
      const adminRole = (req as any).adminRole || 'funcionario';

      // 1. CHEFE ADMINISTRADOR: Acesso a todas as informações e colunas detalhadas
      if (adminRole === 'chefe') {
        const chefeView = allUsers.map((u: any) => {
          const { password, ...rest } = u;
          return {
            ...rest,
            ativo: rest.ativo !== false,
            isAdmin: rest.isAdmin || rest.role === 'Diretor'
          };
        });
        return res.json({ users: chefeView, adminRole: 'chefe' });
      }

      // 2. FUNCIONÁRIO ADMINISTRADOR: Acesso restrito às informações permitidas:
      // Nome, Email, Tipo/Função, Status da conta, Instituição, Data de Cadastro / Última atividade
      const funcionarioView = allUsers.map(u => ({
        id: u.id,
        uid: u.uid,
        nome: u.nome,
        email: u.email,
        foto_perfil: u.foto_perfil,
        role: u.role,
        ativo: u.ativo !== false,
        institution: u.institution,
        createdAt: u.createdAt,
        lastActiveAt: u.lastActiveAt,
        lastLogin: u.lastLogin,
        isAdmin: u.isAdmin || u.role === 'Diretor'
      }));

      return res.json({ users: funcionarioView, adminRole: 'funcionario' });
    } catch (error: any) {
      console.error("Erro ao listar usuários:", error);
      res.status(500).json({ error: error.message || "Falha ao obter usuários" });
    }
  });

  // Administrativo: Atualizar dados/permissões de usuário (Exclusivo CHEFE ADMINISTRADOR)
  app.put("/api/users/:id", requireAuth, requireChefeAdmin, async (req: AuthRequest, res) => {
    try {
      const rawId = req.params.id;
      const userId = parseInt(rawId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "ID de usuário inválido" });
      }

      const { nome, email, role, isAdmin, ativo, password, institution, phone, cpf, birthdate, gender, foto_perfil } = req.body;
      const updateData: any = {};
      if (nome !== undefined) updateData.nome = String(nome).trim();
      if (email !== undefined) updateData.email = String(email).trim().toLowerCase();
      if (role !== undefined) updateData.role = String(role).trim();
      if (isAdmin !== undefined) updateData.isAdmin = Boolean(isAdmin);
      if (ativo !== undefined) updateData.ativo = Boolean(ativo);
      if (password !== undefined && String(password).trim()) updateData.password = String(password).trim();
      if (institution !== undefined) updateData.institution = String(institution).trim();
      if (phone !== undefined) updateData.phone = String(phone).trim();
      if (cpf !== undefined) updateData.cpf = String(cpf).trim();
      if (birthdate !== undefined) updateData.birthdate = String(birthdate).trim();
      if (gender !== undefined) updateData.gender = String(gender).trim();
      if (foto_perfil !== undefined) updateData.foto_perfil = String(foto_perfil).trim();

      const callerDbUser = (req as any).dbUser || await getUserByUid(req.user!.uid);

      // Proteção de segurança: O Chefe não pode rebaixar a si próprio nem bloquear sua própria conta
      const isCaller =
        (callerDbUser && callerDbUser.id === userId) ||
        (callerDbUser && updateData.email && (callerDbUser.email || '').toLowerCase() === updateData.email) ||
        (req.user?.email && updateData.email && req.user.email.toLowerCase() === updateData.email);

      if (isCaller) {
        if (isAdmin === false || (role && role !== 'Diretor' && role !== 'Chefe Administrador')) {
          return res.status(400).json({ error: "Você não pode remover seus próprios privilégios de Chefe Administrador" });
        }
        if (ativo === false) {
          return res.status(400).json({ error: "Você não pode bloquear sua própria conta de Chefe Administrador" });
        }
      }

      const updatedUser = await updateUserById(userId, updateData);
      res.json({ success: true, user: updatedUser });
    } catch (error: any) {
      console.error("Erro ao atualizar dados do usuário:", error);
      res.status(500).json({ error: error.message || "Erro ao atualizar permissões e dados do usuário" });
    }
  });

  // Administrativo: Bloquear usuário no banco (Exclusivo CHEFE ADMINISTRADOR)
  app.post("/api/users/:id/block", requireAuth, requireChefeAdmin, async (req: AuthRequest, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "ID inválido" });
      }

      const email = req.body?.email || req.query?.email;
      const callerDbUser = (req as any).dbUser || await getUserByUid(req.user!.uid);
      if (callerDbUser && (callerDbUser.id === userId || (email && callerDbUser.email?.toLowerCase() === String(email).toLowerCase()))) {
        return res.status(400).json({ error: "Você não pode bloquear sua própria conta de Chefe Administrador" });
      }

      const blockedUser = await blockUserById(userId, email ? String(email) : undefined);
      res.json({ success: true, user: blockedUser });
    } catch (error: any) {
      console.error("Erro ao bloquear usuário:", error);
      res.status(500).json({ error: error.message || "Não foi possível bloquear o usuário" });
    }
  });

  // Administrativo: Desbloquear / Reativar conta de usuário no banco (Exclusivo CHEFE ADMINISTRADOR)
  app.post("/api/users/:id/unblock", requireAuth, requireChefeAdmin, async (req: AuthRequest, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "ID inválido" });
      }

      const email = req.body?.email || req.query?.email;
      const unblockedUser = await unblockUserById(userId, email ? String(email) : undefined);
      res.json({ success: true, user: unblockedUser });
    } catch (error: any) {
      console.error("Erro ao desbloquear usuário:", error);
      res.status(500).json({ error: error.message || "Não foi possível desbloquear o usuário" });
    }
  });

  // Administrativo: Excluir definitivamente usuário do database (Exclusivo CHEFE ADMINISTRADOR)
  app.delete("/api/users/:id/permanent", requireAuth, requireChefeAdmin, async (req: AuthRequest, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "ID inválido" });
      }

      const email = req.body?.email || req.query?.email;
      // Evitar deletar a si mesmo
      const callerDbUser = (req as any).dbUser || await getUserByUid(req.user!.uid);
      if (callerDbUser && (callerDbUser.id === userId || (email && callerDbUser.email?.toLowerCase() === String(email).toLowerCase()))) {
        return res.status(400).json({ error: "Você não pode excluir sua própria conta escolar ativa" });
      }

      const deletedUser = await deleteUserPermanentlyById(userId, email ? String(email) : undefined);
      res.json({ success: true, user: deletedUser });
    } catch (error: any) {
      console.error("Erro ao excluir permanentemente usuário:", error);
      res.status(500).json({ error: error.message || "Não foi possível excluir o usuário" });
    }
  });

  // Administrativo: Bloqueio suave / soft-delete (Exclusivo CHEFE ADMINISTRADOR)
  app.delete("/api/users/:id", requireAuth, requireChefeAdmin, async (req: AuthRequest, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "ID inválido" });
      }

      const email = req.body?.email || req.query?.email;
      // Evitar deletar a si mesmo
      const callerDbUser = (req as any).dbUser || await getUserByUid(req.user!.uid);
      if (callerDbUser && (callerDbUser.id === userId || (email && callerDbUser.email?.toLowerCase() === String(email).toLowerCase()))) {
        return res.status(400).json({ error: "Você não pode bloquear sua própria conta escolar ativa" });
      }

      const softDeletedUser = await blockUserById(userId, email ? String(email) : undefined);
      res.json({ success: true, user: softDeletedUser });
    } catch (error: any) {
      console.error("Erro ao suspender usuário:", error);
      res.status(500).json({ error: error.message || "Não foi possível suspender o usuário" });
    }
  });

  // --- EVENTS ENDPOINTS ---

  // Obter Feed de Eventos (Público)
  app.get("/api/events", async (req, res) => {
    try {
      const events = await listAllEvents();
      res.json({ events });
    } catch (error: any) {
      console.error("Erro ao obter eventos:", error);
      res.status(500).json({ error: error.message || "Falha ao obter eventos" });
    }
  });

  // Criar Novo Evento (Chefe Administrador ou Funcionário Administrador)
  app.post("/api/events", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { title, location, day, month, year, time, isPaid, price, requirements, website, image } = req.body;

      if (!title || !location || !day || isNaN(month) || !year) {
        return res.status(400).json({ error: "Parâmetros obrigatórios incompletos" });
      }

      let dbUser = await getUserByUid(req.user!.uid);
      if (!dbUser && req.user?.email) {
        dbUser = await getUserByEmail(req.user.email);
      }
      if (!dbUser && req.user) {
        dbUser = await getOrCreateUser(
          req.user.uid,
          req.user.email || '',
          (req.user as any).name || 'Usuário',
          (req.user as any).picture || '',
          req.user.firebase?.sign_in_provider === 'google.com' ? 'google' : 'local',
          (req.user as any).role || 'Aluno'
        );
      }

      if (dbUser && dbUser.ativo === false) {
        return res.status(403).json({
          error: "Sua conta está bloqueada pela administração escolar.",
          blocked: true
        });
      }

      const isChefe = checkIsChefe(dbUser, req.user);
      const isFuncionario = checkIsFuncionario(dbUser, req.user);

      if (!isChefe && !isFuncionario) {
        return res.status(403).json({
          error: "Acesso negado: Apenas Administradores (Chefe ou Funcionário) podem publicar eventos escolares."
        });
      }

      // Validação de data também no backend: o formulário já bloqueia datas
      // passadas, mas a API é a fonte de verdade e não pode aceitá-las.
      const dateError = validateEventDate(Number(day), Number(month), Number(year));
      if (dateError) {
        return res.status(400).json({ error: dateError });
      }

      // Conteúdo não permitido (balada, rave, festa, show) é barrado na API;
      // a UI também filtra, mas a checagem no servidor é a que vale.
      const conteudo = detectForbiddenContent({
        title,
        description: req.body.description,
        category: req.body.category,
        requirements,
      });
      if (conteudo.proibido) {
        return res.status(400).json({ error: conteudo.motivo });
      }

      const creatorId = dbUser ? dbUser.id : null;

      const newEvent = await createNewEvent({
        title: String(title).trim(),
        location: String(location).trim(),
        day: Number(day),
        month: Number(month),
        year: Number(year),
        time: time ? String(time).trim() : "18:00",
        isPaid: Boolean(isPaid),
        price: price ? String(price).trim() : null,
        requirements: requirements ? String(requirements).trim() : "",
        website: website ? String(website).trim() : null,
        image: image ? String(image).trim() : "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=400",
        creatorId: creatorId || undefined,
      });

      res.status(201).json({ event: newEvent });
    } catch (error: any) {
      console.error("Erro ao criar evento:", error);
      res.status(500).json({ error: error.message || "Erro no salvamento do evento" });
    }
  });

  // Atualizar / Editar Evento por ID
  // Chefe Administrador: pode editar qualquer evento
  // Funcionário Administrador: pode editar apenas eventos criados por ele mesmo
  app.put("/api/events/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "ID de evento inválido" });
      }

      let dbUser = await getUserByUid(req.user!.uid);
      if (!dbUser && req.user?.email) {
        dbUser = await getUserByEmail(req.user.email);
      }

      if (dbUser && dbUser.ativo === false) {
        return res.status(403).json({
          error: "Sua conta está bloqueada pela administração escolar.",
          blocked: true
        });
      }

      const isChefe = checkIsChefe(dbUser, req.user);
      const isFuncionario = checkIsFuncionario(dbUser, req.user);

      const allEvents = await listAllEvents();
      const targetEvent = allEvents.find(e => e.id === eventId);
      if (!targetEvent) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }

      // Regra de permissão: Chefe pode editar qualquer um; Funcionário apenas o seu próprio
      if (!isChefe) {
        if (!isFuncionario) {
          return res.status(403).json({ error: "Acesso negado: Requer privilégios de Administrador para editar eventos." });
        }
        if (!dbUser || targetEvent.creatorId !== dbUser.id) {
          return res.status(403).json({
            error: "Acesso negado: Como Funcionário Administrador, você só pode editar eventos criados por você mesmo."
          });
        }
      }

      const { title, location, day, month, year, time, isPaid, price, requirements, website, image } = req.body;

      // Ao mexer na data, valida a data resultante (campos omitidos herdam do evento atual).
      if (day !== undefined || month !== undefined || year !== undefined) {
        const dateError = validateEventDate(
          Number(day !== undefined ? day : targetEvent.day),
          Number(month !== undefined ? month : targetEvent.month),
          Number(year !== undefined ? year : targetEvent.year)
        );
        if (dateError) {
          return res.status(400).json({ error: dateError });
        }
      }

      const updatePayload: any = {};
      if (title !== undefined) updatePayload.title = String(title).trim();
      if (location !== undefined) updatePayload.location = String(location).trim();
      if (day !== undefined) updatePayload.day = Number(day);
      if (month !== undefined) updatePayload.month = Number(month);
      if (year !== undefined) updatePayload.year = Number(year);
      if (time !== undefined) updatePayload.time = String(time).trim();
      if (isPaid !== undefined) updatePayload.isPaid = Boolean(isPaid);
      if (price !== undefined) updatePayload.price = price ? String(price).trim() : null;
      if (requirements !== undefined) updatePayload.requirements = requirements ? String(requirements).trim() : "";
      if (website !== undefined) updatePayload.website = website ? String(website).trim() : null;
      if (image !== undefined) updatePayload.image = image ? String(image).trim() : targetEvent.image;

      const updated = await updateEventById(eventId, updatePayload);
      res.json({ success: true, event: updated });
    } catch (error: any) {
      console.error("Erro ao atualizar evento:", error);
      res.status(500).json({ error: error.message || "Erro na atualização do evento" });
    }
  });

  // Excluir Evento por ID
  // Chefe Administrador: pode excluir qualquer evento
  // Funcionário Administrador: pode excluir apenas eventos criados por ele mesmo
  app.delete("/api/events/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "ID de evento inválido" });
      }

      let dbUser = await getUserByUid(req.user!.uid);
      if (!dbUser && req.user?.email) {
        dbUser = await getUserByEmail(req.user.email);
      }

      if (dbUser && dbUser.ativo === false) {
        return res.status(403).json({
          error: "Sua conta está bloqueada pela administração escolar.",
          blocked: true
        });
      }

      const isChefe = checkIsChefe(dbUser, req.user);
      const isFuncionario = checkIsFuncionario(dbUser, req.user);

      const allEvents = await listAllEvents();
      const targetEvent = allEvents.find(e => e.id === eventId);
      if (!targetEvent) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }

      // Regra de permissão: Chefe pode excluir qualquer um; Funcionário apenas o seu próprio
      if (!isChefe) {
        if (!isFuncionario) {
          return res.status(403).json({ error: "Acesso negado: Requer privilégios de Administrador para excluir eventos." });
        }
        if (!dbUser || targetEvent.creatorId !== dbUser.id) {
          return res.status(403).json({
            error: "Acesso negado: Como Funcionário Administrador, você só pode excluir eventos criados por você mesmo."
          });
        }
      }

      const deleted = await deleteEventById(eventId);
      res.json({ success: true, event: deleted });
    } catch (error: any) {
      console.error("Erro ao deletar evento:", error);
      res.status(500).json({ error: error.message || "Erro na exclusão do evento" });
    }
  });

  // --- ESCOLAS DE ARAUCÁRIA & COMUNICADOS DINÂMICOS ---

  // Listar todas as 6 escolas cadastradas
  // Catálogo público de escolas de Araucária.
  //
  // Fica aberto de propósito: é o diretório institucional (nome, endereço,
  // contato da secretaria), não dado de instituição cliente. Nenhum dado de
  // aluno, responsável ou assinatura passa por estas duas rotas — elas leem a
  // lista estática `ARAUCARIA_SCHOOLS`, não as tabelas multi-tenant.
  app.get("/api/schools", (req, res) => {
    try {
      res.json({ schools: ARAUCARIA_SCHOOLS });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao obter lista de escolas de Araucária." });
    }
  });

  // Obter detalhes completos de uma escola específica pelo slug
  app.get("/api/schools/:slug", (req, res) => {
    try {
      const school = getSchoolBySlug(req.params.slug);
      if (!school) {
        return res.status(404).json({ error: "Escola não encontrada em Araucária." });
      }
      res.json({ school });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao obter detalhes da instituição." });
    }
  });

  // Publicar notícia/comunicado da escola (Conta Institucional da própria escola ou Chefe Administrador)
  app.post("/api/schools/:slug/news", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { slug } = req.params;
      const school = getSchoolBySlug(slug);
      if (!school) {
        return res.status(404).json({ error: "Escola não encontrada." });
      }

      // Validação de permissão: Administrador Chefe OU Conta Institucional correspondente
      let dbUser = await getUserByUid(req.user!.uid);
      if (!dbUser && req.user?.email) {
        dbUser = await getUserByEmail(req.user.email);
      }
      const isChefe = checkIsChefe(dbUser, req.user);
      const isInstOwner = req.user?.uid.startsWith("inst-") && (
        req.user?.uid.toLowerCase().includes(slug.replace(/-/g, "")) ||
        (req.user as any).escolaNome === school.name ||
        (req.user as any).escolaId === school.id
      );

      if (!isChefe && !isInstOwner) {
        return res.status(403).json({
          error: `Acesso negado: Somente a direção do ${school.shortName} ou o Administrador Chefe podem publicar comunicados nesta página.`
        });
      }

      const { title, description, category, author } = req.body;
      if (!title || !description) {
        return res.status(400).json({ error: "Título e descrição do comunicado são obrigatórios." });
      }

      const newsItem = addSchoolNews(slug, {
        title: String(title).trim(),
        description: String(description).trim(),
        date: new Date().toLocaleDateString("pt-BR"),
        author: author ? String(author).trim() : school.shortName,
        category: category || "Comunicado",
        source: `Publicação Oficial • ${school.shortName}`
      });

      res.status(201).json({ success: true, news: newsItem, school: getSchoolBySlug(slug) });
    } catch (error: any) {
      console.error("Erro ao publicar comunicado da escola:", error);
      res.status(500).json({ error: error.message || "Erro ao publicar notícia da escola." });
    }
  });

  // Publicar evento da escola (Conta Institucional da própria escola ou Chefe Administrador)
  app.post("/api/schools/:slug/events", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { slug } = req.params;
      const school = getSchoolBySlug(slug);
      if (!school) {
        return res.status(404).json({ error: "Escola não encontrada." });
      }

      let dbUser = await getUserByUid(req.user!.uid);
      if (!dbUser && req.user?.email) {
        dbUser = await getUserByEmail(req.user.email);
      }
      const isChefe = checkIsChefe(dbUser, req.user);
      const isInstOwner = req.user?.uid.startsWith("inst-") && (
        req.user?.uid.toLowerCase().includes(slug.replace(/-/g, "")) ||
        (req.user as any).escolaNome === school.name ||
        (req.user as any).escolaId === school.id
      );

      if (!isChefe && !isInstOwner) {
        return res.status(403).json({
          error: `Acesso negado: Somente a gestão do ${school.shortName} ou o Administrador Chefe podem publicar eventos para esta instituição.`
        });
      }

      const { title, description, date, time, location, category, isFree, registrationUrl } = req.body;
      if (!title || !date) {
        return res.status(400).json({ error: "Título e data do evento são obrigatórios." });
      }

      const eventItem = addSchoolEvent(slug, {
        title: String(title).trim(),
        description: description ? String(description).trim() : "",
        date: String(date).trim(),
        time: time ? String(time).trim() : "19:00",
        location: location ? String(location).trim() : school.address,
        category: category || "Cultura",
        isFree: isFree !== false,
        registrationUrl: registrationUrl ? String(registrationUrl).trim() : undefined,
        source: `Agenda Oficial ${school.shortName}`
      });

      // Também sincroniza com o calendário geral do eloEscola
      try {
        const parts = String(date).split(/[-/]/);
        let day = 15, month = 10, year = 2026;
        if (parts.length === 3) {
          if (parts[0].length === 4) { // YYYY-MM-DD
            year = parseInt(parts[0]);
            month = parseInt(parts[1]) - 1;
            day = parseInt(parts[2]);
          } else { // DD/MM/YYYY
            day = parseInt(parts[0]);
            month = parseInt(parts[1]) - 1;
            year = parseInt(parts[2]);
          }
        }

        await createNewEvent({
          title: `[${school.shortName}] ${title}`,
          location: location || school.address,
          day,
          month,
          year,
          time: time || "19:00",
          isPaid: !isFree,
          price: isFree ? null : "R$ 10,00",
          requirements: `Evento oficial organizado pelo ${school.name}.`,
          website: registrationUrl || undefined,
          image: school.image,
          lat: school.coordinates.lat,
          lng: school.coordinates.lng,
          city: "Araucária",
          category: category || "Escolar",
          schoolName: school.name,
          creatorId: dbUser?.id || 9901
        } as any);
      } catch (syncErr) {
        console.warn("Aviso: Falha ao sincronizar evento institucional com catálogo geral:", syncErr);
      }

      res.status(201).json({ success: true, event: eventItem, school: getSchoolBySlug(slug) });
    } catch (error: any) {
      console.error("Erro ao cadastrar evento da escola:", error);
      res.status(500).json({ error: error.message || "Erro ao cadastrar evento institucional." });
    }
  });

  // --- GESTÃO DE CONTAS INSTITUCIONAIS DAS ESCOLAS (EXCLUSIVO ADM CHEFE) ---

  // Listar contas institucionais
  app.get("/api/admin/institutional-accounts", requireAuth, async (req: AuthRequest, res) => {
    try {
      let dbUser = await getUserByUid(req.user!.uid);
      if (!dbUser && req.user?.email) {
        dbUser = await getUserByEmail(req.user.email);
      }
      if (!checkIsChefe(dbUser, req.user)) {
        return res.status(403).json({ error: "Acesso restrito: Somente o Administrador Chefe pode gerenciar as contas institucionais das escolas." });
      }

      const accounts = listInstitutionalAccountsFallback();
      // Não expor senhas em texto puro desnecessariamente na listagem
      const sanitized = accounts.map(a => ({
        id: a.id,
        escolaId: a.escolaId,
        escolaNome: a.escolaNome,
        escolaSlug: a.escolaSlug,
        identificador: a.identificador,
        email: a.email,
        status: a.status,
        accountStatus: a.accountStatus || (a.status === "ativo" ? "active" : "suspended"),
        verificationStatus: a.verificationStatus || "verified",
        verificationMethod: a.verificationMethod || "Verificação oficial pela direção escolar e portaria NRE",
        verifiedBy: a.verifiedBy || "ADM Chefe",
        verifiedAt: a.verifiedAt || a.createdAt,
        responsavel: a.responsavel,
        representativeName: a.representativeName || a.responsavel || "Representante Institucional",
        institutionalContact: a.institutionalContact || a.email || "(41) 3642-1000",
        cargo: a.cargo,
        createdAt: a.createdAt,
        lastLogin: a.lastLogin,
        lastLoginAt: a.lastLoginAt || a.lastLogin
      }));

      res.json({ accounts: sanitized });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao listar contas institucionais." });
    }
  });

  // Criar nova conta institucional (Exclusivo ADM Chefe)
  app.post("/api/admin/institutional-accounts", requireAuth, async (req: AuthRequest, res) => {
    try {
      let dbUser = await getUserByUid(req.user!.uid);
      if (!dbUser && req.user?.email) {
        dbUser = await getUserByEmail(req.user.email);
      }
      if (!checkIsChefe(dbUser, req.user)) {
        return res.status(403).json({ error: "Acesso restrito: Somente o Administrador Chefe pode criar contas institucionais." });
      }

      const {
        escolaId,
        escolaNome,
        identificador,
        password,
        email,
        responsavel,
        cargo,
        institutionalContact,
        verificationMethod
      } = req.body;

      if (!escolaId || !escolaNome || !identificador || !password) {
        return res.status(400).json({ error: "ID da escola, nome, identificador e senha inicial são obrigatórios." });
      }

      const newAccount = createInstitutionalAccountFallback({
        escolaId: Number(escolaId),
        escolaNome: String(escolaNome).trim(),
        identificador: String(identificador).trim().toLowerCase(),
        password: String(password).trim(),
        email: email ? String(email).trim().toLowerCase() : `${identificador}@escola.pr.gov.br`,
        responsavel: responsavel ? String(responsavel).trim() : "Direção Geral",
        cargo: cargo ? String(cargo).trim() : "Diretor(a)"
      });

      if (institutionalContact) {
        newAccount.institutionalContact = String(institutionalContact).trim();
      }
      if (verificationMethod) {
        newAccount.verificationMethod = String(verificationMethod).trim();
      }

      res.status(201).json({ success: true, account: newAccount });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao criar conta institucional." });
    }
  });

  // Validar / Alterar Verificação de Identidade Institucional (Exclusivo ADM Chefe)
  app.put("/api/admin/institutional-accounts/:id/verify", requireAuth, async (req: AuthRequest, res) => {
    try {
      let dbUser = await getUserByUid(req.user!.uid);
      if (!dbUser && req.user?.email) {
        dbUser = await getUserByEmail(req.user.email);
      }
      if (!checkIsChefe(dbUser, req.user)) {
        return res.status(403).json({ error: "Acesso restrito: Somente o Administrador Chefe pode verificar instituições." });
      }

      const id = parseInt(req.params.id, 10);
      const { verificationStatus, verificationMethod } = req.body;

      if (!verificationStatus || !["verified", "rejected", "pending_verification"].includes(verificationStatus)) {
        return res.status(400).json({ error: "Status de verificação inválido ('verified', 'rejected' ou 'pending_verification')." });
      }

      const updated = verifySchoolAccountFallback(
        id,
        verificationStatus as any,
        verificationMethod || "Verificação formal realizada pelo ADM Chefe",
        dbUser?.nome || req.user?.name || "ADM Chefe"
      );

      res.json({ success: true, account: updated });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao verificar conta institucional." });
    }
  });

  // Alterar Situação da Conta (Ativar / Suspender / Revogar) (Exclusivo ADM Chefe)
  app.put("/api/admin/institutional-accounts/:id/status", requireAuth, async (req: AuthRequest, res) => {
    try {
      let dbUser = await getUserByUid(req.user!.uid);
      if (!dbUser && req.user?.email) {
        dbUser = await getUserByEmail(req.user.email);
      }
      if (!checkIsChefe(dbUser, req.user)) {
        return res.status(403).json({ error: "Acesso restrito: Somente o Administrador Chefe pode suspender ou ativar contas das escolas." });
      }

      const id = parseInt(req.params.id, 10);
      const { accountStatus } = req.body;

      if (!accountStatus || !["active", "suspended", "revoked"].includes(accountStatus)) {
        return res.status(400).json({ error: "Situação da conta inválida ('active', 'suspended' ou 'revoked')." });
      }

      const updated = updateSchoolAccountStatusFallback(
        id,
        accountStatus as any,
        dbUser?.nome || req.user?.name || "ADM Chefe"
      );

      res.json({ success: true, account: updated });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao atualizar status da conta institucional." });
    }
  });

  // Alternar status (Ativar / Bloquear conta institucional)
  app.put("/api/admin/institutional-accounts/:id/toggle", requireAuth, async (req: AuthRequest, res) => {
    try {
      let dbUser = await getUserByUid(req.user!.uid);
      if (!dbUser && req.user?.email) {
        dbUser = await getUserByEmail(req.user.email);
      }
      if (!checkIsChefe(dbUser, req.user)) {
        return res.status(403).json({ error: "Acesso restrito: Somente o Administrador Chefe pode alterar o status das contas institucionais." });
      }

      const id = parseInt(req.params.id);
      const updated = toggleInstitutionalAccountFallback(id);
      res.json({ success: true, account: updated });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao alterar status da conta institucional." });
    }
  });

  // Redefinir senha de conta institucional
  app.put("/api/admin/institutional-accounts/:id/reset-password", requireAuth, async (req: AuthRequest, res) => {
    try {
      let dbUser = await getUserByUid(req.user!.uid);
      if (!dbUser && req.user?.email) {
        dbUser = await getUserByEmail(req.user.email);
      }
      if (!checkIsChefe(dbUser, req.user)) {
        return res.status(403).json({ error: "Acesso restrito: Somente o Administrador Chefe pode redefinir senhas das escolas." });
      }

      const id = parseInt(req.params.id);
      const { newPassword } = req.body;
      if (!newPassword || String(newPassword).trim().length < 6) {
        return res.status(400).json({ error: "A nova senha deve ter no mínimo 6 caracteres." });
      }

      const updated = resetInstitutionalPasswordFallback(id, String(newPassword).trim());
      res.json({ success: true, message: `Senha da conta institucional ${updated.escolaNome} redefinida com sucesso.` });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao redefinir senha institucional." });
    }
  });

  // Excluir conta institucional
  app.delete("/api/admin/institutional-accounts/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      let dbUser = await getUserByUid(req.user!.uid);
      if (!dbUser && req.user?.email) {
        dbUser = await getUserByEmail(req.user.email);
      }
      if (!checkIsChefe(dbUser, req.user)) {
        return res.status(403).json({ error: "Acesso restrito: Somente o Administrador Chefe pode excluir contas institucionais." });
      }

      const id = parseInt(req.params.id);
      const deleted = deleteInstitutionalAccountFallback(id);
      res.json({ success: true, account: deleted });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao excluir conta institucional." });
    }
  });

  // Consultar auditoria de atividades das contas escolares (Exclusivo ADM Chefe)
  app.get("/api/admin/school-accounts/audit-logs", requireAuth, async (req: AuthRequest, res) => {
    try {
      let dbUser = await getUserByUid(req.user!.uid);
      if (!dbUser && req.user?.email) {
        dbUser = await getUserByEmail(req.user.email);
      }
      if (!checkIsChefe(dbUser, req.user)) {
        return res.status(403).json({ error: "Acesso restrito ao Chefe Administrador." });
      }

      const schoolId = req.query.schoolId ? parseInt(req.query.schoolId as string, 10) : undefined;
      const logs = getSchoolAccountAuditLogsFallback(schoolId);
      res.json({ logs });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao consultar logs de auditoria." });
    }
  });

  // --- HISTÓRICO DE PARTICIPAÇÕES EM EVENTOS (PRESERVAÇÃO PERMANENTE NO PERFIL) ---

  // Listar participações do usuário (ativas e arquivadas preservadas)
  app.get("/api/users/:userId/participations", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "ID de usuário inválido." });
      }

      const participations = listUserParticipationsFallback(userId);
      res.json({ participations });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao carregar histórico de participações." });
    }
  });

  // Registrar confirmação de presença/participação em evento
  app.post("/api/users/:userId/participations", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { eventId, eventTitle, eventLocation, eventDate, eventTime } = req.body;
      if (!eventId || !eventTitle) {
        return res.status(400).json({ error: "ID e título do evento são obrigatórios para registrar participação." });
      }

      const participation = recordParticipationFallback({
        userId,
        eventId: Number(eventId),
        eventTitle: String(eventTitle).trim(),
        eventLocation: eventLocation ? String(eventLocation).trim() : "Local a confirmar",
        eventDate: eventDate ? String(eventDate).trim() : new Date().toLocaleDateString("pt-BR"),
        eventTime: eventTime ? String(eventTime).trim() : "18:00",
        confirmedAt: new Date().toISOString()
      });

      res.status(201).json({ success: true, participation });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao confirmar participação no evento." });
    }
  });

  // Listar histórico geral de eventos excluídos (retenção de 3 dias)
  // --- ARQUIVAMENTO E RETENÇÃO DE EVENTOS (exclusivo administração) ---
  //
  // Parte 2 da auditoria: estas quatro rotas eram PÚBLICAS. Qualquer visitante
  // podia listar o histórico arquivado das escolas, restaurar um evento para o
  // mural e — pior — disparar `cleanup-expired` em laço, forçando arquivamentos
  // e reescritas em massa. Todas passam a exigir administrador da instituição.
  app.get("/api/events/archived", requireAuth, requireAdminOrStaff, async (req: AuthRequest, res) => {
    try {
      const archived = listArchivedEventsFallback();
      res.json({ archived, retentionDays: EVENT_RETENTION_DAYS });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao consultar histórico de eventos." });
    }
  });

  // Restaurar evento arquivado de volta aos eventos ativos (Painel ADM)
  app.post("/api/events/:id/restore", requireAuth, requireAdminOrStaff, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "ID de evento inválido." });
      }
      const restored = restoreArchivedEventFallback(id);
      res.json({
        success: true,
        event: restored,
        message: `Evento "${restored.title}" restaurado com sucesso para os eventos ativos.`
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao restaurar evento arquivado." });
    }
  });

  // Consultar logs da rotina de arquivamento automático
  app.get("/api/events/archive-logs", requireAuth, requireAdminOrStaff, async (req: AuthRequest, res) => {
    try {
      const logs = getEventArchiveLogsFallback();
      res.json({ logs, retentionDays: EVENT_RETENTION_DAYS });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao consultar logs de arquivamento." });
    }
  });

  // Executar rotina manual de expiração de eventos (3 dias após encerramento)
  app.post("/api/events/cleanup-expired", requireAuth, requireAdminOrStaff, async (req: AuthRequest, res) => {
    try {
      const result = archiveAndPruneExpiredEvents();
      res.json({
        success: true,
        prunedCount: result.prunedCount,
        preservedCount: result.preservedCount,
        retentionDays: EVENT_RETENTION_DAYS,
        message: `Rotina concluída: ${result.prunedCount} eventos ultrapassando ${EVENT_RETENTION_DAYS} dias de encerramento foram arquivados com integridade de dados preservada.`
      });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao executar rotina de expiração." });
    }
  });

  // --- ALTERAÇÕES DE PERFIL (fila de aprovação) ---
  //
  // `profile_change_requests` também estava com UPDATE público: qualquer
  // visitante podia aprovar um pedido de mudança de nome/CPF/e-mail — e a
  // aprovação aplica o valor direto em `users`. Decisão passa ao servidor.
  const mapProfileRequestRow = (row: any) => ({
    id: Number(row.id),
    userId: Number(row.user_id),
    userUid: row.user_uid,
    userNome: row.user_nome || "Usuário",
    alteracoes: Object.entries(row.requested_changes || {}).map(([campo, valorNovo]) => ({
      campo,
      valorAnterior: (row.previous_values || {})[campo] ?? "",
      valorNovo,
    })),
    status: row.status || "pending",
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at ?? null,
    reviewedBy: row.reviewed_by ?? null,
    rejectionReason: row.rejection_reason ?? null,
  });

  app.get("/api/admin/profile-requests", requireAuth, requireAdminOrStaff, async (req: AuthRequest, res) => {
    const sb = getSaasAdminClient();
    if (!sb) {
      return res.status(503).json({ error: "As alterações de perfil exigem o servidor com SUPABASE_SECRET_KEY.", code: "SAAS_NOT_CONFIGURED" });
    }
    try {
      const status = String(req.query.status || "pending");
      let consulta = sb.from("profile_change_requests").select("*");
      if (status !== "all") consulta = consulta.eq("status", status);

      const { data, error } = await consulta.order("created_at", { ascending: false }).limit(200);
      if (error) if (isRedeIndisponivel(error)) return responderIndisponivel(res, "Não foi possível consultar as solicitações.");
        return res.status(500).json({ error: "Não foi possível consultar as solicitações." });

      res.json({ requests: (data || []).map(mapProfileRequestRow) });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao consultar as solicitações de perfil." });
    }
  });

  app.post(
    "/api/admin/profile-requests/:id/approve",
    requireAuth,
    requireChefeAdmin,
    async (req: AuthRequest, res) => {
      const sb = getSaasAdminClient();
      if (!sb) return res.status(503).json({ error: "Servidor sem SUPABASE_SECRET_KEY.", code: "SAAS_NOT_CONFIGURED" });

      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Identificador inválido." });

      try {
        const { data: linhas, error: erroBusca } = await sb
          .from("profile_change_requests")
          .select("*")
          .eq("id", id)
          .limit(1);

        if (erroBusca) return res.status(500).json({ error: "Não foi possível ler a solicitação." });
        if (!linhas || linhas.length === 0) return res.status(404).json({ error: "Solicitação não encontrada." });

        const pedido: any = linhas[0];
        if (pedido.status !== "pending") return res.status(409).json({ error: "Esta solicitação já foi revisada." });

        const reviewedBy = String((req.user as any)?.email || "ADM Chefe");

        // 1. Reivindica primeiro (evita aprovação dupla em duas abas).
        const { data: reivindicada, error: erroClaim } = await sb
          .from("profile_change_requests")
          .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: reviewedBy })
          .eq("id", id)
          .eq("status", "pending")
          .select("id");

        if (erroClaim) return res.status(500).json({ error: "Não foi possível reservar a solicitação." });
        if (!reivindicada || reivindicada.length === 0) {
          return res.status(409).json({ error: "Esta solicitação já foi revisada por outro administrador." });
        }

        // 2. Aplica no usuário. Só campos conhecidos; o resto é ignorado.
        const alteracoes = pedido.requested_changes || {};
        const permitidos = ["nome", "email", "cpf", "phone", "birthdate", "gender", "institution", "role"];
        const update: Record<string, any> = {};
        for (const campo of permitidos) {
          if (alteracoes[campo] !== undefined) update[campo] = String(alteracoes[campo]).trim();
        }

        if (Object.keys(update).length > 0) {
          const { error: erroUpdate } = await sb
            .from("users")
            .update({ ...update, updated_at: new Date().toISOString() })
            .eq("id", pedido.user_id);

          if (erroUpdate) {
            // Reverte o pedido para não perder a solicitação.
            await sb
              .from("profile_change_requests")
              .update({ status: "pending", reviewed_at: null, reviewed_by: null })
              .eq("id", id);
            return res.status(500).json({ error: "Não foi possível aplicar as alterações no perfil." });
          }
        }

        await logPlatformAudit({
          actorEmail: reviewedBy,
          action: "profile_request.approved",
          targetType: "profile_change_request",
          targetId: String(id),
          metadata: { userId: pedido.user_id, campos: Object.keys(update) },
        }).catch(() => {});

        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: "Erro ao aprovar a solicitação." });
      }
    }
  );

  app.post(
    "/api/admin/profile-requests/:id/reject",
    requireAuth,
    requireChefeAdmin,
    async (req: AuthRequest, res) => {
      const sb = getSaasAdminClient();
      if (!sb) return res.status(503).json({ error: "Servidor sem SUPABASE_SECRET_KEY.", code: "SAAS_NOT_CONFIGURED" });

      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Identificador inválido." });

      try {
        const reviewedBy = String((req.user as any)?.email || "ADM Chefe");
        const motivo = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

        const { error } = await sb
          .from("profile_change_requests")
          .update({
            status: "rejected",
            reviewed_at: new Date().toISOString(),
            reviewed_by: reviewedBy,
            rejection_reason: motivo || null,
          })
          .eq("id", id)
          .eq("status", "pending");

        if (error) return res.status(500).json({ error: "Não foi possível rejeitar a solicitação." });

        await logPlatformAudit({
          actorEmail: reviewedBy,
          action: "profile_request.rejected",
          targetType: "profile_change_request",
          targetId: String(id),
        }).catch(() => {});

        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: "Erro ao rejeitar a solicitação." });
      }
    }
  );

  // --- PERFIS INSTITUCIONAIS DAS ESCOLAS ---
  //
  // `school_profiles` tem leitura pública (ok: é a ficha da escola) mas a
  // ESCRITA também era pública — qualquer visitante podia reescrever nome,
  // endereço e telefone de uma escola no diretório. Leitura segue pública;
  // gravação agora exige Chefe Administrador.
  const mapSchoolProfileRow = (row: any) => ({
    slug: row.slug,
    name: row.name ?? undefined,
    shortName: row.short_name ?? undefined,
    type: row.type ?? undefined,
    neighborhood: row.neighborhood ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    address: row.address ?? undefined,
    cep: row.cep ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    website: row.website ?? undefined,
    network: row.network ?? undefined,
    nre: row.nre ?? undefined,
    modalities: Array.isArray(row.modalities) ? row.modalities : [],
    historicalOverview: row.historical_overview ?? undefined,
    pedagogicalHighlights: Array.isArray(row.pedagogical_highlights) ? row.pedagogical_highlights : [],
    infrastructure: Array.isArray(row.infrastructure) ? row.infrastructure : [],
    latitude: typeof row.latitude === "number" ? row.latitude : null,
    longitude: typeof row.longitude === "number" ? row.longitude : null,
    image: row.image ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    updatedBy: row.updated_by ?? undefined,
  });

  app.get("/api/school-profiles", async (_req, res) => {
    const sb = getSaasAdminClient();
    if (!sb) return res.json({ profiles: [] });
    try {
      const { data, error } = await sb.from("school_profiles").select("*");
      if (error) return res.json({ profiles: [] });
      res.json({ profiles: (data || []).map(mapSchoolProfileRow) });
    } catch {
      res.json({ profiles: [] });
    }
  });

  app.put("/api/school-profiles/:slug", requireAuth, requireChefeAdmin, async (req: AuthRequest, res) => {
    const sb = getSaasAdminClient();
    if (!sb) return res.status(503).json({ error: "Servidor sem SUPABASE_SECRET_KEY.", code: "SAAS_NOT_CONFIGURED" });

    const slug = String(req.params.slug || "").trim().toLowerCase();
    if (!/^[a-z0-9-]{2,80}$/.test(slug)) return res.status(400).json({ error: "Identificador de escola inválido." });

    const texto = (v: unknown) => {
      const t = String(v ?? "").trim();
      return t ? t : null;
    };
    const lista = (v: unknown) =>
      Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

    const corpo = req.body || {};

    const payload = {
      slug,
      name: texto(corpo.name),
      short_name: texto(corpo.shortName),
      type: texto(corpo.type),
      neighborhood: texto(corpo.neighborhood),
      city: texto(corpo.city),
      state: texto(corpo.state),
      address: texto(corpo.address),
      cep: texto(corpo.cep),
      phone: texto(corpo.phone),
      email: texto(corpo.email),
      website: texto(corpo.website),
      network: texto(corpo.network),
      nre: texto(corpo.nre),
      modalities: lista(corpo.modalities),
      historical_overview: texto(corpo.historicalOverview),
      pedagogical_highlights: lista(corpo.pedagogicalHighlights),
      infrastructure: lista(corpo.infrastructure),
      latitude: typeof corpo.latitude === "number" ? corpo.latitude : null,
      longitude: typeof corpo.longitude === "number" ? corpo.longitude : null,
      image: texto(corpo.image),
      updated_at: new Date().toISOString(),
      updated_by: String((req.user as any)?.email || "ADM Chefe"),
    };

    try {
      const { data, error } = await sb
        .from("school_profiles")
        .upsert(payload, { onConflict: "slug" })
        .select();

      if (error) return res.status(500).json({ error: "Não foi possível gravar as informações da escola." });
      if (!data || data.length === 0) return res.status(500).json({ error: "As informações não foram gravadas." });

      await logPlatformAudit({
        actorEmail: String((req.user as any)?.email || ""),
        action: "school_profile.updated",
        targetType: "school_profile",
        targetId: slug,
      }).catch(() => {});

      res.json({ profile: mapSchoolProfileRow(data[0]) });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao gravar as informações da escola." });
    }
  });

  // --- CONTAS ESCOLARES (equipe gestora) — exclusivo do Chefe ---
  //
  // Antes o painel lia/gravava direto no Supabase com a chave publicável.
  // `school_accounts` guarda senha (mesmo em hash) e dados do responsável, e a
  // RLS foi fechada na Parte 2 — o que, sem estas rotas, deixava a aba "Contas
  // das Escolas" simplesmente vazia. Aqui o servidor usa a chave de serviço e
  // devolve a visão de gestão, sem senha.
  const mapSchoolAccountRow = (row: any) => ({
    id: Number(row.id),
    escolaId: Number(row.school_id),
    escolaSlug: row.school_slug,
    escolaNome: row.school_name,
    identificador: row.login_identifier,
    email: row.institutional_email,
    responsavel: row.responsible_name,
    cargo: row.responsible_role,
    telefone: row.institutional_contact || "",
    ativo: row.account_status === "active",
    status: row.account_status,
    verificationStatus: row.verification_status,
    mustChangePassword: row.must_change_password === true,
    // A senha NUNCA sai do servidor: nem em hash. O Chefe pode DEFINIR uma
    // nova (rota de reset), mas não consegue lê-la.
    senhaDefinida: Boolean(row.password),
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
    lastLogin: row.last_login_at || undefined,
  });

  const listarContasEscolaresServidor = async (escolaId?: number) => {
    const sb = getSaasAdminClient();
    if (!sb) return { contas: null as any[] | null, error: "Servidor sem SUPABASE_SECRET_KEY." };
    let consulta = sb
      .from("school_accounts")
      .select("*")
      .order("school_id", { ascending: true })
      .order("id", { ascending: true });
    if (escolaId) consulta = consulta.eq("school_id", escolaId);
    const { data, error } = await consulta;
    if (error) return { contas: null, error: error.message };
    return { contas: (data || []).map(mapSchoolAccountRow), error: null };
  };

  app.get("/api/admin/school-accounts", requireAuth, requireChefeAdmin, async (req: AuthRequest, res) => {
    const escolaId = Number(req.query.escolaId) || undefined;
    const { contas, error } = await listarContasEscolaresServidor(escolaId);
    if (error) {
      return res.status(503).json({
        error: "A lista de contas escolares exige o servidor com SUPABASE_SECRET_KEY configurado.",
        code: "SAAS_NOT_CONFIGURED",
        detail: error,
      });
    }
    res.json({ accounts: contas, adminRole: "chefe" });
  });

  app.post("/api/admin/school-accounts", requireAuth, requireChefeAdmin, async (req: AuthRequest, res) => {
    const sb = getSaasAdminClient();
    if (!sb) return res.status(503).json({ error: "Servidor sem SUPABASE_SECRET_KEY.", code: "SAAS_NOT_CONFIGURED" });

    const {
      escolaSlug,
      identificador,
      email,
      password,
      responsavel,
      cargo,
      telefone,
    } = req.body || {};

    const escola = ARAUCARIA_SCHOOLS.find((e) => e.slug === String(escolaSlug || "").trim());
    if (!escola) return res.status(400).json({ error: "Escola não encontrada no cadastro de Araucária." });

    const identificadorNorm = String(identificador || "").trim().toLowerCase();
    const emailNorm = String(email || "").trim().toLowerCase();
    if (!identificadorNorm || !emailNorm || !String(responsavel || "").trim() || !String(cargo || "").trim()) {
      return res.status(400).json({ error: "Preencha identificador, e-mail, responsável e cargo." });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailNorm)) {
      return res.status(400).json({ error: "E-mail institucional inválido." });
    }

    const forcaSenha = validatePasswordStrength(String(password || ""));
    if (forcaSenha) {
      return res.status(400).json({ error: forcaSenha, fieldErrors: { password: forcaSenha } });
    }

    try {
      const { data: existentes } = await sb
        .from("school_accounts")
        .select("id, login_identifier, institutional_email")
        .or(`login_identifier.eq.${identificadorNorm},institutional_email.eq.${emailNorm}`)
        .limit(5);

      if (existentes && existentes.length > 0) {
        const mesmoEmail =
          String(existentes[0].institutional_email || "").toLowerCase() === emailNorm;
        return res.status(409).json({
          error: mesmoEmail
            ? "Já existe uma conta escolar com este e-mail."
            : "Já existe uma conta escolar com este identificador.",
          fieldErrors: mesmoEmail
            ? { email: "Já existe uma conta escolar com este e-mail." }
            : { identificador: "Já existe uma conta escolar com este identificador." },
        });
      }

      const { data, error } = await sb
        .from("school_accounts")
        .insert([
          {
            school_id: escola.id,
            school_slug: escola.slug,
            school_name: escola.name,
            login_identifier: identificadorNorm,
            institutional_email: emailNorm,
            password: hashPassword(String(password)),
            responsible_name: String(responsavel).trim(),
            responsible_role: String(cargo).trim(),
            institutional_contact: String(telefone || "").trim() || emailNorm,
            account_status: "active",
            verification_status: "pending_verification",
            created_by: "ADM Chefe",
          },
        ])
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Identificador ou e-mail já cadastrado para outra conta escolar." });
        }
        return res.status(500).json({ error: "Não foi possível criar a conta escolar." });
      }

      await logPlatformAudit({
        actorEmail: (req.user as any)?.email || null,
        action: "school_account.created",
        targetType: "school_account",
        targetId: String(data.id),
        metadata: { escola: escola.slug },
      }).catch(() => {});

      res.status(201).json({ success: true, conta: mapSchoolAccountRow(data) });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao criar a conta escolar." });
    }
  });

  app.put("/api/admin/school-accounts/:id/status", requireAuth, requireChefeAdmin, async (req: AuthRequest, res) => {
    const sb = getSaasAdminClient();
    if (!sb) return res.status(503).json({ error: "Servidor sem SUPABASE_SECRET_KEY.", code: "SAAS_NOT_CONFIGURED" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Identificador inválido." });
    const ativo = req.body?.ativo !== false;

    const { data, error } = await sb
      .from("school_accounts")
      .update({ account_status: ativo ? "active" : "suspended", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");

    if (error) return res.status(500).json({ error: "Não foi possível alterar o status da conta." });
    if (!data || data.length === 0) return res.status(404).json({ error: "Conta escolar não encontrada." });

    await logPlatformAudit({
      actorEmail: (req.user as any)?.email || null,
      action: ativo ? "school_account.unblocked" : "school_account.blocked",
      targetType: "school_account",
      targetId: String(id),
    }).catch(() => {});

    res.json({ success: true });
  });

  app.put("/api/admin/school-accounts/:id/verify", requireAuth, requireChefeAdmin, async (req: AuthRequest, res) => {
    const sb = getSaasAdminClient();
    if (!sb) return res.status(503).json({ error: "Servidor sem SUPABASE_SECRET_KEY.", code: "SAAS_NOT_CONFIGURED" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Identificador inválido." });

    const status = String(req.body?.verificationStatus || "verified");
    if (!["pending_verification", "verified", "revoked"].includes(status)) {
      return res.status(400).json({ error: "Situação de verificação inválida." });
    }

    const { data, error } = await sb
      .from("school_accounts")
      .update({
        verification_status: status,
        verified_by: String((req.user as any)?.email || "ADM Chefe"),
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id");

    if (error) return res.status(500).json({ error: "Não foi possível registrar a verificação." });
    if (!data || data.length === 0) return res.status(404).json({ error: "Conta escolar não encontrada." });

    await logPlatformAudit({
      actorEmail: (req.user as any)?.email || null,
      action: "school_account.verified",
      targetType: "school_account",
      targetId: String(id),
      metadata: { verificationStatus: status },
    }).catch(() => {});

    res.json({ success: true });
  });

  app.put("/api/admin/school-accounts/:id/reset-password", requireAuth, requireChefeAdmin, async (req: AuthRequest, res) => {
    const sb = getSaasAdminClient();
    if (!sb) return res.status(503).json({ error: "Servidor sem SUPABASE_SECRET_KEY.", code: "SAAS_NOT_CONFIGURED" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Identificador inválido." });

    const novaSenha = String(req.body?.password || "");
    const forcaSenha = validatePasswordStrength(novaSenha);
    if (forcaSenha) {
      return res.status(400).json({ error: forcaSenha, fieldErrors: { password: forcaSenha } });
    }

    const { data, error } = await sb
      .from("school_accounts")
      .update({
        password: hashPassword(novaSenha),
        must_change_password: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id");

    if (error) return res.status(500).json({ error: "Não foi possível redefinir a senha." });
    if (!data || data.length === 0) return res.status(404).json({ error: "Conta escolar não encontrada." });

    await logPlatformAudit({
      actorEmail: (req.user as any)?.email || null,
      action: "school_account.password_reset",
      targetType: "school_account",
      targetId: String(id),
    }).catch(() => {});

    res.json({ success: true, mustChangePassword: true });
  });

  app.delete("/api/admin/school-accounts/:id", requireAuth, requireChefeAdmin, async (req: AuthRequest, res) => {
    const sb = getSaasAdminClient();
    if (!sb) return res.status(503).json({ error: "Servidor sem SUPABASE_SECRET_KEY.", code: "SAAS_NOT_CONFIGURED" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Identificador inválido." });

    const { error } = await sb.from("school_accounts").delete().eq("id", id);
    if (error) return res.status(500).json({ error: "Não foi possível remover a conta escolar." });

    await logPlatformAudit({
      actorEmail: (req.user as any)?.email || null,
      action: "school_account.deleted",
      targetType: "school_account",
      targetId: String(id),
    }).catch(() => {});

    res.json({ success: true });
  });

  // --- AGENDA PESSOAL (rotas do próprio usuário) ---
  //
  // A tabela `personal_events` deixou de aceitar escrita de `anon` (migração
  // 20261113): antes qualquer visitante lia a agenda de todos. Estas rotas
  // mantêm a funcionalidade para o dono, com o vínculo vindo do token.
  const mapPersonalEventRow = (row: any) => ({
    id: Number(row.id),
    ownerId: Number(row.owner_id),
    ownerName: row.owner_name ?? "Usuário",
    ownerEmail: row.owner_email ?? null,
    title: row.title ?? "",
    description: row.description ?? null,
    location: row.location ?? null,
    city: row.city ?? null,
    day: Number(row.day),
    month: Number(row.month),
    year: Number(row.year),
    time: row.time ?? null,
    category: row.category ?? null,
    isPaid: Boolean(row.is_paid),
    price: row.price ?? null,
    reminder: Boolean(row.reminder),
    notes: row.notes ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
  });

  app.get("/api/personal-events", requireAuth, async (req: AuthRequest, res) => {
    const sb = getSaasAdminClient();
    if (!sb) return res.status(503).json({ error: "Servidor sem SUPABASE_SECRET_KEY.", code: "SAAS_NOT_CONFIGURED" });

    try {
      const dbUser = req.dbUser || (await resolveDbUserForRequest(req));
      const donoId = Number(dbUser?.id ?? (req.user as any)?.id ?? 0);
      if (!Number.isFinite(donoId) || donoId <= 0) {
        return res.status(400).json({ error: "Não foi possível identificar o dono da agenda." });
      }

      const { data, error } = await sb
        .from("personal_events")
        .select(
          "id, owner_id, owner_name, owner_email, title, description, location, city, day, month, year, time, category, is_paid, price, reminder, notes, created_at"
        )
        .eq("owner_id", donoId)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .order("day", { ascending: false });

      if (error) {
        if (isRedeIndisponivel(error)) return responderIndisponivel(res, "O banco não respondeu ao carregar sua agenda.");
        return res.status(500).json({ error: "Não foi possível carregar sua agenda." });
      }

      res.json({ events: (data || []).map(mapPersonalEventRow) });
    } catch (error: any) {
      if (isRedeIndisponivel(error)) return responderIndisponivel(res, "O banco não respondeu ao carregar sua agenda.");
      res.status(500).json({ error: "Erro ao carregar sua agenda." });
    }
  });

  app.post("/api/personal-events", requireAuth, async (req: AuthRequest, res) => {
    const sb = getSaasAdminClient();
    if (!sb) return res.status(503).json({ error: "Servidor sem SUPABASE_SECRET_KEY.", code: "SAAS_NOT_CONFIGURED" });

    try {
      const dbUser = req.dbUser || (await resolveDbUserForRequest(req));
      const donoId = Number(dbUser?.id ?? (req.user as any)?.id ?? 0);
      if (!Number.isFinite(donoId) || donoId <= 0) {
        return res.status(400).json({ error: "Não foi possível identificar o dono da agenda." });
      }

      const corpo = req.body || {};
      const titulo = String(corpo.title || "").trim();
      const dia = Number(corpo.day);
      const mes = Number(corpo.month);
      const ano = Number(corpo.year);

      if (!titulo) return res.status(400).json({ error: "Dê um nome ao compromisso." });
      if (!Number.isInteger(dia) || dia < 1 || dia > 31) return res.status(400).json({ error: "Dia inválido: use de 1 a 31." });
      if (!Number.isInteger(mes) || mes < 0 || mes > 11) return res.status(400).json({ error: "Mês inválido." });
      if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return res.status(400).json({ error: "Ano inválido." });

      const hoje = new Date();
      const dataDoEvento = new Date(ano, mes, dia);
      const hojeZerado = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      if (dataDoEvento < hojeZerado) {
        return res.status(400).json({ error: "Escolha uma data de hoje em diante." });
      }

      const { data, error } = await sb
        .from("personal_events")
        .insert([
          {
            // O dono vem do token, nunca do corpo da requisição.
            owner_id: donoId,
            owner_name: String(dbUser?.nome || correio(req) || "Usuário"),
            owner_email: String(dbUser?.email || (req.user as any)?.email || "") || null,
            title: titulo,
            description: String(corpo.description || "").trim() || null,
            location: String(corpo.location || "").trim() || null,
            city: String(corpo.city || "").trim() || null,
            day: dia,
            month: mes,
            year: ano,
            time: String(corpo.time || "").trim() || null,
            category: String(corpo.category || "Pessoal"),
            is_paid: Boolean(corpo.isPaid),
            price: corpo.isPaid ? String(corpo.price || "").trim() || null : null,
            reminder: Boolean(corpo.reminder),
            notes: String(corpo.notes || "").trim() || null,
          },
        ])
        .select()
        .single();

      if (error) {
        if (isRedeIndisponivel(error)) return responderIndisponivel(res, "O banco não respondeu ao salvar o compromisso.");
        return res.status(500).json({ error: "Não foi possível salvar o compromisso." });
      }

      res.status(201).json({ event: mapPersonalEventRow(data) });
    } catch (error: any) {
      if (isRedeIndisponivel(error)) return responderIndisponivel(res, "O banco não respondeu ao salvar o compromisso.");
      res.status(500).json({ error: "Erro ao salvar o compromisso." });
    }
  });

  app.delete("/api/personal-events/:id", requireAuth, async (req: AuthRequest, res) => {
    const sb = getSaasAdminClient();
    if (!sb) return res.status(503).json({ error: "Servidor sem SUPABASE_SECRET_KEY.", code: "SAAS_NOT_CONFIGURED" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Identificador inválido." });

    try {
      const dbUser = req.dbUser || (await resolveDbUserForRequest(req));
      const donoId = Number(dbUser?.id ?? (req.user as any)?.id ?? 0);

      const { data: linhas } = await sb.from("personal_events").select("id, owner_id").eq("id", id).limit(1);
      if (!linhas || linhas.length === 0) return res.status(404).json({ error: "Compromisso não encontrado." });
      if (Number(linhas[0].owner_id) !== donoId) {
        return res.status(403).json({ error: "Este compromisso pertence a outro usuário." });
      }

      const { error } = await sb.from("personal_events").delete().eq("id", id);
      if (error) return res.status(500).json({ error: "Não foi possível remover o compromisso." });

      res.json({ success: true });
    } catch (error: any) {
      if (isRedeIndisponivel(error)) return responderIndisponivel(res, "O banco não respondeu ao remover o compromisso.");
      res.status(500).json({ error: "Erro ao remover o compromisso." });
    }
  });

  // --- SUGESTÕES DE EVENTOS (IA / motor local) ---
  //
  // Antes o painel listava, aprovava e rejeitava direto no Supabase. As
  // políticas de `event_suggestions` são públicas para leitura, escrita e
  // atualização — ou seja, qualquer visitante podia aprovar uma sugestão e
  // publicá-la como evento oficial da rede. Agora a decisão é do servidor.
  const mapSuggestionRow = (row: any) => ({
    id: Number(row.id),
    title: row.title,
    location: row.location ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    category: row.category ?? null,
    description: row.description ?? null,
    requirements: row.requirements ?? null,
    website: row.website ?? null,
    image: row.image ?? null,
    day: row.day ?? null,
    month: row.month ?? null,
    year: row.year ?? null,
    time: row.time ?? null,
    isPaid: Boolean(row.is_paid),
    price: row.price ?? null,
    schoolName: row.school_name ?? null,
    sourceName: row.source_name ?? null,
    sourceUrl: row.source_url ?? null,
    aiConfidence:
      row.ai_confidence !== null && row.ai_confidence !== undefined ? Number(row.ai_confidence) : null,
    aiReasoning: row.ai_reasoning ?? null,
    origin: row.origin === "local_engine" ? "local_engine" : "ai",
    isEstimated: Boolean(row.is_estimated),
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at ?? null,
    reviewedBy: row.reviewed_by ?? null,
    approvedEventId: row.approved_event_id ?? null,
    rejectionReason: row.rejection_reason ?? null,
  });

  app.get("/api/admin/suggestions", requireAuth, requireAdminOrStaff, async (req: AuthRequest, res) => {
    const sb = getSaasAdminClient();
    if (!sb) {
      return res.status(503).json({ error: "As sugestões exigem o servidor com SUPABASE_SECRET_KEY.", code: "SAAS_NOT_CONFIGURED" });
    }
    try {
      const status = String(req.query.status || "pending");
      let consulta = sb.from("event_suggestions").select("*");
      if (status !== "all") consulta = consulta.eq("status", status);

      const { data, error } = await consulta.order("created_at", { ascending: false }).limit(200);
      if (error) {
        console.warn("[Admin] Falha ao listar sugestões:", error.message);
        if (isRedeIndisponivel(error)) return responderIndisponivel(res, "Não foi possível consultar as sugestões.");
        return res.status(500).json({ error: "Não foi possível consultar as sugestões." });
      }
      res.json({ suggestions: (data || []).map(mapSuggestionRow) });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao consultar as sugestões." });
    }
  });

  // Aprovar: cria o evento de verdade e marca a sugestão. Exclusivo do Chefe
  // (Funcionário vê, mas não publica).
  app.post(
    "/api/admin/suggestions/:id/approve",
    requireAuth,
    requireChefeAdmin,
    async (req: AuthRequest, res) => {
      const sb = getSaasAdminClient();
      if (!sb) return res.status(503).json({ error: "Servidor sem SUPABASE_SECRET_KEY.", code: "SAAS_NOT_CONFIGURED" });

      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Identificador inválido." });

      try {
        const { data: linhas, error: erroBusca } = await sb
          .from("event_suggestions")
          .select("*")
          .eq("id", id)
          .limit(1);

        if (erroBusca) return res.status(500).json({ error: "Não foi possível ler a sugestão." });
        if (!linhas || linhas.length === 0) return res.status(404).json({ error: "Sugestão não encontrada." });

        const sugestao: any = linhas[0];
        if (sugestao.status !== "pending") {
          return res.status(409).json({ error: "Esta sugestão já foi revisada." });
        }

        const dbUser = req.dbUser || (await resolveDbUserForRequest(req));
        const reviewedBy = String((req.user as any)?.email || dbUser?.email || "Administrador");

        const novoEvento = {
          title: sugestao.title,
          location: sugestao.location || sugestao.address || sugestao.city || "Local a confirmar",
          day: sugestao.day,
          month: sugestao.month,
          year: sugestao.year,
          time: sugestao.time || "08:00",
          isPaid: Boolean(sugestao.is_paid),
          price: sugestao.price ?? null,
          requirements: sugestao.requirements ?? null,
          website: sugestao.website ?? null,
          image: sugestao.image ?? null,
          description: sugestao.description ?? null,
          category: sugestao.category ?? null,
          city: sugestao.city ?? null,
          schoolName: sugestao.school_name ?? null,
        };

        let eventId: number | null = null;
        let tabelaUsada = "events";

        const { data: criado, error: erroCriar } = await sb
          .from("events")
          .insert(novoEvento)
          .select("id")
          .limit(1)
          .maybeSingle();

        if (erroCriar) {
          // A base do projeto tem as duas tabelas espelhadas (`events` e
          // `eventos`). Se a primeira recusar, tentamos a segunda antes de
          // desistir — mas nunca "fingimos" sucesso.
          const { data: criado2, error: erro2 } = await sb
            .from("eventos")
            .insert(novoEvento)
            .select("id")
            .limit(1)
            .maybeSingle();
          if (erro2) {
            console.warn("[Admin] Falha ao publicar sugestão:", erroCriar.message, erro2.message);
            return res.status(500).json({ error: "Não foi possível publicar o evento a partir da sugestão." });
          }
          eventId = criado2?.id ?? null;
          tabelaUsada = "eventos";
        } else {
          eventId = criado?.id ?? null;
        }

        const { error: erroMarcar } = await sb
          .from("event_suggestions")
          .update({
            status: "approved",
            reviewed_at: new Date().toISOString(),
            reviewed_by: reviewedBy,
            approved_event_id: eventId,
            approved_table: tabelaUsada,
          })
          .eq("id", id);

        if (erroMarcar) {
          console.warn("[Admin] Evento criado, mas a sugestão não foi marcada como aprovada:", erroMarcar.message);
        }

        await logPlatformAudit({
          actorEmail: reviewedBy,
          action: "suggestion.approved",
          targetType: "event_suggestion",
          targetId: String(id),
          metadata: { eventId, tabelaUsada },
        }).catch(() => {});

        res.json({ success: true, eventId });
      } catch (error: any) {
        res.status(500).json({ error: "Erro ao aprovar a sugestão." });
      }
    }
  );

  app.post(
    "/api/admin/suggestions/:id/reject",
    requireAuth,
    requireChefeAdmin,
    async (req: AuthRequest, res) => {
      const sb = getSaasAdminClient();
      if (!sb) return res.status(503).json({ error: "Servidor sem SUPABASE_SECRET_KEY.", code: "SAAS_NOT_CONFIGURED" });

      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Identificador inválido." });

      try {
        const dbUser = req.dbUser || (await resolveDbUserForRequest(req));
        const reviewedBy = String((req.user as any)?.email || dbUser?.email || "Administrador");
        const motivo = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

        const { error } = await sb
          .from("event_suggestions")
          .update({
            status: "rejected",
            reviewed_at: new Date().toISOString(),
            reviewed_by: reviewedBy,
            rejection_reason: motivo || null,
          })
          .eq("id", id);

        if (error) return res.status(500).json({ error: "Não foi possível rejeitar a sugestão." });

        await logPlatformAudit({
          actorEmail: reviewedBy,
          action: "suggestion.rejected",
          targetType: "event_suggestion",
          targetId: String(id),
          metadata: { motivo: motivo || null },
        }).catch(() => {});

        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: "Erro ao rejeitar a sugestão." });
      }
    }
  );

  // --- AGENDA PESSOAL (visão da administração) ---
  //
  // `personal_events` tem leitura pública no Supabase (qualquer visitante lê a
  // agenda de todos os usuários). O painel precisa enxergar o uso, mas essa
  // leitura passa a ser feita aqui, com o papel verificado no servidor.
  app.get("/api/admin/personal-events", requireAuth, requireAdminOrStaff, async (req: AuthRequest, res) => {
    const sb = getSaasAdminClient();
    if (!sb) {
      return res.status(503).json({
        error: "A agenda pessoal de todos os usuários exige o servidor com SUPABASE_SECRET_KEY.",
        code: "SAAS_NOT_CONFIGURED",
      });
    }
    try {
      const { data, error } = await sb
        .from("personal_events")
        .select(
          "id, owner_id, owner_name, owner_email, title, description, location, city, day, month, year, time, category, is_paid, price, reminder, notes, created_at"
        )
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .order("day", { ascending: false })
        .limit(1000);

      if (error) {
        console.warn("[Admin] Falha ao listar agenda pessoal:", error.message);
        if (isRedeIndisponivel(error)) {
          return responderIndisponivel(res, "O banco de dados não respondeu ao consultar a agenda pessoal.");
        }
        return res.status(500).json({ error: "Não foi possível consultar a agenda pessoal." });
      }
      res.json({ events: data || [] });
    } catch (error: any) {
      if (isRedeIndisponivel(error)) {
        return responderIndisponivel(res, "O banco de dados não respondeu ao consultar a agenda pessoal.");
      }
      res.status(500).json({ error: "Erro ao consultar a agenda pessoal." });
    }
  });

  // Remoção pelo painel. Funcionário Administrador só remove o que ele mesmo criou.
  app.delete("/api/admin/personal-events/:id", requireAuth, requireAdminOrStaff, async (req: AuthRequest, res) => {
    const sb = getSaasAdminClient();
    if (!sb) return res.status(503).json({ error: "Servidor sem SUPABASE_SECRET_KEY.", code: "SAAS_NOT_CONFIGURED" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Identificador inválido." });

    try {
      const { data: linhas } = await sb.from("personal_events").select("id, owner_id").eq("id", id).limit(1);
      if (!linhas || linhas.length === 0) return res.status(404).json({ error: "Compromisso não encontrado." });

      const adminRole = (req as any).adminRole;
      if (adminRole !== "chefe") {
        const dbUser = req.dbUser || (await resolveDbUserForRequest(req));
        const dono = ownIdentityCandidates(req, dbUser).includes(String(linhas[0].owner_id));
        if (!dono) {
          return res.status(403).json({ error: "Como Funcionário Administrador, você só remove compromissos da sua própria agenda." });
        }
      }

      const { error } = await sb.from("personal_events").delete().eq("id", id);
      if (error) return res.status(500).json({ error: "Não foi possível remover o compromisso." });

      await logPlatformAudit({
        actorEmail: (req.user as any)?.email || null,
        action: "personal_event.deleted",
        targetType: "personal_event",
        targetId: String(id),
      }).catch(() => {});

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao remover o compromisso." });
    }
  });

  // --- HISTÓRICO DE EVENTOS EXCLUÍDOS (exclusivo administração) ---
  //
  // Antes o painel lia/restaurava/expurgava direto no Supabase com a chave
  // publicável. As políticas de `deleted_events` são `qual: true` até hoje, o
  // que significa que QUALQUER visitante podia listar e apagar o histórico de
  // eventos da rede inteira. As rotas abaixo colocam a decisão no servidor,
  // onde o papel é verificado de verdade.
  const deletedEventsStore = () => getSaasAdminClient();

  /** Serializa a linha de `deleted_events` para o formato do cliente. */
  const mapDeletedEventRow = (row: any) => ({
    id: Number(row.id),
    sourceTable: row.source_table,
    sourceId: Number(row.source_id),
    title: row.title ?? "Evento sem título",
    payload: row.payload ?? {},
    eventEndsAt: row.ends_at ?? row.event_ends_at ?? null,
    deletedAt: row.deleted_at,
    deletionReason: row.deletion_reason ?? "manual",
    deletedBy: row.deleted_by ?? null,
    restoredAt: row.restored_at ?? null,
    restoredEventId: row.restored_event_id ?? null,
  });

  app.get("/api/events/deleted", requireAuth, requireAdminOrStaff, async (req: AuthRequest, res) => {
    const sb = deletedEventsStore();
    if (!sb) {
      return res.status(503).json({
        error: "O histórico de eventos excluídos exige o servidor com SUPABASE_SECRET_KEY configurado.",
        code: "SAAS_NOT_CONFIGURED",
      });
    }
    try {
      const incluirRestaurados = String(req.query.includeRestored || "") === "1";
      const limite = Math.min(Number(req.query.limit) || 200, 500);

      let consulta = sb
        .from("deleted_events")
        .select("*")
        .order("deleted_at", { ascending: false })
        .limit(limite);

      if (!incluirRestaurados) consulta = consulta.is("restored_at", null);

      const { data, error } = await consulta;
      if (error) {
        console.warn("[Admin] Falha ao listar eventos excluídos:", error.message);
        if (isRedeIndisponivel(error)) return responderIndisponivel(res, "Não foi possível consultar o histórico de eventos excluídos.");
        return res.status(500).json({ error: "Não foi possível consultar o histórico de eventos excluídos." });
      }

      res.json({ events: (data || []).map(mapDeletedEventRow), retentionDays: EVENT_RETENTION_DAYS });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao consultar o histórico de eventos excluídos." });
    }
  });

  // Restaura: recria o evento na tabela de origem a partir do snapshot.
  app.post("/api/events/deleted/:id/restore", requireAuth, requireChefeAdmin, async (req: AuthRequest, res) => {
    const sb = deletedEventsStore();
    if (!sb) {
      return res.status(503).json({ error: "Servidor sem SUPABASE_SECRET_KEY não pode restaurar eventos.", code: "SAAS_NOT_CONFIGURED" });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Identificador inválido." });

    try {
      const { data: linhas, error: erroBusca } = await sb
        .from("deleted_events")
        .select("*")
        .eq("id", id)
        .limit(1);

      if (erroBusca) return res.status(500).json({ error: "Não foi possível ler o evento excluído." });
      if (!linhas || linhas.length === 0) return res.status(404).json({ error: "Evento excluído não encontrado." });

      const registro: any = linhas[0];
      if (registro.restored_at) return res.status(409).json({ error: "Este evento já foi restaurado anteriormente." });

      const payload: Record<string, any> = { ...(registro.payload || {}) };
      delete payload.id;
      delete payload.archived_at;
      delete payload.ends_at;
      if ("is_archived" in payload) payload.is_archived = false;
      if ("status" in payload) payload.status = "ativo";

      const tabelaOrigem = registro.source_table === "eventos" ? "eventos" : "events";
      const { data: inserido, error: erroInsert } = await sb
        .from(tabelaOrigem)
        .insert(payload)
        .select("id")
        .limit(1);

      if (erroInsert) {
        console.warn("[Admin] Falha ao recriar evento restaurado:", erroInsert.message);
        return res.status(500).json({ error: "Não foi possível recriar o evento na agenda." });
      }

      const restoredEventId = inserido?.[0]?.id ?? null;
      const { error: erroMarcar } = await sb
        .from("deleted_events")
        .update({ restored_at: new Date().toISOString(), restored_event_id: restoredEventId })
        .eq("id", id);

      if (erroMarcar) console.warn("[Admin] Evento recriado, mas restored_at não foi gravado:", erroMarcar.message);

      await logPlatformAudit({
        actorEmail: (req.user as any)?.email || null,
        action: "event.restored",
        targetType: "deleted_event",
        targetId: String(id),
        metadata: { restoredEventId, sourceTable: tabelaOrigem },
      }).catch(() => {});

      res.json({ success: true, restoredEventId });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao restaurar o evento." });
    }
  });

  // Expurgo definitivo — irreversível, só o Chefe.
  app.delete("/api/events/deleted/:id", requireAuth, requireChefeAdmin, async (req: AuthRequest, res) => {
    const sb = deletedEventsStore();
    if (!sb) return res.status(503).json({ error: "Servidor sem SUPABASE_SECRET_KEY.", code: "SAAS_NOT_CONFIGURED" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Identificador inválido." });

    try {
      const { error } = await sb.from("deleted_events").delete().eq("id", id);
      if (error) return res.status(500).json({ error: "Não foi possível excluir definitivamente." });

      await logPlatformAudit({
        actorEmail: (req.user as any)?.email || null,
        action: "event.purged",
        targetType: "deleted_event",
        targetId: String(id),
      }).catch(() => {});

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao excluir definitivamente o evento." });
    }
  });

  // --- PORTAL DAS ESCOLAS (AMBIENTE ISOLADO MULTI-TENANT) ---
  // Obter dados da escola autenticada (perfil institucional, notícias próprias e eventos próprios)
  app.get("/api/school-portal/:schoolId/data", requireAuth, async (req: AuthRequest, res) => {
    try {
      const schoolId = parseInt(req.params.schoolId, 10);
      const user = req.user;
      
      let dbUser = await getUserByUid(user?.uid || "");
      if (!dbUser && user?.email) {
        dbUser = await getUserByEmail(user.email);
      }
      const isChefe = checkIsChefe(dbUser, user);
      
      if (!isChefe && user?.role === "Escola" && user?.escolaId !== schoolId) {
        return res.status(403).json({ error: "Acesso negado: Isolamento estrito da instituição violado." });
      }

      const school = getSchoolById(schoolId);
      if (!school) {
        return res.status(404).json({ error: "Instituição de ensino não encontrada." });
      }

      const allEvents = listAllEventsFallback();
      const schoolEvents = allEvents.filter(e => 
        (e.schoolId && e.schoolId === schoolId) || 
        (e.schoolName && e.schoolName.toLowerCase().includes(school.name.toLowerCase())) ||
        (e.location && e.location.toLowerCase().includes(school.name.toLowerCase()))
      );

      res.json({
        school,
        events: schoolEvents,
        news: school.news || []
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao carregar ambiente da escola." });
    }
  });

  // Atualizar informações de apresentação e perfil da própria escola
  app.put("/api/school-portal/:schoolId/profile", requireAuth, async (req: AuthRequest, res) => {
    try {
      const schoolId = parseInt(req.params.schoolId, 10);
      const user = req.user;
      
      let dbUser = await getUserByUid(user?.uid || "");
      if (!dbUser && user?.email) {
        dbUser = await getUserByEmail(user.email);
      }
      const isChefe = checkIsChefe(dbUser, user);

      if (!isChefe && user?.role === "Escola" && user?.escolaId !== schoolId) {
        return res.status(403).json({ error: "Acesso negado: Isolamento estrito da instituição violado." });
      }

      const school = getSchoolById(schoolId);
      if (!school) {
        return res.status(404).json({ error: "Instituição de ensino não encontrada." });
      }

      const { presentation, phone, email, address } = req.body;
      if (presentation !== undefined) school.historicalOverview = presentation;
      if (phone !== undefined) school.phone = phone;
      if (email !== undefined) school.email = email;
      if (address !== undefined) school.address = address;

      logSchoolActionFallback({
        schoolId,
        action: "UPDATE_PROFILE",
        resource: school.name,
        details: "Atualização dos dados institucionais e apresentação",
        performedBy: user?.name || "Representante Institucional"
      });

      res.json({ success: true, school });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao atualizar dados da instituição." });
    }
  });

  // Publicar notícia institucional exclusiva da escola
  app.post("/api/school-portal/:schoolId/news", requireAuth, async (req: AuthRequest, res) => {
    try {
      const schoolId = parseInt(req.params.schoolId, 10);
      const user = req.user;

      let dbUser = await getUserByUid(user?.uid || "");
      if (!dbUser && user?.email) {
        dbUser = await getUserByEmail(user.email);
      }
      const isChefe = checkIsChefe(dbUser, user);

      if (!isChefe && user?.role === "Escola" && user?.escolaId !== schoolId) {
        return res.status(403).json({ error: "Acesso negado: Isolamento estrito da instituição violado." });
      }

      const school = getSchoolById(schoolId);
      if (!school) {
        return res.status(404).json({ error: "Instituição de ensino não encontrada." });
      }

      const { title, summary, date, author, category } = req.body;
      if (!title || !title.trim()) {
        return res.status(400).json({ error: "Título da notícia é obrigatório." });
      }

      const createdNews = addSchoolNews(school.slug, {
        title: title.trim(),
        description: summary ? summary.trim() : "",
        date: date || new Date().toLocaleDateString("pt-BR"),
        author: author || school.name,
        category: (category as any) || "Comunicado",
        source: "Portal Institucional"
      });

      logSchoolActionFallback({
        schoolId,
        action: "PUBLISH_NEWS",
        resource: school.name,
        details: `Publicação de notícia institucional: "${title.trim()}"`,
        performedBy: user?.name || "Representante Institucional"
      });

      res.status(201).json({ success: true, news: createdNews });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao publicar notícia institucional." });
    }
  });

  // Inicializar verificação de expiração no arranque do servidor e a cada 30 minutos
  try {
    const initialPruned = archiveAndPruneExpiredEvents();
    if (initialPruned && initialPruned.prunedCount > 0) {
      console.log(`[eloEscola Auto-Prune] ${initialPruned.prunedCount} eventos ultrapassando ${EVENT_RETENTION_DAYS} dias foram arquivados com sucesso.`);
    }
    setInterval(() => {
      try {
        const count = archiveAndPruneExpiredEvents();
        if (count && count.prunedCount > 0) {
          console.log(`[eloEscola Auto-Prune Periódico] ${count.prunedCount} eventos ultrapassando ${EVENT_RETENTION_DAYS} dias transferidos para o histórico.`);
        }
      } catch (err) {
        console.warn("[eloEscola Auto-Prune] Erro na rotina periódica de arquivamento:", err);
      }
    }, 30 * 60 * 1000);
  } catch (initErr) {
    console.warn("Aviso ao inicializar rotina de expiração:", initErr);
  }

  // --- DIGITAL PARENTAL ATTENDANCE AUTHORIZATIONS API ---
  const SIGNATURES_DIR = path.join(process.cwd(), "public", "uploads", "signatures");
  if (!fs.existsSync(SIGNATURES_DIR)) {
    fs.mkdirSync(SIGNATURES_DIR, { recursive: true });
  }

  // 1. Submit parental authorization with digital handwritten signature
  //
  // Parte 2 da auditoria: esta rota era PÚBLICA. Qualquer pessoa podia gravar
  // uma autorização em nome de um estudante — inclusive de outra escola — com
  // nome de responsável inventado e assinatura desenhada no navegador. Agora:
  //  * exige sessão válida (`requireAuth`);
  //  * o próprio estudante só assina para si;
  //  * a equipe administrativa (Chefe/Funcionário) pode registrar em nome de
  //    um aluno da própria instituição.
  app.post("/api/events/:eventId/authorizations", requireAuth, async (req: AuthRequest, res) => {
    try {
      const eventId = parseInt(req.params.eventId, 10);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "ID do evento inválido." });
      }

      const {
        studentUserId,
        studentName,
        studentSchool,
        studentClass,
        guardianFullName,
        guardianRelationship,
        guardianContact,
        authorizationText,
        consentVersion,
        declarationAccepted,
        signatureDataUrl,
        eventSnapshot
      } = req.body;

      if (!guardianFullName || !guardianFullName.trim()) {
        return res.status(400).json({ error: "Nome completo do responsável legal é obrigatório." });
      }

      if (!guardianRelationship || !guardianRelationship.trim()) {
        return res.status(400).json({ error: "Grau de parentesco ou vínculo com o estudante é obrigatório." });
      }

      if (!declarationAccepted) {
        return res.status(400).json({ error: "É necessário aceitar a declaração e os termos de consentimento." });
      }

      if (!signatureDataUrl || !signatureDataUrl.startsWith("data:image/")) {
        return res.status(400).json({ error: "A assinatura digital manuscrita é obrigatória." });
      }

      // Quem está assinando? A autorização é sempre vinculada a um estudante;
      // só o próprio estudante (ou a equipe da escola) pode criá-la.
      const dbUser = await resolveDbUserForRequest(req);
      if (dbUser && dbUser.ativo === false) {
        return res.status(403).json({
          error: "Sua conta está bloqueada pela administração escolar.",
          blocked: true,
        });
      }

      const identidades = ownIdentityCandidates(req, dbUser);
      const alvo = String(studentUserId || "").trim();
      const assinandoParaSi = identidades.length > 0 && identidades.includes(alvo);
      const isEquipeAdmin =
        checkIsChefe(dbUser, req.user) || checkIsFuncionario(dbUser, req.user);
      const isAlunoAssinandoParaSi =
        assinandoParaSi && Boolean(dbUser) && /aluno|estudante/i.test(String(dbUser?.role || ""));

      if (!isEquipeAdmin && !isAlunoAssinandoParaSi) {
        return res.status(403).json({
          error:
            "Somente o próprio estudante ou a equipe administrativa da escola pode registrar uma autorização.",
        });
      }

      const authId = `auth-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;

      // Parte 2 da auditoria: assinatura vai para bucket PRIVADO com URL
      // assinada de curta duração. O disco local é apenas fallback quando o
      // Storage não está configurado (e aí a leitura exige autenticação).
      let signaturePath = "";
      const upload = await uploadSignature({ authorizationId: authId, dataUrl: signatureDataUrl });
      if (upload.ok && upload.path) {
        signaturePath = upload.path;
      } else {
        const filename = `${authId}.png`;
        const filePath = path.join(SIGNATURES_DIR, filename);
        fs.mkdirSync(SIGNATURES_DIR, { recursive: true });
        const base64Data = signatureDataUrl.replace(/^data:image\/\w+;base64,/, "");
        fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
        signaturePath = `/uploads/signatures/${filename}`;
        console.warn("[Authorizations] Storage indisponível; assinatura gravada em disco local.");
      }

      const authoritativeSignedAt = new Date().toISOString();

      const authorization = await createAuthorization({
        id: authId,
        eventId,
        // O vínculo vem do token, não do corpo da requisição: sem isso o
        // cliente escolheria a qual estudante a autorização pertence.
        studentUserId: isEquipeAdmin
          ? String(studentUserId || "student-anonymous")
          : String(dbUser?.uid || req.user!.uid),
        studentName: studentName || "Estudante",
        studentSchool: studentSchool || "Colégio Estadual de Araucária",
        studentClass: studentClass || "Turma Regular",
        guardianFullName: guardianFullName.trim(),
        guardianRelationship: guardianRelationship.trim(),
        guardianContact: guardianContact ? guardianContact.trim() : "",
        authorizationText: authorizationText || "Autorizo formalmente a participação do estudante no evento escolar especificado.",
        consentVersion: consentVersion || "v1.0-2026",
        declarationAccepted: true,
        signedAt: authoritativeSignedAt,
        signaturePath,
        signatureDataUrl,
        verificationMethod: "digital_handwritten_signature",
        verificationStatus: "confirmed",
        status: "authorized",
        eventSnapshot: eventSnapshot || {
          title: "Evento Escolar",
          location: "Araucária/PR",
          date: authoritativeSignedAt,
          time: "Conforme cronograma",
          schoolName: studentSchool || "Rede de Ensino"
        }
      });

      // Automatically register participation in event history
      try {
        recordParticipationFallback({
          userId: studentUserId || "student-anonymous",
          eventId,
          eventTitle: eventSnapshot?.title || "Evento Escolar",
          eventDate: eventSnapshot?.date || "",
          eventTime: eventSnapshot?.time || "",
          eventLocation: eventSnapshot?.location || "",
          status: "Inscrito"
        });
      } catch (e) {
        console.warn("[Authorizations] Non-fatal participation recording note:", e);
      }

      res.status(201).json({
        success: true,
        authorization,
        message: "Autorização do responsável legal registrada com sucesso com validade digital!"
      });
    } catch (error: any) {
      console.error("[Authorizations API Error]:", error);
      res.status(500).json({ error: "Erro interno ao processar a autorização do responsável." });
    }
  });

  // 2. Check if student already has authorization for this event
  app.get("/api/events/:eventId/authorizations/check", requireAuth, async (req: AuthRequest, res) => {
    try {
      const eventId = parseInt(req.params.eventId, 10);
      const studentUserId = String(req.query.studentUserId || "");

      if (!studentUserId || isNaN(eventId)) {
        return res.json({ authorized: false, authorization: null });
      }

      // Consulta sobre situação de autorização de menor: só o próprio
      // estudante ou a equipe administrativa.
      const dbUser = await resolveDbUserForRequest(req);
      const isEquipeAdmin =
        checkIsChefe(dbUser, req.user) || checkIsFuncionario(dbUser, req.user);
      if (!isEquipeAdmin && !ownIdentityCandidates(req, dbUser).includes(studentUserId)) {
        return res.status(403).json({ authorized: false, authorization: null, error: AUTHORIZATION_FORBIDDEN });
      }

      const auth = await getAuthorizationByStudentAndEvent(studentUserId, eventId);
      res.json({
        authorized: !!(auth && auth.status === "authorized"),
        authorization: auth
      });
    } catch (error: any) {
      res.json({ authorized: false, authorization: null });
    }
  });

  // 3. List authorizations for an event (admins, directors, pedagogos)
  //
  // Antes era pública: qualquer visitante listava nome completo dos estudantes,
  // nome e contato do responsável legal e o texto assinado. Agora exige sessão
  // de administrador da instituição (Chefe ou Funcionário).
  app.get(
    "/api/events/:eventId/authorizations",
    requireAuth,
    requireAdminOrStaff,
    async (req: AuthRequest, res) => {
    try {
      const eventId = parseInt(req.params.eventId, 10);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "ID de evento inválido." });
      }
        const list = await listAuthorizationsByEvent(eventId);
        res.json(list);
      } catch (error: any) {
        res.status(500).json({ error: "Erro ao listar autorizações do evento." });
      }
    }
  );

  // 4. List authorizations for a student
  app.get("/api/users/:userId/authorizations", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = String(req.params.userId);

      const dbUser = await resolveDbUserForRequest(req);
      const isEquipeAdmin =
        checkIsChefe(dbUser, req.user) || checkIsFuncionario(dbUser, req.user);
      if (!isEquipeAdmin && !ownIdentityCandidates(req, dbUser).includes(userId)) {
        return res.status(403).json({ error: AUTHORIZATION_FORBIDDEN });
      }

      const list = await listAuthorizationsByStudent(userId);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao buscar autorizações do estudante." });
    }
  });

  // 5. Get signature image by authorization ID
  //
  // Parte 2 da auditoria: antes esta rota era PÚBLICA e servia a assinatura do
  // responsável para qualquer um que tivesse o id. Agora exige sessão e
  // devolve uma URL assinada de 5 minutos (bucket privado). O acesso ao disco
  // local só acontece depois da checagem de permissão.
  app.get("/api/authorizations/:id/signature", requireAuth, async (req: AuthRequest, res) => {
    try {
      const authId = String(req.params.id);
      if (!/^auth-[A-Za-z0-9-]+$/.test(authId)) {
        return res.status(400).json({ error: "Identificador de autorização inválido." });
      }

      const authorization = await getAuthorizationByStudentAndEvent(
        (req.user as any)?.uid || "",
        Number(req.query.eventId) || 0
      ).catch(() => null);

      const dbUser = req.dbUser || (await getUserByUid((req.user as any)?.uid).catch(() => null));
      const requesterIsStaff = checkIsChefe(dbUser, req.user) || checkIsFuncionario(dbUser, req.user);

      // Só a própria pessoa (dono da autorização) ou a equipe administrativa
      // pode ver a assinatura. Sem autorização, não há nem 404 nem imagem.
      if (!requesterIsStaff && !authorization) {
        return res.status(403).json({ error: "Você não tem permissão para acessar esta assinatura." });
      }

      // Preferência: URL assinada do bucket privado.
      const signed = await createSignedSignatureUrl(`${authId}.png`).catch(() => null);
      if (signed) {
        return res.json({ url: signed, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
      }
      const signedJpg = await createSignedSignatureUrl(`${authId}.jpg`).catch(() => null);
      if (signedJpg) {
        return res.json({ url: signedJpg, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
      }

      // Fallback legado (disco local), agora protegido por autenticação.
      const filePath = path.join(SIGNATURES_DIR, `${authId}.png`);
      if (fs.existsSync(filePath)) {
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "private, no-store");
        return fs.createReadStream(filePath).pipe(res);
      }
      res.status(404).json({ error: "Assinatura não encontrada." });
    } catch (err: any) {
      console.error("[Authorizations] Erro ao carregar assinatura:", err);
      res.status(500).json({ error: "Erro ao carregar assinatura." });
    }
  });

  // =========================================================================
  // NÚCLEO SaaS — Parte 4 a 13 da auditoria
  // =========================================================================
  // Convenções:
  //   `/api/saas/*`       → leitura pública (planos, parceiros, instituições)
  //   `/api/school/*`     → painel da escola (exige vínculo de admin)
  //   `/api/master/*`     → painel Master (exige proprietário da plataforma)
  //   `/api/billing/*`    → cobrança e webhooks
  //
  // Toda rota de escola resolve a instituição PELO VÍNCULO do usuário
  // (`memberships`), nunca por `schoolId` enviado no corpo — é isso que impede
  // uma escola de operar os dados de outra.

  const saasUnavailable = (res: any, detail?: string) =>
    res.status(503).json({
      error:
        "Núcleo SaaS não está disponível neste ambiente. Configure SUPABASE_URL e SUPABASE_SECRET_KEY no servidor.",
      code: "SAAS_NOT_CONFIGURED",
      detail,
    });

  /** Resolve o usuário autenticado e a instituição que ele administra. */
  async function resolveSchoolScope(req: AuthRequest, res: any, schoolIdFromParam?: string) {
    const authUser = req.user as any;
    if (!authUser) {
      res.status(401).json({ error: "Não autenticado." });
      return null;
    }

    const dbUser = req.dbUser || (await getUserByUid(authUser.uid).catch(() => null));
    if (!dbUser) {
      res.status(403).json({ error: "Conta não encontrada no diretório. Entre novamente." });
      return null;
    }
    if (dbUser.ativo === false) {
      res.status(403).json({ error: "Sua conta está bloqueada pela administração.", blocked: true });
      return null;
    }

    const administered = await listAdministeredSchools(dbUser.uid);
    if (administered.length === 0) {
      res.status(403).json({
        error: "Sua conta não administra nenhuma instituição no eloEscola.",
        code: "NO_SCHOOL_MEMBERSHIP",
      });
      return null;
    }

    let school = schoolIdFromParam
      ? administered.find((s) => s.id === schoolIdFromParam || s.slug === schoolIdFromParam) || null
      : administered[0];

    if (!school) {
      res.status(403).json({
        error: "Você não tem permissão para operar esta instituição.",
        code: "SCHOOL_FORBIDDEN",
      });
      return null;
    }

    const subscription = (await getSubscriptionBySchool(school.id)).data;
    const plan = subscription
      ? (await listPlans(true)).data?.find((p) => p.id === subscription.plan_id) || null
      : null;
    const entitlements = (await listEntitlements(school.id)).data || [];
    const access = resolveAccessState(subscription as any);
    const activeStudents = await countActiveStudents(school.id);

    return {
      dbUser,
      school,
      subscription,
      plan,
      entitlements,
      access,
      activeStudents,
      administered,
    };
  }

  /** Garante escrita liberada (assinatura em dia + cota do plano). */
  function ensureCanWrite(context: NonNullable<Awaited<ReturnType<typeof resolveSchoolScope>>>, res: any) {
    if (!context.access.canWrite) {
      res.status(402).json({
        error: context.access.reason || "Assinatura inativa: publicação bloqueada.",
        code: "SUBSCRIPTION_INACTIVE",
        subscriptionStatus: context.access.effectiveStatus,
        canRead: context.access.canRead,
      });
      return false;
    }
    return true;
  }

  function hasFeature(context: NonNullable<Awaited<ReturnType<typeof resolveSchoolScope>>>, key: string) {
    const row = context.entitlements.find((e: any) => e.feature_key === key);
    return !!(row && row.enabled);
  }

  // -----------------------------------------------------------------------
  // Catálogo comercial (público)
  // -----------------------------------------------------------------------
  app.get("/api/saas/plans", async (req, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const plans = await listPlans();
    if (plans.error) return res.status(500).json({ error: plans.error });
    const addons = await listPlanAddons();
    const founderSlotsTaken = (await listSchools()).data?.filter((s) => s.is_founder).length || 0;

    res.json({
      plans: plans.data,
      addons: addons.data || [],
      founders: {
        totalSlots: FOUNDER_SLOTS,
        takenSlots: founderSlotsTaken,
        availableSlots: Math.max(0, FOUNDER_SLOTS - founderSlotsTaken),
        discountPercent: FOUNDER_DISCOUNT_PERCENT,
        discountMonths: 12,
      },
      trialDays: TRIAL_DAYS,
      annualDiscountPercent: ANNUAL_DISCOUNT_PERCENT,
      // Diagnóstico honesto de cobrança: a UI mostra "sandbox" quando não há
      // provedor configurado, em vez de fingir checkout funcionando.
      billing: getBillingDiagnostics(),
    });
  });

  app.get("/api/saas/partners", async (req, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const partners = await listPartners("approved");
    if (partners.error) return res.status(500).json({ error: partners.error });
    // Nunca expõe contato interno: apenas dados de vitrine.
    const publicPartners = (partners.data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      description: p.description,
      city: p.city,
      state: p.state,
      website: p.website,
      logo_url: p.logo_url,
    }));
    res.json({ partners: publicPartners });
  });

  app.post("/api/saas/leads", publicWriteLimiter(), async (req, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const { name, email, phone, schoolName, city, state, planInterest, source } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({ error: "Informe nome e e-mail para que possamos entrar em contato." });
    }
    const result = await createSalesLead({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      phone: phone ? String(phone).trim() : undefined,
      schoolName: schoolName ? String(schoolName).trim() : undefined,
      city: city ? String(city).trim() : undefined,
      state: state ? String(state).trim() : undefined,
      planInterest: planInterest ? String(planInterest).trim() : undefined,
      source: source ? String(source).trim() : "site",
    });
    if (result.error) return res.status(500).json({ error: result.error });
    res.status(201).json({ success: true, message: "Recebemos seu contato. Nossa equipe responde em até 1 dia útil." });
  });

  // -----------------------------------------------------------------------
  // Painel da escola — "Minha assinatura"
  // -----------------------------------------------------------------------
  app.get("/api/school/me", requireAuth, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const ctx = await resolveSchoolScope(req, res);
    if (!ctx) return;

    // Mapeia entitlements para limites legíveis na UI.
    const limitFor = (key: string) =>
      ctx.entitlements.find((e: any) => e.feature_key === key)?.limit_value ?? null;

    const aiUsage = await countUsageInPeriod(ctx.school.id, "ai_assistant");

    res.json({
      school: ctx.school,
      administeredSchools: ctx.administered.map((s) => ({ id: s.id, slug: s.slug, name: s.name })),
      subscription: ctx.subscription
        ? {
            id: ctx.subscription.id,
            status: ctx.subscription.status,
            effectiveStatus: ctx.access.effectiveStatus,
            planId: ctx.subscription.plan_id,
            planName: ctx.plan?.name || ctx.subscription.plan_id,
            billingCycle: ctx.subscription.billing_cycle,
            trialEndsAt: ctx.subscription.trial_ends_at,
            currentPeriodEnd: ctx.subscription.current_period_end,
            graceUntil: ctx.subscription.grace_until,
            cancelAtPeriodEnd: ctx.subscription.cancel_at_period_end,
            discountPercent: Number(ctx.subscription.discount_percent) || 0,
            founderDiscount: ctx.subscription.founder_discount,
            provider: ctx.subscription.provider,
            nextDueAt: ctx.subscription.next_due_at,
          }
        : null,
      access: ctx.access,
      usage: {
        activeStudents: ctx.activeStudents,
        studentLimit: ctx.plan?.max_active_students ?? null,
        studentQuota: evaluateQuota(ctx.activeStudents, ctx.plan?.max_active_students, "alunos ativos"),
        adminLimit: ctx.plan?.max_admins ?? null,
        unitLimit: ctx.plan?.max_units ?? null,
        aiRequestsThisMonth: aiUsage,
        aiLimit: limitFor("ai_assistant"),
        aiQuota: evaluateQuota(aiUsage, limitFor("ai_assistant"), "mensagens de IA"),
      },
      entitlements: ctx.entitlements.map((e: any) => ({
        key: e.feature_key,
        label: featureLabel(e.feature_key),
        enabled: e.enabled,
        limit: e.limit_value,
      })),
      features: Object.fromEntries(ctx.entitlements.map((e: any) => [e.feature_key, e.enabled])),
    });
  });

  app.get("/api/school/payments", requireAuth, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const ctx = await resolveSchoolScope(req, res);
    if (!ctx) return;
    const payments = await listPaymentsForSchool(ctx.school.id, 50);
    if (payments.error) return res.status(500).json({ error: payments.error });
    res.json({ payments: payments.data });
  });

  app.get("/api/school/subscription-events", requireAuth, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const ctx = await resolveSchoolScope(req, res);
    if (!ctx) return;
    const events = await listSubscriptionEvents(ctx.school.id, 50);
    if (events.error) return res.status(500).json({ error: events.error });
    res.json({ events: events.data });
  });

  /**
   * Troca de plano / ciclo. Não cobra nada aqui: cria a intenção de cobrança
   * (pendente) e o Master ou o provedor confirmam.
   */
  app.post("/api/school/subscription/change-plan", requireAuth, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const ctx = await resolveSchoolScope(req, res);
    if (!ctx) return;

    const { planId, billingCycle } = req.body || {};
    const plans = (await listPlans()).data || [];
    const target = plans.find((p) => p.id === planId);
    if (!target) return res.status(400).json({ error: "Plano inválido." });
    const cycle: "monthly" | "annual" = billingCycle === "annual" ? "annual" : "monthly";

    if (!ctx.subscription) {
      return res.status(400).json({ error: "Nenhuma assinatura para alterar. Fale com o suporte." });
    }

    const basePrice = cycle === "annual" ? target.annual_price_cents : target.monthly_price_cents;
    const amount = effectivePriceCents(ctx.subscription as any, basePrice);

    // Assinatura em teste passa a valer a partir de agora, mantendo o teste.
    const now = new Date();
    const keepingTrial = ctx.subscription.status === "trialing";
    const periodEnd = keepingTrial
      ? ctx.subscription.trial_ends_at || nextPeriodEnd(now, cycle).toISOString()
      : nextPeriodEnd(now, cycle).toISOString();

    const updated = await updateSubscription(ctx.subscription.id, {
      plan_id: target.id,
      billing_cycle: cycle,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd,
      next_due_at: keepingTrial ? ctx.subscription.trial_ends_at || null : periodEnd,
    } as any);

    if (updated.error) return res.status(500).json({ error: updated.error });

    await syncEntitlementsFromPlan(ctx.school.id, ctx.subscription.id, target);
    await logSubscriptionEvent({
      subscriptionId: ctx.subscription.id,
      schoolId: ctx.school.id,
      eventType: "plan_changed",
      fromStatus: ctx.subscription.plan_id,
      toStatus: target.id,
      payload: { billingCycle: cycle, amountCents: amount },
      actorEmail: ctx.dbUser.email,
    });
    await logPlatformAudit({
      actorEmail: ctx.dbUser.email,
      actorRole: "school_admin",
      action: "subscription.plan_changed",
      targetType: "subscription",
      targetId: ctx.subscription.id,
      metadata: { school: ctx.school.slug, plan: target.id, cycle },
    });

    // Cobrança fica PENDENTE por definição (sem provedor configurado não há
    // como confirmar pagamento). Nunca marcamos como paga.
    const charge = await createCharge({
      schoolId: ctx.school.id,
      subscriptionId: ctx.subscription.id,
      amountCents: amount,
      method: "pix",
      kind: "subscription",
      description: `eloEscola — plano ${target.name} (${cycle === "annual" ? "anual" : "mensal"})`,
      idempotencyKey: `plan-${ctx.subscription.id}-${target.id}-${cycle}-${now.toISOString().slice(0, 10)}`,
      customerEmail: ctx.dbUser.email,
    });

    const payment = await createPaymentTransaction({
      schoolId: ctx.school.id,
      subscriptionId: ctx.subscription.id,
      provider: charge.provider,
      providerChargeId: charge.providerChargeId,
      method: "pix",
      kind: "subscription",
      amountCents: amount,
      status: "pending",
      idempotencyKey: `plan-${ctx.subscription.id}-${target.id}-${cycle}-${now.toISOString().slice(0, 10)}`,
      metadata: { message: charge.message, paymentUrl: charge.paymentUrl },
    });

    res.json({
      success: true,
      subscription: updated.data,
      charge: {
        status: charge.status,
        provider: charge.provider,
        paymentUrl: charge.paymentUrl,
        message: charge.message,
      },
      payment: payment.data,
    });
  });

  app.post("/api/school/subscription/cancel", requireAuth, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const ctx = await resolveSchoolScope(req, res);
    if (!ctx || !ctx.subscription) return;

    const updated = await updateSubscription(ctx.subscription.id, {
      cancel_at_period_end: true,
      canceled_at: new Date().toISOString(),
    } as any);
    if (updated.error) return res.status(500).json({ error: updated.error });

    await logSubscriptionEvent({
      subscriptionId: ctx.subscription.id,
      schoolId: ctx.school.id,
      eventType: "cancel_at_period_end",
      fromStatus: ctx.subscription.status,
      toStatus: ctx.subscription.status,
      payload: { requestedAt: new Date().toISOString() },
      actorEmail: ctx.dbUser.email,
    });

    res.json({
      success: true,
      message:
        "Cancelamento agendado. A instituição continua publicando até o fim do período já pago e nenhum dado é apagado.",
      subscription: updated.data,
    });
  });

  app.get("/api/school/campaigns", requireAuth, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const ctx = await resolveSchoolScope(req, res);
    if (!ctx) return;
    const campaigns = await listCampaignsForSchool(ctx.school.id);
    if (campaigns.error) return res.status(500).json({ error: campaigns.error });
    res.json({ campaigns: campaigns.data });
  });

  app.post("/api/school/campaigns/:id/decision", requireAuth, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const ctx = await resolveSchoolScope(req, res);
    if (!ctx) return;

    const campaigns = await listCampaignsForSchool(ctx.school.id);
    const campaign = (campaigns.data || []).find((c: any) => c.id === req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: "Campanha não encontrada para esta instituição." });
    }

    const approve = req.body?.approve === true;
    const decided = await decideCampaign({
      campaignId: campaign.id,
      approve,
      actorUid: ctx.dbUser.uid,
      reason: req.body?.reason,
    });
    if (decided.error) return res.status(500).json({ error: decided.error });

    await logPlatformAudit({
      actorEmail: ctx.dbUser.email,
      actorRole: "school_admin",
      action: approve ? "campaign.approved" : "campaign.rejected",
      targetType: "partner_campaign",
      targetId: campaign.id,
      metadata: { school: ctx.school.slug },
    });

    res.json({ success: true, campaign: decided.data });
  });

  // -----------------------------------------------------------------------
  // Painel MASTER (proprietário da plataforma)
  // -----------------------------------------------------------------------
  app.get("/api/master/overview", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const overview = await getPlatformOverview();
    if (overview.error) return res.status(500).json({ error: overview.error });

    const subs = overview.data!.subscriptions;
    const plans = (await listPlans(true)).data || [];
    const priceOf = (planId: string, cycle: string) => {
      const p = plans.find((x) => x.id === planId);
      if (!p) return 0;
      return cycle === "annual" ? Math.round(p.annual_price_cents / 12) : p.monthly_price_cents;
    };

    const mrrCents = subs
      .filter((s) => s.status === "active")
      .reduce((acc, s) => {
        const base = priceOf(s.plan_id, s.billing_cycle);
        return acc + effectivePriceCents(s as any, base);
      }, 0);

    const founderSlotUsed = (overview.data!.schools || []).filter((s) => s.is_founder).length;

    res.json({
      ...overview.data,
      totals: {
        ...overview.data!.totals,
        mrrCents,
        arrCents: mrrCents * 12,
        founderSlotsUsed: founderSlotUsed,
        founderSlotsTotal: FOUNDER_SLOTS,
      },
      plans,
      billing: getBillingDiagnostics(),
    });
  });

  app.get("/api/master/schools", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const schools = await listSchools();
    if (schools.error) return res.status(500).json({ error: schools.error });
    res.json({ schools: schools.data });
  });

  app.post("/api/master/schools", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const { name, slug, city, state, cnpj, planId, ownerEmail, startTrial } = req.body || {};
    if (!name || !slug) return res.status(400).json({ error: "Nome e identificador (slug) são obrigatórios." });

    const cleanSlug = String(slug)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const created = await createSchool({ name: String(name).trim(), slug: cleanSlug, city, state, cnpj });
    if (created.error || !created.data) return res.status(400).json({ error: created.error });

    const founderCount = (await listSchools()).data?.filter((s) => s.is_founder).length || 0;
    const isFounder = founderCount < FOUNDER_SLOTS;

    const chosenPlan = planId || "escola";
    const trialEnd = startTrial === false ? null : trialEndFrom(new Date()).toISOString();

    const sub = await createSubscription({
      schoolId: created.data.id,
      planId: chosenPlan,
      status: startTrial === false ? "active" : "trialing",
      trialEndsAt: trialEnd,
      periodEnd: trialEnd,
      discountPercent: isFounder ? FOUNDER_DISCOUNT_PERCENT : 0,
      founderDiscount: isFounder,
    });

    const plans = (await listPlans(true)).data || [];
    const plan = plans.find((p) => p.id === chosenPlan);
    if (sub.data && plan) {
      await syncEntitlementsFromPlan(created.data.id, sub.data.id, plan);
    }

    // Vincula o primeiro administrador da instituição, se informado.
    let membershipError: string | null = null;
    if (ownerEmail) {
      const owner = await getUserByEmail(String(ownerEmail).trim().toLowerCase());
      if (owner) {
        const m = await addMembership({
          userUid: owner.uid,
          schoolId: created.data.id,
          role: "school_admin",
          invitedBy: (req.dbUser as any)?.email || null,
        });
        membershipError = m.error;
      } else {
        membershipError = "E-mail do responsável não encontrado no diretório de usuários.";
      }
    }

    await logPlatformAudit({
      actorEmail: (req.dbUser as any)?.email,
      actorRole: "owner",
      action: "school.created",
      targetType: "school",
      targetId: created.data.id,
      metadata: { slug: cleanSlug, planId: chosenPlan, trial: startTrial !== false, isFounder },
    });

    res.status(201).json({
      success: true,
      school: created.data,
      subscription: sub.data,
      founderDiscount: isFounder,
      membershipError,
    });
  });

  app.put("/api/master/schools/:id", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const sb = getSaasAdminClient();
    if (!sb) return saasUnavailable(res);

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of ["name", "city", "state", "status", "notes", "legal_name", "cnpj"]) {
      if (req.body?.[key] !== undefined) patch[key] = req.body[key];
    }
    const { data, error } = await sb.from("schools").update(patch).eq("id", req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });

    await logPlatformAudit({
      actorEmail: (req.dbUser as any)?.email,
      actorRole: "owner",
      action: "school.updated",
      targetType: "school",
      targetId: req.params.id,
      metadata: patch,
    });
    res.json({ success: true, school: data });
  });

  app.get("/api/master/subscriptions", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const subs = await listAllSubscriptions();
    if (subs.error) return res.status(500).json({ error: subs.error });
    const schools = (await listSchools()).data || [];
    const plans = (await listPlans(true)).data || [];
    res.json({
      subscriptions: (subs.data || []).map((s) => ({
        ...s,
        schoolName: schools.find((x) => x.id === s.school_id)?.name || "—",
        planName: plans.find((p) => p.id === s.plan_id)?.name || s.plan_id,
        access: resolveAccessState(s as any),
      })),
      plans,
    });
  });

  app.put("/api/master/subscriptions/:id", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const allowed = ["status", "plan_id", "billing_cycle", "grace_until", "current_period_end", "next_due_at", "discount_percent", "notes"];
    const patch: Record<string, any> = {};
    for (const key of allowed) if (req.body?.[key] !== undefined) patch[key] = req.body[key];
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "Nenhum campo válido para atualizar." });
    }

    const before = (await listAllSubscriptions()).data?.find((s) => s.id === req.params.id);
    const updated = await updateSubscription(req.params.id, patch as any);
    if (updated.error) return res.status(400).json({ error: updated.error });

    // Mudança de plano no Master também ressincroniza entitlements.
    if (patch.plan_id) {
      const plan = (await listPlans(true)).data?.find((p) => p.id === patch.plan_id);
      if (plan && updated.data) {
        await syncEntitlementsFromPlan(updated.data.school_id, updated.data.id, plan);
      }
    }

    await logSubscriptionEvent({
      subscriptionId: req.params.id,
      schoolId: updated.data?.school_id,
      eventType: "master_update",
      fromStatus: before?.status,
      toStatus: updated.data?.status,
      payload: patch,
      actorEmail: (req.dbUser as any)?.email,
    });
    await logPlatformAudit({
      actorEmail: (req.dbUser as any)?.email,
      actorRole: "owner",
      action: "subscription.updated",
      targetType: "subscription",
      targetId: req.params.id,
      metadata: patch,
    });

    res.json({ success: true, subscription: updated.data });
  });

  app.get("/api/master/plans", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const plans = await listPlans(true);
    if (plans.error) return res.status(500).json({ error: plans.error });
    const addons = await listPlanAddons();
    res.json({ plans: plans.data, addons: addons.data || [] });
  });

  app.put("/api/master/plans/:id", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const allowed = [
      "name",
      "tagline",
      "monthly_price_cents",
      "annual_price_cents",
      "setup_fee_cents",
      "max_active_students",
      "max_units",
      "max_admins",
      "is_active",
      "is_public",
    ];
    const patch: Record<string, any> = {};
    for (const key of allowed) if (req.body?.[key] !== undefined) patch[key] = req.body[key];
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Nenhum campo válido." });

    const updated = await updatePlan(req.params.id, patch as any);
    if (updated.error) return res.status(400).json({ error: updated.error });

    await logPlatformAudit({
      actorEmail: (req.dbUser as any)?.email,
      actorRole: "owner",
      action: "plan.updated",
      targetType: "plan",
      targetId: req.params.id,
      metadata: patch,
    });
    res.json({ success: true, plan: updated.data });
  });

  app.get("/api/master/payments", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const payments = await listAllPayments(200);
    if (payments.error) return res.status(500).json({ error: payments.error });
    const schools = (await listSchools()).data || [];
    res.json({
      payments: (payments.data || []).map((p: any) => ({
        ...p,
        schoolName: schools.find((s) => s.id === p.school_id)?.name || "—",
      })),
      billing: getBillingDiagnostics(),
    });
  });

  /**
   * Baixa manual: o proprietário confirma um pagamento recebido fora do sistema
   * (Pix direto, transferência). É a ÚNICA forma de marcar `paid` sem webhook, e
   * fica registrada na auditoria de plataforma.
   */
  app.post("/api/master/payments/manual", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const { schoolId, subscriptionId, amountCents, method, note, dueDate } = req.body || {};
    if (!schoolId || !amountCents || Number(amountCents) <= 0) {
      return res.status(400).json({ error: "Informe a instituição e o valor recebido." });
    }

    const created = await createPaymentTransaction({
      schoolId,
      subscriptionId: subscriptionId || null,
      provider: "manual",
      method: method || "pix",
      kind: "manual",
      amountCents: Number(amountCents),
      status: "paid",
      dueDate: dueDate || null,
      idempotencyKey: `manual-${schoolId}-${Date.now()}`,
      metadata: { note: note || null, by: (req.dbUser as any)?.email || null, source: "manual_by_owner" },
    });
    if (created.error) return res.status(500).json({ error: created.error });

    // Se a assinatura estava em atraso, a baixa manual regulariza o ciclo.
    if (subscriptionId) {
      const sub = (await listAllSubscriptions()).data?.find((s) => s.id === subscriptionId);
      if (sub && ["past_due", "suspended", "expired", "trialing"].includes(sub.status)) {
        const start = new Date();
        const end = nextPeriodEnd(start, sub.billing_cycle);
        await updateSubscription(subscriptionId, {
          status: "active",
          current_period_start: start.toISOString(),
          current_period_end: end.toISOString(),
          next_due_at: end.toISOString(),
          grace_until: null,
          last_payment_at: new Date().toISOString(),
        } as any);
        await logSubscriptionEvent({
          subscriptionId,
          schoolId,
          eventType: "payment_confirmed_manual",
          fromStatus: sub.status,
          toStatus: "active",
          payload: { amountCents },
          actorEmail: (req.dbUser as any)?.email,
        });
      }
    }

    await logPlatformAudit({
      actorEmail: (req.dbUser as any)?.email,
      actorRole: "owner",
      action: "payment.manual_confirmed",
      targetType: "payment",
      targetId: created.data?.id,
      metadata: { schoolId, amountCents, method, note },
    });

    res.status(201).json({ success: true, payment: created.data });
  });

  app.get("/api/master/partners", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const partners = await listPartners();
    if (partners.error) return res.status(500).json({ error: partners.error });
    res.json({ partners: partners.data });
  });

  app.post("/api/master/partners", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const { name, category, description, city, state, contactEmail, contactPhone, website } = req.body || {};
    if (!name) return res.status(400).json({ error: "Informe o nome do parceiro." });
    const created = await createPartner({ name, category, description, city, state, contactEmail, contactPhone, website });
    if (created.error) return res.status(400).json({ error: created.error });
    await logPlatformAudit({
      actorEmail: (req.dbUser as any)?.email,
      actorRole: "owner",
      action: "partner.created",
      targetType: "partner",
      targetId: (created.data as any)?.id,
      metadata: { name },
    });
    res.status(201).json({ success: true, partner: created.data });
  });

  app.put("/api/master/partners/:id/status", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const status = req.body?.status;
    if (!["pending", "approved", "suspended", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Status inválido." });
    }
    const updated = await setPartnerStatus(req.params.id, status);
    if (updated.error) return res.status(400).json({ error: updated.error });
    await logPlatformAudit({
      actorEmail: (req.dbUser as any)?.email,
      actorRole: "owner",
      action: "partner.status_changed",
      targetType: "partner",
      targetId: req.params.id,
      metadata: { status },
    });
    res.json({ success: true, partner: updated.data });
  });

  app.post("/api/master/campaigns", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const { partnerId, schoolId, title, body, days } = req.body || {};
    if (!partnerId || !schoolId || !title) {
      return res.status(400).json({ error: "Informe parceiro, instituição e título da campanha." });
    }
    const created = await createCampaign({ partnerId, schoolId, title, body, days: Number(days) || 30 });
    if (created.error) return res.status(400).json({ error: created.error });
    await logPlatformAudit({
      actorEmail: (req.dbUser as any)?.email,
      actorRole: "owner",
      action: "campaign.created",
      targetType: "partner_campaign",
      targetId: (created.data as any)?.id,
      metadata: { partnerId, schoolId, days },
    });
    res.status(201).json({ success: true, campaign: created.data });
  });

  app.get("/api/master/audit", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const logs = await listPlatformAudit(200);
    if (logs.error) return res.status(500).json({ error: logs.error });
    res.json({ logs: logs.data });
  });

  app.get("/api/master/leads", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const leads = await listSalesLeads(200);
    if (leads.error) return res.status(500).json({ error: leads.error });
    res.json({ leads: leads.data });
  });

  app.put("/api/master/leads/:id/status", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const status = req.body?.status;
    if (!["new", "contacted", "trial_started", "won", "lost"].includes(status)) {
      return res.status(400).json({ error: "Status inválido." });
    }
    const updated = await updateSalesLeadStatus(req.params.id, status);
    if (updated.error) return res.status(400).json({ error: updated.error });
    res.json({ success: true, lead: updated.data });
  });

  // -----------------------------------------------------------------------
  // LGPD — canal do titular e consentimento (Parte 15)
  // -----------------------------------------------------------------------
  app.post("/api/privacy/request", publicWriteLimiter(), async (req, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const { email, name, requestType, details } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Informe um e-mail válido para retorno." });
    }
    const allowed = ["access", "correction", "deletion", "portability", "info"];
    if (!allowed.includes(requestType)) {
      return res.status(400).json({ error: "Tipo de solicitação inválido." });
    }
    if (!checkRecoveryRateLimit(`privacy-${cleanEmail}`, 3, 60 * 60 * 1000)) {
      return res.status(429).json({ error: "Você já enviou solicitações recentemente. Aguarde uma hora." });
    }

    const created = await createDataSubjectRequest({
      email: cleanEmail,
      name: name ? String(name).slice(0, 120) : undefined,
      requestType,
      details: details ? String(details).slice(0, 2000) : undefined,
    });
    if (created.error) return res.status(500).json({ error: created.error });

    await logPlatformAudit({
      actorEmail: cleanEmail,
      actorRole: "data_subject",
      action: "privacy.request_created",
      targetType: "data_subject_request",
      targetId: (created.data as any)?.id,
      metadata: { requestType },
      ip: recoveryIp(req),
    });

    res.status(201).json({
      success: true,
      message: "Solicitação registrada. Responderemos em até 15 dias corridos no e-mail informado.",
    });
  });

  app.post("/api/privacy/consent", async (req, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const { userUid, email, consentType, policyVersion, granted } = req.body || {};
    if (!consentType || !policyVersion) {
      return res.status(400).json({ error: "Informe o tipo de consentimento e a versão da política." });
    }
    await recordConsent({
      userUid: userUid || null,
      email: email || null,
      consentType: String(consentType),
      policyVersion: String(policyVersion),
      granted: granted !== false,
      ip: recoveryIp(req),
    });
    res.status(201).json({ success: true });
  });

  app.get("/api/master/privacy-requests", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const sb = getSaasAdminClient();
    if (!sb) return saasUnavailable(res);
    const { data, error } = await sb
      .from("data_subject_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ requests: data || [] });
  });

  app.put("/api/master/privacy-requests/:id", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    if (!isSaasBackendConfigured()) return saasUnavailable(res);
    const sb = getSaasAdminClient();
    if (!sb) return saasUnavailable(res);
    const status = req.body?.status;
    if (!["open", "in_progress", "completed", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Status inválido." });
    }
    const { data, error } = await sb
      .from("data_subject_requests")
      .update({
        status,
        handled_by: (req.dbUser as any)?.email || null,
        handled_at: new Date().toISOString(),
        resolution_notes: req.body?.notes || null,
      })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });

    await logPlatformAudit({
      actorEmail: (req.dbUser as any)?.email,
      actorRole: "owner",
      action: "privacy.request_updated",
      targetType: "data_subject_request",
      targetId: req.params.id,
      metadata: { status },
    });
    res.json({ success: true, request: data });
  });

  // -----------------------------------------------------------------------
  // Cobrança: webhook
  // -----------------------------------------------------------------------
  app.post("/api/billing/webhook", async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {});
    const provider =
      (req.query.provider as string) ||
      (req.headers["stripe-signature"] ? "stripe" : "generic");

    // 1. Assinatura
    let verification: { valid: boolean; reason?: string } = { valid: false, reason: "provedor desconhecido" };
    if (provider === "stripe") {
      verification = verifyStripeSignature(rawBody, req.headers["stripe-signature"] as string);
    } else {
      verification = verifyGenericSignature(rawBody, req.headers["x-webhook-signature"] as string);
    }

    let payload: any = {};
    try {
      payload = JSON.parse(rawBody || "{}");
    } catch {
      return res.status(400).json({ error: "Payload inválido." });
    }

    const normalized = normalizeWebhook(provider, payload);
    const eventId =
      normalized?.eventId || String(req.headers["x-event-id"] || `raw-${Date.now()}`);

    // 2. Registro idempotente (mesmo com assinatura inválida, fica auditado)
    const registered = await registerWebhookEvent({
      provider,
      eventId,
      eventType: normalized?.eventType || null,
      signatureValid: verification.valid,
      payload,
      status: verification.valid ? "received" : "failed",
      errorMessage: verification.valid ? null : verification.reason || "assinatura inválida",
    });

    if (registered.duplicate) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    // 3. Assinatura inválida NUNCA altera dados de cobrança.
    if (!verification.valid) {
      console.warn(`[Billing] Webhook ${provider} rejeitado: ${verification.reason}`);
      await logPlatformAudit({
        actorEmail: null,
        actorRole: "webhook",
        action: "webhook.signature_invalid",
        targetType: "webhook",
        targetId: eventId,
        metadata: { provider, reason: verification.reason },
      });
      return res.status(400).json({ error: "Assinatura do webhook inválida." });
    }

    if (!normalized || !normalized.transactionStatus) {
      await markWebhookProcessed(provider, eventId, "ignored");
      return res.status(200).json({ received: true, ignored: true });
    }

    try {
      const metadata = payload?.data?.object?.metadata || payload.metadata || {};
      const chargeId = normalized.providerRef;

      let payment = null;
      if (chargeId) {
        const updated = await updatePaymentStatus({
          providerChargeId: chargeId,
          status: normalized.transactionStatus,
        });
        payment = updated.data;
      }

      // Se o pagamento foi confirmado e havia assinatura vinculada, regulariza.
      if (normalized.transactionStatus === "paid") {
        const subscriptionId = payment?.subscription_id || metadata.subscription_id;
        if (subscriptionId) {
          const sub = (await listAllSubscriptions()).data?.find((s) => s.id === subscriptionId);
          if (sub) {
            const start = new Date();
            const end = nextPeriodEnd(start, sub.billing_cycle);
            await updateSubscription(subscriptionId, {
              status: "active",
              current_period_start: start.toISOString(),
              current_period_end: end.toISOString(),
              next_due_at: end.toISOString(),
              grace_until: null,
              last_payment_at: new Date().toISOString(),
            } as any);
            await logSubscriptionEvent({
              subscriptionId,
              schoolId: sub.school_id,
              eventType: "payment_confirmed_webhook",
              fromStatus: sub.status,
              toStatus: "active",
              payload: { provider, eventId },
              actorEmail: null,
            });
          }
        }
      }

      await markWebhookProcessed(provider, eventId, "processed");
      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("[Billing] Erro ao processar webhook:", err);
      await markWebhookProcessed(provider, eventId, "failed", err?.message);
      // 200 evita reentrega infinita; o registro fica como `failed` para análise.
      res.status(200).json({ received: true, processed: false });
    }
  });
  // --- AI CHAT ENDPOINT (ASSISTENTE ELO) ---
  let aiInstance: any = null;
  function getGenAI() {
    if (!aiInstance) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY não configurada no servidor. Por favor, adicione-a nas configurações.");
      }
      aiInstance = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return aiInstance;
  }

  function getEloLocalFallback(message: string, eventsList: any[]): string {
    const text = message.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // Remove accents

    const formatDate = (e: any) => {
      const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      return `${e.day} de ${months[e.month] || 'Novembro'} de ${e.year}`;
    };

    // 1. Dúvidas sobre as 6 Escolas de Araucária
    if (/\b(szymanski|wysocki|graca|graça|guajuvira|marilze|cecilia|cecília|escolas|colegios|colegio)\b/.test(text)) {
      if (text.includes("szymanski")) {
        const sch = ARAUCARIA_SCHOOLS[0];
        return `🏫 **${sch.name}**
📍 **Endereço:** ${sch.address} • ${sch.neighborhood}, Araucária/PR
📞 **Telefone:** ${sch.phone}
✉️ **E-mail:** ${sch.email}
🎓 **Modalidades:** Ensino Fundamental II, Ensino Médio Regular e Cursos Técnicos Integrados (Administração, Desenvolvimento de Sistemas e Química).
💡 **Destaque:** É um dos colégios mais tradicionais de Araucária, com ampla estrutura e laboratórios técnicos especializados.`;
      }
      if (text.includes("wysocki")) {
        const sch = ARAUCARIA_SCHOOLS[1];
        return `🏫 **${sch.name}**
📍 **Endereço:** ${sch.address} • ${sch.neighborhood}, Araucária/PR
📞 **Telefone:** ${sch.phone}
✉️ **E-mail:** ${sch.email}
🎓 **Modalidades:** Ensino Fundamental II, Ensino Médio Regular e Formação de Docentes.
💡 **Destaque:** Tradicional colégio de Araucária no bairro Costeira, polo em projetos de sustentabilidade e formação pedagógica.`;
      }
      if (text.includes("graca") || text.includes("graça")) {
        const sch = ARAUCARIA_SCHOOLS[2];
        return `🏫 **${sch.name}**
📍 **Endereço:** ${sch.address} • ${sch.neighborhood}, Araucária/PR
📞 **Telefone:** ${sch.phone}
✉️ **E-mail:** ${sch.email}
🎓 **Modalidades:** Ensino Fundamental II, Ensino Médio e Educação em Tempo Integral.
💡 **Destaque:** Destaque em feiras de iniciação científica e robótica educacional em Araucária.`;
      }
      if (text.includes("guajuvira")) {
        const sch = ARAUCARIA_SCHOOLS[3];
        return `🏫 **${sch.name}**
📍 **Endereço:** ${sch.address} • ${sch.neighborhood}, Zona Rural de Araucária/PR
📞 **Telefone:** ${sch.phone}
✉️ **E-mail:** ${sch.email}
🎓 **Modalidades:** Educação do Campo, Ensino Fundamental II e Ensino Médio com foco em Agroecologia e Meio Ambiente.
💡 **Destaque:** Referência paranaense em pedagogia da alternância e valorização das comunidades rurais e agrícolas.`;
      }
      if (text.includes("marilze")) {
        const sch = ARAUCARIA_SCHOOLS[4];
        return `🏫 **${sch.name}**
📍 **Endereço:** ${sch.address} • ${sch.neighborhood}, Araucária/PR
📞 **Telefone:** ${sch.phone}
✉️ **E-mail:** ${sch.email}
🎓 **Modalidades:** Ensino Fundamental II e Ensino Médio Inovador com oficinas interdisciplinares e esportivas.
💡 **Destaque:** Polo esportivo e cultural com forte envolvimento do Grêmio Estudantil no bairro CSU.`;
      }
      if (text.includes("cecilia") || text.includes("cecília")) {
        const sch = ARAUCARIA_SCHOOLS[5];
        return `🏫 **${sch.name}**
📍 **Endereço:** ${sch.address} • ${sch.neighborhood}, Araucária/PR
📞 **Telefone:** ${sch.phone}
✉️ **E-mail:** ${sch.email}
🎓 **Modalidades:** Ensino Fundamental II, Ensino Médio e Projetos de Leitura e Expressão Artística.
💡 **Destaque:** Reconhecido por projetos literários inovadores e biblioteca comunitária integrada às famílias.`;
      }

      return `O **eloEscola** conecta as principais instituições de ensino de Araucária:
1. **C.E. Prof. Júlio Szymanski** (Centro)
2. **C.E. Profª Helena Wysocki** (Costeira)
3. **C.E. Profª Maria da Graça Siqueira Silva e Lima** (Fazenda Velha)
4. **C.E. do Campo Guajuvira** (Guajuvira / Zona Rural)
5. **C.E. Profª Marilze da Luz Brand** (CSU / Fazenda Velha)
6. **C.E. Cecília Meireles** (Cachoeira)

Você pode me perguntar sobre os cursos, endereços, telefones ou eventos de qualquer uma delas!`;
    }

    // 2. Evento específico por palavras-chave
    const matchingEvents = eventsList.filter(e => {
      const titleClean = e.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const keywords = titleClean.split(/\s+/).filter((w: string) => w.length > 3);
      return keywords.some((kw: string) => text.includes(kw)) || titleClean.includes(text);
    });

    if (matchingEvents.length > 0 && text.length > 4) {
      const e = matchingEvents[0];
      return `Encontrei este evento no portal eloEscola que corresponde à sua busca! 🌟
      
**${e.title}**
📍 **Local:** ${e.location}
📅 **Data:** ${formatDate(e)}
🕒 **Horário:** ${e.time || "18:00"}
🏙️ **Cidade:** ${e.city || "Araucária"}
💰 **Acesso:** ${e.isPaid ? `Pago (${e.price || 'R$ 15,00'})` : "Gratuito / Entrada Livre"}
⚠️ **Informações & Requisitos:** ${e.requirements || "Aberto à comunidade escolar e famílias."}
${e.website ? `🌐 **Mais Detalhes:** [Acesse o link do evento](${e.website})` : ""}

Posso te ajudar com o roteiro de localização ou com outros eventos na região?`;
    }

    // 3. Saudações
    if (/\b(oi|ola|bom dia|boa tarde|boa noite|ola elo|ajuda|quem e voce|quem es tu|ajudar)\b/.test(text)) {
      return `Olá! Eu sou o **Assistente Elo**, o assistente virtual do **eloEscola — um portal para oportunidades e informações para todos**. 🌟

Estou aqui para te informar sobre:
- 🏫 **As escolas públicas de Araucária** (Szymanski, Helena Wysocki, Maria da Graça, Guajuvira, Marilze Brand e Cecília Meireles)
- 📅 **Eventos escolares e culturais em Araucária e Curitiba**
- 🆓 **Eventos gratuitos e abertos ao público**
- 🗺️ **Localização no mapa e rotas de acesso**
- 📍 **Como navegar e participar das atividades**

Como posso te ajudar hoje?`;
    }

    // 4. Eventos gratuitos
    if (/\b(gratis|gratuito|sem pagar|0800|de graca)\b/.test(text)) {
      const free = eventsList.filter(e => !e.isPaid);
      if (free.length > 0) {
        return `Temos ótimas oportunidades! Aqui estão os **eventos gratuitos** em Araucária e Curitiba:

${free.slice(0, 5).map((e, idx) => `${idx + 1}. **${e.title}**
   📍 Local: ${e.location} (${e.city || 'Araucária'})
   📅 Data: ${formatDate(e)} às ${e.time || "18:00"}`).join("\n\n")}

Todos com entrada livre para estudantes e comunidade escolar! Deseja detalhes sobre algum deles?`;
      }
    }

    // 5. Cidades: Araucária vs Curitiba
    if (/\b(araucaria|araucária|curitiba)\b/.test(text)) {
      const city = text.includes("curitiba") ? "Curitiba" : "Araucária";
      const cityEvents = eventsList.filter(e => (e.city || "").toLowerCase().includes(city.toLowerCase()));
      if (cityEvents.length > 0) {
        return `Eventos programados em **${city}**:

${cityEvents.slice(0, 4).map((e, idx) => `${idx + 1}. **${e.title}**
   📍 Local: ${e.location}
   📅 Data: ${formatDate(e)} às ${e.time || "18:00"}`).join("\n\n")}

Você também pode alternar a visualização geográfica desses eventos na aba **Mapa** do eloEscola!`;
      }
    }

    // 6. Agenda geral
    if (/\b(agenda|calendario|calendário|proximos|proximo|evento|eventos|atividades)\b/.test(text)) {
      if (eventsList.length > 0) {
        return `Aqui está a agenda de destaques escolares e culturais de Araucária e Curitiba:

${eventsList.slice(0, 5).map((e, idx) => `${idx + 1}. **${e.title}**
   📅 Data: ${formatDate(e)} às ${e.time || "18:00"}
   📍 Local: ${e.location} (${e.city || 'Araucária'})
   ${e.isPaid ? `💰 Valor: ${e.price || 'Ingresso pago'}` : '🆓 Entrada Gratuita'}`).join("\n\n")}

Precisa de orientações sobre horários, inscrições ou localização no mapa?`;
      }
    }

    // Resposta padrão
    return `Olá! Como **Assistente Elo**, estou aqui para ajudar você a explorar as escolas de Araucária e todos os eventos culturais e educacionais da nossa região (Araucária e Curitiba). 🎓

Você pode me perguntar sobre qualquer uma das 6 escolas parceiras, conferir eventos gratuitos ou pesquisar atividades por data e localização. Como posso te auxiliar neste momento?`;
  }

  app.post("/api/ai/chat", aiLimiter(), requireAuth, async (req: AuthRequest, res) => {
    try {
      const { message, history } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Mensagem é obrigatória" });
      }

      // ---- Cotas por instituição (Parte 11 da auditoria) ----
      // A IA custa dinheiro: sem autenticação, sem assinatura ativa ou com a
      // cota esgotada, o endpoint não chama o provedor. Nenhuma instituição
      // pode consumir a cota de outra porque o school_id vem do VÍNCULO do
      // usuário, nunca do corpo da requisição.
      let aiSchoolId: string | null = null;
      if (isSaasBackendConfigured()) {
        const authUser = req.user as any;
        const dbUser = req.dbUser || (await getUserByUid(authUser?.uid).catch(() => null));
        if (!dbUser) {
          return res.status(403).json({ error: "Conta não encontrada para uso do assistente." });
        }

        const administered = await listAdministeredSchools(dbUser.uid);
        const school = administered[0] || null;

        if (!school) {
          // Aluno/professor sem vínculo administrativo: a IA continua disponível
          // em modo informativo, sem cota de instituição e sem gravar consumo.
          aiSchoolId = null;
        } else {
          aiSchoolId = school.id;
          const subscription = (await getSubscriptionBySchool(school.id)).data;
          const access = resolveAccessState(subscription as any);
          if (!access.canWrite) {
            return res.status(402).json({
              error: access.reason || "Assinatura inativa: o assistente está indisponível.",
              code: "SUBSCRIPTION_INACTIVE",
            });
          }

          const entitlements = (await listEntitlements(school.id)).data || [];
          const aiEntitlement = entitlements.find((e: any) => e.feature_key === "ai_assistant");
          if (!aiEntitlement || !aiEntitlement.enabled) {
            return res.status(402).json({
              error:
                "O assistente Elo não está incluído no seu plano. Fale com a administração para contratar a IA.",
              code: "FEATURE_NOT_ENTITLED",
              feature: "ai_assistant",
            });
          }

          const used = await countUsageInPeriod(school.id, "ai_assistant");
          const quota = evaluateQuota(used, aiEntitlement.limit_value, "mensagens de IA");
          if (quota.isExhausted) {
            return res.status(429).json({
              error: quota.message,
              code: "AI_QUOTA_EXHAUSTED",
              used: quota.used,
              limit: quota.limit,
            });
          }
        }
      }

      let eventsContext = "";
      let eventsList: any[] = [];
      try {
        eventsList = await listAllEvents();
        eventsContext = eventsList.map(e => {
          return `- Título: ${e.title}\n  Cidade: ${e.city || 'Araucária'}\n  Local: ${e.location}\n  Data: ${e.day}/${e.month + 1}/${e.year}\n  Horário: ${e.time}\n  Gratuito: ${e.isPaid ? 'Não (' + (e.price || 'Pago') + ')' : 'Sim'}\n  Requisitos: ${e.requirements || 'Livre'}`;
        }).join("\n\n");
      } catch (dbErr: any) {
        console.warn("Não foi possível carregar eventos para contexto da IA:", dbErr);
        eventsContext = "Eventos disponíveis no banco de dados local de Araucária e Curitiba.";
      }

      const schoolsSummary = ARAUCARIA_SCHOOLS.map(s => 
        `- ${s.name} (${s.shortName}): Bairro ${s.neighborhood}, Araucária. Tel: ${s.phone}. Modalidades: ${s.modalities.join(", ")}.`
      ).join("\n");

      try {
        const ai = getGenAI();
        
        const contentsHistory = (history || []).map((h: any) => ({
          role: h.role === "user" ? "user" : "model",
          parts: [{ text: h.content }]
        }));

        contentsHistory.push({
          role: "user",
          parts: [{ text: message }]
        });

        let responseText = "";
        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout ao aguardar resposta do modelo Gemini")), 4500)
          );

          const geminiPromise = ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contentsHistory,
            config: {
              temperature: 0.5,
              systemInstruction: `Você é o "Assistente Elo", assistente oficial de inteligência artificial do eloEscola — um portal para oportunidades e informações para todos.
Você atende estudantes, professores, famílias e a comunidade de Araucária e Curitiba/PR.

SEU CONHECIMENTO BASE OBRIGATÓRIO:
As 6 Escolas Estaduais de Araucária conectadas ao portal:
${schoolsSummary}

Agenda atualizada de Eventos Escolares e Culturais em Araucária e Curitiba:
${eventsContext}

DIRETRIZES FUNDAMENTAIS:
1. NUNCA invente datas, horários, telefones ou nomes de escolas falsas. Use exclusivamente os dados fornecidos acima.
2. Seja acolhedor, objetivo, educado e fale em Português do Brasil com excelente clareza.
3. Se o usuário perguntar sobre uma escola específica, informe seu endereço real, bairro, modalidades e telefone.
4. Para eventos gratuitos, deixe claro que são de Entrada Livre.
5. Indique claramente se o evento é em Araucária ou Curitiba.
6. Mantenha as respostas concisas e bem formatadas em Markdown.`
            }
          });

          const response = await Promise.race([geminiPromise, timeoutPromise]);
          if (response && response.text) {
            responseText = response.text;
          }
        } catch (modelErr: any) {
          console.warn("[Assistente Elo] Gemini indisponível ou timeout, ativando fallback local inteligente:", modelErr?.message || modelErr);
          throw modelErr;
        }

        if (responseText) {
          if (aiSchoolId) {
            await recordUsage({
              schoolId: aiSchoolId,
              featureKey: "ai_assistant",
              userUid: (req.user as any)?.uid,
              metadata: { source: "gemini", chars: responseText.length },
            });
          }
          return res.json({ reply: responseText, source: "gemini" });
        } else {
          throw new Error("Resposta da IA vazia");
        }
      } catch (aiError: any) {
        // Fallback local: NÃO consome cota da instituição porque não houve
        // chamada paga ao provedor. A origem é informada para a UI ser honesta.
        const reply = getEloLocalFallback(message, eventsList);
        return res.json({ reply, source: "local_fallback" });
      }
    } catch (error: any) {
      console.error("Erro no chat com Assistente Elo:", error);
      res.status(500).json({ error: error.message || "Erro no processamento da IA" });
    }
  });


  // --- OAUTH CALLBACK HANDLER (POPUP & REDIRECT) ---
  app.get(["/auth/callback", "/auth/callback/"], (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <title>Autenticação Concluída</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; }
            .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; max-width: 380px; }
            .spinner { width: 32px; height: 32px; border: 3px solid #e2e8f0; border-top-color: #4C6B4C; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
            @keyframes spin { to { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="spinner"></div>
            <h3 style="margin: 0 0 0.5rem 0;">Autenticado com Sucesso!</h3>
            <p style="margin: 0; font-size: 0.875rem; color: #64748b;">Retornando para o aplicativo eloEscola...</p>
          </div>
          <script>
            try {
              const hash = window.location.hash;
              const search = window.location.search;
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage({ type: 'GOOGLE_OAUTH_SUCCESS', hash, search }, '*');
                setTimeout(() => { try { window.close(); } catch(e) {} }, 500);
              } else {
                window.location.href = '/' + (search || '') + (hash || '');
              }
            } catch (e) {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  });

  // --- VITE / STATIC SERVING FLOW ---

  // Vite development integration or production bundle serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} with environment ${process.env.NODE_ENV || "development"}`);
  });
}

startServer();
