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
  checkIsFuncionario
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
import {
  createAuthorization,
  getAuthorizationByStudentAndEvent,
  listAuthorizationsByEvent,
  listAuthorizationsByStudent
} from "./src/db/authorizations.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parsing middleware
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // --- API ROUTES ---

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Supabase/Postgres Database Status Info
  app.get("/api/db-status", async (req, res) => {
    try {
      const isSupabase = !!(process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || process.env.DIRECT_URL || process.env.POSTGRES_URL);
      const host = process.env.SUPABASE_DB_URL ? "Supabase (DB URL)" : (process.env.DATABASE_URL ? "Supabase (Custom URL)" : "Google Cloud SQL / Local");
      
      const { db, isDbCachedOffline, markDbOffline, markDbOnline, getDbHealthStats } = await import("./src/db/index.ts");
      const { sql } = await import("drizzle-orm");
      const healthStats = getDbHealthStats();
      
      if (isDbCachedOffline()) {
        return res.json({
          active: false,
          provider: isSupabase ? "Supabase (PostgreSQL)" : "Google Cloud SQL (PostgreSQL)",
          host: host,
          version: "Drizzle ORM + PG Node Driver",
          cachedOffline: true,
          error: "Conexão off-line em cache",
          sdkInstalled: true,
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

  // PASSWORD RECOVERY: Request via Email
  app.post("/api/auth/recovery/request-email", async (req, res) => {
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

      const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "ip";
      if (!checkRecoveryRateLimit(`email-rate-${cleanEmail}`, 5, 15 * 60 * 1000) || !checkRecoveryRateLimit(`ip-email-${ip}`, 20, 15 * 60 * 1000)) {
        return res.status(429).json({ error: "Muitas solicitações de recuperação para este e-mail. Aguarde alguns minutos." });
      }

      const user = await getUserByEmail(cleanEmail);
      if (!user) {
        return res.status(404).json({
          error: "Os dados informados não foram encontrados. Confira as informações e tente novamente."
        });
      }

      if (user.ativo === false) {
        return res.status(403).json({
          error: "Sua conta está desativada ou bloqueada. Entre em contato com a diretoria do C.E. Helena Wysocki para regularizar seu acesso."
        });
      }

      // Invalidate previous sessions for this email
      for (const [key, sess] of resetSessionsMap.entries()) {
        if (sess.email === cleanEmail) {
          resetSessionsMap.delete(key);
        }
      }

      const resetToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

      resetSessionsMap.set(resetToken, {
        token: resetToken,
        email: cleanEmail,
        userId: user.id,
        expiresAt,
        used: false,
        type: "email"
      });

      const host = req.get("host") || "localhost:3000";
      const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
      const resetUrl = `${protocol}://${host}/?reset_token=${resetToken}`;

      console.log(`[Password Recovery] Link gerado para ${cleanEmail}: ${resetUrl}`);

      res.json({
        success: true,
        message: "Link de recuperação gerado com sucesso. Utilize o link para cadastrar uma nova senha.",
        token: resetToken,
        resetUrl,
        expiresMinutes: 15
      });
    } catch (error: any) {
      console.error("Erro na recuperação por email:", error);
      res.status(500).json({ error: error.message || "Erro ao processar recuperação por e-mail." });
    }
  });

  // PASSWORD RECOVERY: Request via Phone (SMS Code)
  app.post("/api/auth/recovery/request-phone", async (req, res) => {
    try {
      const { phone } = req.body;
      const cleanPhone = (phone || "").trim();
      const digitsOnly = cleanPhone.replace(/\D/g, "");

      if (!digitsOnly || digitsOnly.length < 10) {
        return res.status(400).json({ error: "Informe um número de telefone celular válido com DDD (mínimo 10 dígitos)." });
      }

      const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "ip";
      const phoneKey = digitsOnly.startsWith("55") && digitsOnly.length >= 12 ? digitsOnly.slice(2) : digitsOnly;

      const existingOtp = phoneOtpMap.get(phoneKey);
      const now = Date.now();
      if (existingOtp && now - existingOtp.lastRequestedAt < 60 * 1000) {
        const waitSec = Math.ceil((60 * 1000 - (now - existingOtp.lastRequestedAt)) / 1000);
        return res.status(429).json({
          error: `Aguarde ${waitSec} segundos antes de solicitar um novo código SMS.`,
          cooldownSeconds: waitSec
        });
      }

      if (!checkRecoveryRateLimit(`phone-rate-${phoneKey}`, 5, 60 * 60 * 1000) || !checkRecoveryRateLimit(`ip-phone-${ip}`, 15, 60 * 60 * 1000)) {
        return res.status(429).json({ error: "Limite de solicitações de SMS atingido para este número. Tente novamente mais tarde." });
      }

      const user = await getUserByPhone(digitsOnly);
      if (!user) {
        return res.status(404).json({
          error: "Os dados informados não foram encontrados. Confira as informações e tente novamente."
        });
      }

      if (user.ativo === false) {
        return res.status(403).json({
          error: "Sua conta está desativada ou bloqueada pela administração escolar."
        });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = now + 10 * 60 * 1000; // 10 minutes

      phoneOtpMap.set(phoneKey, {
        phone: cleanPhone,
        normalizedPhone: phoneKey,
        code,
        email: user.email,
        userId: user.id,
        expiresAt,
        attempts: 0,
        maxAttempts: 5,
        createdAt: now,
        lastRequestedAt: now,
        verified: false
      });

      console.log(`[SMS Gateway Simulator] Código de verificação para ${cleanPhone} (${phoneKey}): [${code}] (Válido por 10 min)`);

      const last4 = digitsOnly.slice(-4);
      const ddd = digitsOnly.slice(0, 2);
      const masked = `(${ddd}) •••••-${last4}`;

      res.json({
        success: true,
        message: `Código de verificação SMS enviado para ${masked}.`,
        maskedPhone: masked,
        expiresMinutes: 10,
        cooldownSeconds: 60,
        testCode: code
      });
    } catch (error: any) {
      console.error("Erro na solicitação SMS:", error);
      res.status(500).json({ error: error.message || "Erro ao solicitar código por SMS." });
    }
  });

  // PASSWORD RECOVERY: Verify Phone Code
  app.post("/api/auth/recovery/verify-phone-code", async (req, res) => {
    try {
      const { phone, code } = req.body;
      const cleanDigits = (phone || "").replace(/\D/g, "");
      const phoneKey = cleanDigits.startsWith("55") && cleanDigits.length >= 12 ? cleanDigits.slice(2) : cleanDigits;
      const cleanCode = (code || "").trim();

      if (!phoneKey || !cleanCode) {
        return res.status(400).json({ error: "Telefone e código são obrigatórios." });
      }

      const otpData = phoneOtpMap.get(phoneKey);
      if (!otpData) {
        return res.status(400).json({ error: "Nenhum código ativo encontrado para este telefone. Solicite um novo código." });
      }

      const now = Date.now();
      if (now > otpData.expiresAt) {
        phoneOtpMap.delete(phoneKey);
        return res.status(400).json({ error: "O código informado expirou. Por favor, solicite um novo código." });
      }

      if (otpData.attempts >= otpData.maxAttempts) {
        phoneOtpMap.delete(phoneKey);
        return res.status(429).json({ error: "Limite máximo de tentativas excedido. Solicite um novo código SMS." });
      }

      if (otpData.code !== cleanCode) {
        otpData.attempts += 1;
        const remaining = otpData.maxAttempts - otpData.attempts;
        if (remaining <= 0) {
          phoneOtpMap.delete(phoneKey);
          return res.status(400).json({ error: "Código incorreto. Limite de tentativas esgotado. Solicite um novo código." });
        }
        return res.status(400).json({
          error: `Código de verificação incorreto. Tentativas restantes: ${remaining}.`,
          remainingAttempts: remaining
        });
      }

      otpData.verified = true;
      phoneOtpMap.delete(phoneKey);

      const resetToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = now + 15 * 60 * 1000; // 15 minutes

      resetSessionsMap.set(resetToken, {
        token: resetToken,
        email: otpData.email,
        userId: otpData.userId,
        expiresAt,
        used: false,
        type: "phone"
      });

      res.json({
        success: true,
        message: "Telefone confirmado com sucesso!",
        resetToken,
        expiresMinutes: 15
      });
    } catch (error: any) {
      console.error("Erro ao validar código SMS:", error);
      res.status(500).json({ error: error.message || "Erro ao validar código SMS." });
    }
  });

  // PASSWORD RECOVERY: Verify Token validity
  app.get("/api/auth/recovery/verify-token", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) {
        return res.status(400).json({ valid: false, error: "Token ausente." });
      }

      const session = resetSessionsMap.get(token);
      if (!session) {
        return res.status(404).json({ valid: false, error: "Link de recuperação inválido ou não encontrado." });
      }

      if (session.used) {
        return res.status(400).json({ valid: false, error: "Este link de recuperação já foi utilizado." });
      }

      if (Date.now() > session.expiresAt) {
        resetSessionsMap.delete(token);
        return res.status(400).json({ valid: false, error: "Este link de recuperação expirou. Por favor, solicite um novo." });
      }

      const [userPart, domain] = session.email.split("@");
      const maskedUser = userPart.length > 2 ? `${userPart.slice(0, 2)}••••` : `${userPart}•`;
      const maskedEmail = `${maskedUser}@${domain || ""}`;

      res.json({
        valid: true,
        email: maskedEmail,
        type: session.type
      });
    } catch (error: any) {
      console.error("Erro ao verificar token:", error);
      res.status(500).json({ valid: false, error: "Erro ao verificar validade do link." });
    }
  });

  // PASSWORD RECOVERY: Reset Password
  app.post("/api/auth/recovery/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token) {
        return res.status(400).json({ error: "Token de recuperação ausente." });
      }

      if (!newPassword || typeof newPassword !== "string" || newPassword.length < 4) {
        return res.status(400).json({ error: "A nova senha deve conter no mínimo 4 caracteres." });
      }

      const session = resetSessionsMap.get(token);
      if (!session) {
        return res.status(404).json({ error: "Token de recuperação inválido ou inexistente." });
      }

      if (session.used) {
        return res.status(400).json({ error: "Este token já foi utilizado anteriormente." });
      }

      if (Date.now() > session.expiresAt) {
        resetSessionsMap.delete(token);
        return res.status(400).json({ error: "Este token expirou. Solicite um novo link ou código." });
      }

      await updateUserPassword(session.userId || session.email, newPassword);

      session.used = true;
      resetSessionsMap.delete(token);

      for (const [k, s] of resetSessionsMap.entries()) {
        if (s.email === session.email) {
          resetSessionsMap.delete(k);
        }
      }

      console.log(`[Password Recovery] Senha atualizada com sucesso para ${session.email}`);

      res.json({
        success: true,
        message: "Senha alterada com sucesso! Você já pode entrar com sua nova senha.",
        email: session.email
      });
    } catch (error: any) {
      console.error("Erro ao redefinir senha:", error);
      res.status(500).json({ error: error.message || "Erro ao redefinir senha." });
    }
  });

  // Dedicated Registration Endpoint with duplicate check (email + phone)
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, nome, cpf, phone, birthdate, gender, institution, role } = req.body;
      const cleanEmail = (email || "").trim().toLowerCase();

      if (!cleanEmail) {
        return res.status(400).json({ error: "O e-mail é obrigatório." });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ error: "Formato de e-mail inválido. Exemplo: aluno@escola.pr.gov.br" });
      }

      // STRICT DUPLICATE EMAIL CHECK
      const existingUser = await getUserByEmail(cleanEmail);
      if (existingUser) {
        return res.status(400).json({ error: "Este e-mail já está cadastrado no sistema. Por favor, tente fazer login ou recupere sua senha." });
      }

      // STRICT DUPLICATE PHONE CHECK IF PHONE PROVIDED
      if (phone) {
        const cleanDigits = String(phone).replace(/\D/g, "");
        if (cleanDigits.length >= 8) {
          const existingPhoneUser = await getUserByPhone(cleanDigits);
          if (existingPhoneUser) {
            return res.status(400).json({ error: "Este número de telefone celular já está em uso em outra conta." });
          }
        }
      }

      if (!password || password.length < 3) {
        return res.status(400).json({ error: "A senha precisa ter no mínimo 3 caracteres." });
      }

      const uid = "local-uid-" + Math.floor(Math.random() * 88888 + 10000);
      let registeredUser = await getOrCreateUser(
        uid,
        cleanEmail,
        nome || cleanEmail.split("@")[0],
        "",
        "local",
        role || "Aluno",
        password
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

      const token = `local-${uid}|${registeredUser.role || 'Aluno'}|${encodeURIComponent(registeredUser.nome || '')}|${encodeURIComponent(cleanEmail)}|${encodeURIComponent(password)}`;

      res.json({ user: registeredUser, token });
    } catch (error: any) {
      console.error("Erro no registro do usuário:", error);
      res.status(500).json({ error: error.message || "Erro ao realizar o cadastro escolar." });
    }
  });

  // Local password login with database verification
  app.post("/api/auth/local-login-password", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email e senha são obrigatórios" });
      }

      const cleanEmail = email.trim().toLowerCase();
      let user = await getUserByEmail(cleanEmail);
      
      if (!user) {
        const isDirector = cleanEmail === "davidribeiromuller2009@gmail.com" || cleanEmail === "diretoria@helenawysocki.com";
        const isKnownDefault = isDirector || cleanEmail === "aluno@escola.pr.gov.br";
        
        if (isKnownDefault) {
          const defaultName = cleanEmail === "davidribeiromuller2009@gmail.com" 
            ? "David Ribeiro Müller" 
            : (cleanEmail === "diretoria@helenawysocki.com" ? "Diretoria Helena Wysocki" : "Aluno Helena Wysocki");
          
          user = await getOrCreateUser(
            "auto-uid-" + Math.floor(Math.random() * 88888 + 10000),
            cleanEmail,
            defaultName,
            "",
            "local",
            isDirector ? "Diretor" : "Aluno",
            password || "senha123"
          );
        } else {
          return res.status(404).json({ error: "Nenhuma conta cadastrada com este e-mail. Por favor, crie uma conta primeiro." });
        }
      } else {
        if (user.password && user.password !== password) {
          return res.status(401).json({ error: "Senha incorreta. Verifique os dados digitados e tente novamente." });
        }
      }

      if (user && user.ativo === false) {
        return res.status(403).json({
          error: "Sua conta foi bloqueada ou desativada pela administração. Entre em contato com a diretoria da Escola Helena Wysocki para solicitar o desbloqueio."
        });
      }

      // Generate local token matching standard requireAuth middleware expectation
      const token = `local-${user.uid}|${user.role || 'Aluno'}|${encodeURIComponent(user.nome || '')}|${encodeURIComponent(user.email)}`;

      res.json({ user, token });
    } catch (error: any) {
      console.error("Erro no login local por senha:", error);
      res.status(500).json({ error: error.message || "Erro interno no servidor" });
    }
  });

  // Direct Google Authentication endpoint (supports web preview / sandboxed iframe environments)
  app.post("/api/auth/google-direct-login", async (req, res) => {
    try {
      const { email, nome, foto_perfil, role } = req.body;
      if (!email || typeof email !== "string" || !email.trim()) {
        return res.status(400).json({ error: "O endereço de e-mail é obrigatório para autenticação Google." });
      }
      const cleanEmail = email.trim().toLowerCase();
      const userName = nome || (cleanEmail ? cleanEmail.split("@")[0].replace(/[._]/g, " ") : "Usuário Google");
      const userPhoto = foto_perfil || "";
      const userRole = role || "Aluno";
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
        userRole
      );

      if (user && user.ativo === false) {
        return res.status(403).json({
          error: "Sua conta foi bloqueada ou desativada pela administração escolar. Entre em contato com a diretoria da Escola Helena Wysocki para solicitar o desbloqueio."
        });
      }

      const token = `google-${uid}|${user.role || 'Aluno'}|${encodeURIComponent(user.nome || '')}|${encodeURIComponent(cleanEmail)}|${encodeURIComponent(userPhoto)}`;

      res.json({ user, token });
    } catch (error: any) {
      console.error("Erro no login direto com Google:", error);
      res.status(500).json({ error: error.message || "Falha ao autenticar com o Google" });
    }
  });

  // Autenticação: Login / Registrar Sincronizado
  app.post("/api/auth/login", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Contexto de autenticação ausente" });
      }

      const uid = req.user.uid || (req.user as any).sub || (req.user as any).user_id;
      const email = req.user.email || req.body?.email || "";
      const name = req.body?.nome || (req.user as any).name || (req.user as any).displayName || (email ? email.split("@")[0] : "Usuário Google");
      const picture = req.body?.foto_perfil || (req.user as any).picture || (req.user as any).photoURL || "";
      const provider = req.user.iss === "local-sim" ? "local" : "google";
      const role = req.body?.role || (req.user as any).role || "Aluno";
      const password = (req.user as any).password;

      if (!uid) {
        return res.status(400).json({ error: "UID não identificado no token de autenticação." });
      }
      
      // Sincroniza o usuário do Firebase/Local com nossa tabela PostgreSQL/Fallback
      const user = await getOrCreateUser(
        uid,
        email,
        name,
        picture,
        provider,
        role,
        password
      );

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
  app.post("/api/auth/guest-login", (req, res) => {
    try {
      const guestId = Math.floor(Math.random() * 80000) + 20000;
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

      const token = `guest-${guestUser.uid}|Convidado|${encodeURIComponent(guestUser.nome)}|${encodeURIComponent(guestUser.email)}|`;
      res.json({ user: guestUser, token });
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao iniciar sessão de convidado." });
    }
  });

  // Autenticação: Login Institucional da Escola (Acesso Exclusivo das Instituições de Ensino)
  app.post("/api/auth/institutional-login", (req, res) => {
    try {
      const { identificador, password } = req.body;
      if (!identificador || !password) {
        return res.status(400).json({ error: "Identificador institucional e senha são obrigatórios." });
      }

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

      const token = `inst-${schoolUser.uid}|Escola|${encodeURIComponent(schoolUser.nome)}|${encodeURIComponent(schoolUser.email)}|${account.escolaId}`;
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
  app.get("/api/events/archived", (req, res) => {
    try {
      const archived = listArchivedEventsFallback();
      res.json({ archived, retentionDays: EVENT_RETENTION_DAYS });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao consultar histórico de eventos." });
    }
  });

  // Restaurar evento arquivado de volta aos eventos ativos (Painel ADM)
  app.post("/api/events/:id/restore", (req, res) => {
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
  app.get("/api/events/archive-logs", (req, res) => {
    try {
      const logs = getEventArchiveLogsFallback();
      res.json({ logs, retentionDays: EVENT_RETENTION_DAYS });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao consultar logs de arquivamento." });
    }
  });

  // Executar rotina manual de expiração de eventos (3 dias após encerramento)
  app.post("/api/events/cleanup-expired", (req, res) => {
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
  app.post("/api/events/:eventId/authorizations", async (req, res) => {
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

      const authId = `auth-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      const filename = `${authId}.png`;
      const filePath = path.join(SIGNATURES_DIR, filename);

      // Save binary image to disk
      const base64Data = signatureDataUrl.replace(/^data:image\/\w+;base64,/, "");
      fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
      const signaturePath = `/uploads/signatures/${filename}`;

      const authoritativeSignedAt = new Date().toISOString();

      const authorization = await createAuthorization({
        id: authId,
        eventId,
        studentUserId: String(studentUserId || "student-anonymous"),
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
  app.get("/api/events/:eventId/authorizations/check", async (req, res) => {
    try {
      const eventId = parseInt(req.params.eventId, 10);
      const studentUserId = req.query.studentUserId as string;

      if (!studentUserId || isNaN(eventId)) {
        return res.json({ authorized: false, authorization: null });
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
  app.get("/api/events/:eventId/authorizations", async (req, res) => {
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
  });

  // 4. List authorizations for a student
  app.get("/api/users/:userId/authorizations", async (req, res) => {
    try {
      const userId = req.params.userId;
      const list = await listAuthorizationsByStudent(userId);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao buscar autorizações do estudante." });
    }
  });

  // 5. Get signature image by authorization ID
  app.get("/api/authorizations/:id/signature", (req, res) => {
    try {
      const authId = req.params.id;
      const filename = `${authId}.png`;
      const filePath = path.join(SIGNATURES_DIR, filename);

      if (fs.existsSync(filePath)) {
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "private, max-age=3600");
        return fs.createReadStream(filePath).pipe(res);
      }
      res.status(404).json({ error: "Assinatura não encontrada." });
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao carregar assinatura." });
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

  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { message, history } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Mensagem é obrigatória" });
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
          return res.json({ reply: responseText });
        } else {
          throw new Error("Resposta da IA vazia");
        }
      } catch (aiError: any) {
        const reply = getEloLocalFallback(message, eventsList);
        return res.json({ reply });
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
