/**
 * Recuperação de senha, OTP e sessões — persistidos no banco.
 *
 * HISTÓRICO DA FALHA (Parte 2 da auditoria):
 *  - `/api/auth/recovery/request-email` devolvia `token` e `resetUrl` no JSON,
 *    então qualquer pessoa que soubesse o e-mail de outra podia redefinir a
 *    senha dela sem acesso à caixa de entrada;
 *  - `/api/auth/recovery/request-phone` devolvia `testCode` (o código SMS);
 *  - os mapas de token/OTP viviam na memória do processo.
 *
 * Agora: o token só existe no link enviado por e-mail / SMS. O navegador recebe
 * apenas uma mensagem neutra. Se o canal de envio não estiver configurado, a
 * rota devolve `deliveryPending: true` e NÃO revela nenhum segredo — o token
 * fica gravado porém inutilizável até existir canal (fail-closed).
 */
import { hashOpaqueToken, randomToken, randomOtpCode } from "./security.ts";
import { getSaasAdminClient } from "./saasStore.ts";

export const RESET_TOKEN_TTL_MINUTES = 30;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

export type ResetChannel = "email" | "sms";

export interface DeliveryStatus {
  delivered: boolean;
  channel: ResetChannel;
  /** Motivo técnico quando não houve entrega (vai para log, não para o cliente). */
  reason?: string;
}

/**
 * Envia e-mail transacional.
 *
 * Não há provedor configurado neste ambiente (RESEND_API_KEY / SMTP ausentes),
 * portanto devolvemos `delivered: false` — nunca fingimos entrega.
 */
export async function sendEmail(to: string, subject: string, body: string): Promise<DeliveryStatus> {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const from = (process.env.TRANSACTIONAL_EMAIL_FROM || "").trim();

  if (!apiKey || !from) {
    console.warn(`[Email] Provedor não configurado. E-mail para ${maskEmail(to)} não enviado.`);
    return { delivered: false, channel: "email", reason: "RESEND_API_KEY/TRANSACTIONAL_EMAIL_FROM ausentes" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text: body }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[Email] Provedor recusou o envio:", res.status, detail.slice(0, 300));
      return { delivered: false, channel: "email", reason: `HTTP ${res.status}` };
    }
    return { delivered: true, channel: "email" };
  } catch (err: any) {
    console.error("[Email] Falha de rede:", err?.message || err);
    return { delivered: false, channel: "email", reason: err?.message };
  }
}

/** Envia SMS. Sem TWILIO_* configurado, reporta não entregue. */
export async function sendSms(to: string, message: string): Promise<DeliveryStatus> {
  const sid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = (process.env.TWILIO_FROM_NUMBER || "").trim();

  if (!sid || !token || !from) {
    console.warn(`[SMS] Provedor não configurado. SMS para ${maskPhone(to)} não enviado.`);
    return { delivered: false, channel: "sms", reason: "TWILIO_* ausentes" };
  }

  try {
    const body = new URLSearchParams({ To: to, From: from, Body: message });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[SMS] Provedor recusou o envio:", res.status, detail.slice(0, 300));
      return { delivered: false, channel: "sms", reason: `HTTP ${res.status}` };
    }
    return { delivered: true, channel: "sms" };
  } catch (err: any) {
    console.error("[SMS] Falha de rede:", err?.message || err);
    return { delivered: false, channel: "sms", reason: err?.message };
  }
}

export function maskEmail(email: string): string {
  const [user, domain] = (email || "").split("@");
  if (!domain) return "***";
  const head = user.slice(0, 2);
  return `${head}${"•".repeat(Math.max(2, Math.min(6, user.length - 2)))}@${domain}`;
}

export function maskPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 6) return "•••••";
  const ddd = digits.slice(0, 2);
  const last4 = digits.slice(-4);
  return `(${ddd}) •••••-${last4}`;
}

export interface CreatedResetToken {
  /** Token em claro — entregue APENAS ao canal de envio, nunca ao navegador. */
  token: string;
  expiresAt: string;
  code?: string;
}

/**
 * Cria token de recuperação por e-mail.
 * Grava somente o hash. Invalida tokens anteriores não usados do mesmo e-mail.
 */
