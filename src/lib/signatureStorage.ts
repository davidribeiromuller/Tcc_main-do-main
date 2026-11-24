/**
 * Armazenamento privado de assinaturas (Parte 2 da auditoria).
 *
 * HISTÓRICO: a assinatura manuscrita do responsável era gravada em disco
 * (`SIGNATURES_DIR`) e servida por `GET /api/authorizations/:id/signature`
 * SEM autenticação — qualquer pessoa com o id (previsível: `auth-<timestamp>-<hex>`)
 * baixava a assinatura de um pai/mãe. Além disso, em hospedagem estática o
 * arquivo se perdia.
 *
 * AGORA:
 *  - bucket `signatures` PRIVADO no Supabase Storage;
 *  - upload/leitura pelo backend com a chave de serviço;
 *  - download por URL assinada de curta duração (5 min), emitida só depois de
 *    validar quem está pedindo;
 *  - fallback em disco apenas quando o Storage não está configurado, e nesse
 *    caso o endpoint de leitura passa a exigir autenticação e autorização.
 */
import { getSaasAdminClient, isSaasBackendConfigured } from "./saasStore.ts";

export const SIGNATURE_BUCKET = "signatures";
export const SIGNED_URL_TTL_SECONDS = 300;

export interface UploadResult {
  ok: boolean;
  storage: "supabase" | "none";
  path: string | null;
  error: string | null;
}

function decodeDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  try {
    return { contentType: match[1], buffer: Buffer.from(match[2], "base64") };
  } catch {
    return null;
  }
}

/** Envia a assinatura para o bucket privado. */
export async function uploadSignature(input: {
  authorizationId: string;
  dataUrl: string;
}): Promise<UploadResult> {
  if (!isSaasBackendConfigured()) {
    return { ok: false, storage: "none", path: null, error: "Storage não configurado." };
  }
  const sb = getSaasAdminClient();
  if (!sb) return { ok: false, storage: "none", path: null, error: "Storage não configurado." };

  const decoded = decodeDataUrl(input.dataUrl);
  if (!decoded) {
    return { ok: false, storage: "none", path: null, error: "Assinatura em formato inválido." };
  }

  // Limite de 2 MB: uma assinatura digitalizada legítima tem poucos KB.
  if (decoded.buffer.length > 2 * 1024 * 1024) {
    return { ok: false, storage: "none", path: null, error: "Assinatura excede 2 MB." };
  }

  const ext = decoded.contentType === "image/jpeg" ? "jpg" : "png";
  const path = `${input.authorizationId}.${ext}`;

  const { error } = await sb.storage
    .from(SIGNATURE_BUCKET)
    .upload(path, decoded.buffer, { contentType: decoded.contentType, upsert: true });

  if (error) {
    console.error("[SignatureStorage] Upload falhou:", error.message);
    return { ok: false, storage: "none", path: null, error: error.message };
  }

  return { ok: true, storage: "supabase", path, error: null };
}

/**
 * Gera URL assinada temporária. Deve ser chamada SOMENTE após a checagem de
 * quem pode ver a assinatura (responsável, dono da autorização ou equipe).
 */
export async function createSignedSignatureUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const sb = getSaasAdminClient();
  if (!sb) return null;

  const { data, error } = await sb.storage
    .from(SIGNATURE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.warn("[SignatureStorage] Falha ao assinar URL:", error?.message);
    return null;
  }
  return data.signedUrl;
}

/** Remove a assinatura (exclusão por LGPD ou cancelamento da autorização). */
export async function deleteSignature(path: string): Promise<boolean> {
  const sb = getSaasAdminClient();
  if (!sb || !path) return false;
  const { error } = await sb.storage.from(SIGNATURE_BUCKET).remove([path]);
  if (error) {
    console.warn("[SignatureStorage] Falha ao remover:", error.message);
    return false;
  }
  return true;
}

/** `true` quando o path aponta para o Storage (e não para o disco local). */
export function isStoragePath(path: string | null | undefined): boolean {
  return !!path && !path.startsWith("/uploads/");
}
