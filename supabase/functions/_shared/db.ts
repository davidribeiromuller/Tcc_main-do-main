/**
 * Banco e identidade para as Edge Functions do módulo comercial.
 *
 * SEGREDOS
 * --------
 * `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados automaticamente
 * pelo runtime das Edge Functions. A chave de serviço **ignora RLS** — é o que
 * permite ler o financeiro global sem abrir policy pública. Ela nunca sai do
 * servidor: o navegador não recebe, não vê e não consegue pedir.
 *
 * Se `SUPABASE_SERVICE_ROLE_KEY` não estiver disponível, o módulo NÃO cai para
 * a chave publicável. Cair seria pior que falhar: toda leitura devolveria lista
 * vazia e a tela mostraria "R$ 0,00" como se fosse o faturamento real.
 */
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface Contexto {
  /** Cliente com chave de serviço. Ignora RLS. */
  admin: SupabaseClient;
  /** Quem chamou, verificado a partir do JWT. `null` = visitante anônimo. */
  usuario: { id: string; email: string } | null;
}

export function lerAmbiente() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return { url, serviceKey, configurado: Boolean(url && serviceKey) };
}

export function clienteAdmin(): SupabaseClient {
  const { url, serviceKey, configurado } = lerAmbiente();
  if (!configurado) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY ausente nas variáveis da Edge Function. " +
        "Configure o segredo antes de usar o painel financeiro."
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Resolve o usuário a partir do `Authorization: Bearer <jwt>`.
 *
 * A verificação é feita por `auth.getUser(token)`, que valida a assinatura do
 * JWT contra o projeto — não é decodificação de payload. Token forjado ou
 * expirado devolve `null`, e nenhuma decisão financeira é tomada.
 */
export async function resolverUsuario(
  admin: SupabaseClient,
  authorization: string | null
): Promise<{ id: string; email: string } | null> {
  if (!authorization || !authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;

  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return { id: data.user.id, email: (data.user.email || "").toLowerCase() };
  } catch {
    return null;
  }
}

/**
 * Qual papel o usuário tem DENTRO de uma instituição.
 *
 * Fonte da verdade é `memberships`, não o frontend. Um `Diretor` do app antigo
 * não vira administrador financeiro automaticamente: precisa de vínculo
 * `school_admin` ativo.
 */
export async function papelNaInstituicao(
  admin: SupabaseClient,
  userId: string,
  schoolId: string
): Promise<"school_admin" | "school_staff" | "teacher" | "student" | "guardian" | null> {
  const { data, error } = await admin
    .from("memberships")
    .select("role, status")
    .eq("user_uid", userId)
    .eq("school_id", schoolId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) return null;
  return data.role as any;
}

/** Instituição da qual o usuário é administrador (ou null). */
export async function instituicaoDoUsuario(
  admin: SupabaseClient,
  userId: string
): Promise<{ school_id: string; role: string } | null> {
  const { data, error } = await admin
    .from("memberships")
    .select("school_id, role, status")
    .eq("user_uid", userId)
    .eq("status", "active")
    .in("role", ["school_admin", "school_staff"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return { school_id: data.school_id, role: data.role };
}

// ---------------------------------------------------------------------------
// Proprietário da plataforma
// ---------------------------------------------------------------------------

/**
 * Quem pode abrir o painel financeiro global.
 *
 * Vem EXCLUSIVAMENTE de `PLATFORM_OWNER_EMAILS` (segredo da função), comparado
 * com o e-mail do JWT verificado. O pedido proíbe criar cargo global novo e
 * proíbe permitir que um administrador escolar se torne proprietário por campo
 * enviado pelo frontend — por isso não existe coluna `is_owner` em tabela
 * nenhuma: não há o que o frontend alterar.
 *
 * Lista vazia = ninguém entra. É falha fechada de propósito: sem configuração,
 * o painel não abre e a função responde explicando o que falta.
 */
export function proprietarios(): string[] {
  return (Deno.env.get("PLATFORM_OWNER_EMAILS") || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function ehProprietario(email: string | null | undefined): boolean {
  const lista = proprietarios();
  if (lista.length === 0) return false;
  return lista.includes((email || "").toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// Respostas
// ---------------------------------------------------------------------------

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

export function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function erro(mensagem: string, status = 400, extra: Record<string, unknown> = {}): Response {
  return json({ error: mensagem, ...extra }, status);
}

/** Registra operação comercial. Nunca falha a operação por causa do log. */
export async function auditar(
  admin: SupabaseClient,
  entrada: {
    actor_email: string | null;
    actor_role: string | null;
    action: string;
    target_type?: string;
    target_id?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await admin.from("platform_audit_logs").insert([entrada]);
  } catch (e) {
    console.warn("[billing] auditoria falhou (operação segue):", e);
  }
}