export async function createEmailResetToken(input: {
  email: string;
  userUid?: string | null;
  ip?: string | null;
}): Promise<{ data: CreatedResetToken | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return { data: null, error: "Backend de autenticação não configurado (SUPABASE_SECRET_KEY)." };

  const email = input.email.trim().toLowerCase();

  await sb
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("email", email)
    .is("used_at", null);

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  const { error } = await sb.from("password_reset_tokens").insert([
    {
      token_hash: hashOpaqueToken(token),
      user_uid: input.userUid || null,
      email,
      channel: "email",
      expires_at: expiresAt,
      requested_ip: input.ip || null,
    },
  ]);

  if (error) {
    console.error("[AuthTokens] createEmailResetToken:", error.message);
    return { data: null, error: "Não foi possível gerar o link de recuperação." };
  }

  return { data: { token, expiresAt }, error: null };
}

/**
 * Cria OTP por SMS. A resposta pública NUNCA inclui o código.
 * O código é gravado como hash e só é entregue ao provedor de SMS.
 */
export async function createPhoneOtp(input: {
  email: string;
  phone: string;
  userUid?: string | null;
  ip?: string | null;
}): Promise<{ data: { code: string; expiresAt: string; maskedPhone: string } | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return { data: null, error: "Backend de autenticação não configurado." };

  const email = input.email.trim().toLowerCase();
  const code = randomOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  await sb
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("email", email)
    .eq("channel", "sms")
    .is("used_at", null);

  const { error } = await sb.from("password_reset_tokens").insert([
    {
      token_hash: hashOpaqueToken(`otp:${email}:${code}:${expiresAt}`),
      user_uid: input.userUid || null,
      email,
      channel: "sms",
      code_hash: hashOpaqueToken(`${code}:${email}`),
      expires_at: expiresAt,
      max_attempts: OTP_MAX_ATTEMPTS,
      requested_ip: input.ip || null,
    },
  ]);

  if (error) {
    console.error("[AuthTokens] createPhoneOtp:", error.message);
    return { data: null, error: "Não foi possível gerar o código de verificação." };
  }

  return {
    data: { code, expiresAt, maskedPhone: maskPhone(input.phone) },
    error: null,
  };
}

/** Confere OTP e, se correto, emite o token de redefinição (devolvido ao cliente). */
export async function verifyPhoneOtp(input: {
  email: string;
  code: string;
  ip?: string | null;
}): Promise<{ token: string | null; error: string | null; remainingAttempts?: number }> {
  const sb = getSaasAdminClient();
  if (!sb) return { token: null, error: "Backend de autenticação não configurado." };

  const email = input.email.trim().toLowerCase();
  const code = input.code.trim();

  const { data: rows, error } = await sb
    .from("password_reset_tokens")
    .select("*")
    .eq("email", email)
    .eq("channel", "sms")
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return { token: null, error: "Erro ao validar o código." };
  const row = (rows || [])[0];
  if (!row) return { token: null, error: "Nenhum código ativo. Solicite um novo." };

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await sb.from("password_reset_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    return { token: null, error: "O código expirou. Solicite um novo." };
  }

  if (row.attempts >= row.max_attempts) {
    return { token: null, error: "Limite de tentativas excedido. Solicite um novo código." };
  }

  const expected = hashOpaqueToken(`${code}:${email}`);
  if (expected !== row.code_hash) {
    const attempts = row.attempts + 1;
    await sb.from("password_reset_tokens").update({ attempts }).eq("id", row.id);
    const remaining = Math.max(0, row.max_attempts - attempts);
    if (remaining === 0) {
      return { token: null, error: "Código incorreto. Limite de tentativas esgotado." };
    }
    return { token: null, error: `Código incorreto. Tentativas restantes: ${remaining}.`, remainingAttempts: remaining };
  }

  // Sucesso: consome o OTP e cria o token de redefinição.
  await sb
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id);

  const token = randomToken(32);
  const { error: insErr } = await sb.from("password_reset_tokens").insert([
    {
      token_hash: hashOpaqueToken(token),
      user_uid: row.user_uid,
      email,
      channel: "sms",
      expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000).toISOString(),
      requested_ip: input.ip || null,
    },
  ]);

  if (insErr) return { token: null, error: "Não foi possível concluir a verificação." };
  return { token, error: null };
}

export interface ResetTokenLookup {
  email: string;
  userUid: string | null;
}

/** Valida o token de redefinição sem consumi-lo. */
export async function findValidResetToken(token: string): Promise<ResetTokenLookup | null> {
  const sb = getSaasAdminClient();
  if (!sb || !token) return null;

  const { data } = await sb
    .from("password_reset_tokens")
    .select("email, user_uid, expires_at, used_at, channel")
    .eq("token_hash", hashOpaqueToken(token))
    .maybeSingle();

  if (!data) return null;
  if (data.used_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return { email: data.email, userUid: data.user_uid || null };
}

/** Consome o token (uso único) e devolve o e-mail associado. */
export async function consumeResetToken(token: string): Promise<ResetTokenLookup | null> {
  const found = await findValidResetToken(token);
  if (!found) return null;

  const sb = getSaasAdminClient();
  if (!sb) return null;

  const { error } = await sb
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", hashOpaqueToken(token))
    .is("used_at", null);

  if (error) return null;
  return found;
}

/** Registra a sessão emitida, permitindo revogação explícita. */
export async function recordSession(input: {
  sessionId: string;
  userUid: string;
  via?: string;
  ip?: string | null;
  userAgent?: string | null;
  expiresAt: string;
}): Promise<void> {
  const sb = getSaasAdminClient();
  if (!sb) return;
  const { error } = await sb.from("auth_sessions").insert([
    {
      session_id: input.sessionId,
      user_uid: input.userUid,
      via: input.via || "password",
      ip: input.ip || null,
      user_agent: input.userAgent || null,
      expires_at: input.expiresAt,
    },
  ]);
  if (error) console.warn("[AuthTokens] recordSession:", error.message);
}

/** Revoga todas as sessões de um usuário (troca de senha, bloqueio). */
export async function revokeUserSessions(userUid: string): Promise<void> {
  const sb = getSaasAdminClient();
  if (!sb) return;
  const { error } = await sb
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_uid", userUid)
    .is("revoked_at", null);
  if (error) console.warn("[AuthTokens] revokeUserSessions:", error.message);
}

/** Sessão ainda válida? Usada quando há tabela disponível. */
export async function isSessionActive(sessionId: string): Promise<boolean | null> {
  const sb = getSaasAdminClient();
  if (!sb) return null; // sem tabela: o JWT já foi validado criptograficamente
  const { data, error } = await sb
    .from("auth_sessions")
    .select("session_id, revoked_at, expires_at")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.revoked_at) return false;
  if (new Date(data.expires_at).getTime() < Date.now()) return false;
  return true;
}

/** Consentimento LGPD. */
export async function recordConsent(input: {
  userUid?: string | null;
  email?: string | null;
  consentType: string;
  policyVersion: string;
  granted: boolean;
  ip?: string | null;
  metadata?: Record<string, any>;
}): Promise<void> {
  const sb = getSaasAdminClient();
  if (!sb) return;
  const { error } = await sb.from("consent_records").insert([
    {
      user_uid: input.userUid || null,
      email: input.email || null,
      consent_type: input.consentType,
      policy_version: input.policyVersion,
      granted: input.granted,
      ip: input.ip || null,
      metadata: input.metadata || {},
    },
  ]);
  if (error) console.warn("[AuthTokens] recordConsent:", error.message);
}

/** Pedido do titular (LGPD). */
export async function createDataSubjectRequest(input: {
  email: string;
  name?: string;
  requestType: "access" | "correction" | "deletion" | "portability" | "info";
  details?: string;
}) {
  const sb = getSaasAdminClient();
  if (!sb) return { data: null, error: "Canal de privacidade indisponível no momento." };
  const { data, error } = await sb
    .from("data_subject_requests")
    .insert([
      {
        requester_email: input.email.trim().toLowerCase(),
        requester_name: input.name || null,
        request_type: input.requestType,
        details: input.details || null,
      },
    ])
    .select()
    .single();
  if (error) return { data: null, error: "Não foi possível registrar sua solicitação." };
  return { data, error: null };
}
