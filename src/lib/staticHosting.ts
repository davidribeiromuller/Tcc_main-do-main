/**
 * Detecção de ambiente de hospedagem estática.
 *
 * O app roda em dois cenários:
 *  1. Express (`server.ts`) — `/api/*` realmente existe.
 *  2. GitHub Pages / Vercel estático — `/api/*` NÃO existe.
 *
 * No cenário 2, o servidor estático devolve `index.html` (o fallback de SPA via
 * `404.html`) com **status 200** para qualquer rota desconhecida. Isso engana
 * `fetch`: `res.ok` é `true`, mas o corpo é HTML, não JSON.
 *
 * Sem essa checagem o app exibia "Este e-mail já está cadastrado" em cadastros
 * novos e nunca chegava no fallback direto do Supabase.
 */

import { mensagemPrecisaServidor } from "./mensagensServidor.ts";

/**
 * Detecta se estamos servidos por um host estático sem backend Express.
 *
 * Também trata `E2E_OFFLINE_BACKEND` para testes manuais em ambiente local.
 */
export function isStaticHosting(): boolean {
  if (typeof window === "undefined") return false;

  try {
    // Override manual para simular o comportamento de produção localmente.
    if (window.localStorage?.getItem("ELOESCOLA_FORCE_STATIC") === "1") {
      return true;
    }
  } catch (_) {
    /* localStorage indisponível (modo privado) — segue a heurística. */
  }

  const host = window.location.hostname || "";
  return (
    host.endsWith("github.io") ||
    host.endsWith("pages.dev") ||
    host.endsWith("netlify.app") ||
    host.endsWith("vercel.app") ||
    host.endsWith("web.app") ||
    host.endsWith("surge.sh")
  );
}

/**
 * Executa um `fetch` para uma rota `/api/...` apenas quando há backend.
 *
 * Em hospedagem estática devolve `null` imediatamente, sem nem tocar na rede —
 * evitando o HTML-200 do fallback de SPA. Em qualquer outro ambiente devolve a
 * resposta se for JSON; se vier HTML (servidor sem a rota), também devolve `null`
 * para o chamador seguir o caminho alternativo.
 */
export async function fetchJsonApi(
  input: string,
  init?: RequestInit
): Promise<Response | null> {
  if (isStaticHosting()) return null;

  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (_) {
    return null;
  }

  // Servidor sem a rota (404 proxy/SPA) ou HTML: tratar como indisponível.
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  return res;
}

/**
 * Existe servidor Express atendendo este build?
 *
 * `isStaticHosting()` decide pelo NOME DO HOST (github.io, vercel.app…). Isso é
 * rápido, mas erra nos dois sentidos: um deploy na Vercel COM backend seria
 * tratado como estático, e um host próprio sem backend passaria batido.
 *
 * Esta sonda pergunta de fato ao servidor (`/api/health`) e guarda a resposta
 * por alguns segundos — não queremos um round-trip a cada chamada.
 *
 * Uso principal: decidir se vale a pena tentar consultar o banco pelo navegador.
 * Sem servidor, essa consulta não tem como funcionar: a tabela `users` guarda
 * hashes de senha e é fechada para a chave publicável de propósito (RLS).
 */
let _serverProbe: { at: number; available: boolean } | null = null;
const SERVER_PROBE_TTL_MS = 30_000;

export async function isServerAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // Em hospedagem sabidamente estática nem perde tempo na rede.
  if (isStaticHosting()) return false;

  const agora = Date.now();
  if (_serverProbe && agora - _serverProbe.at < SERVER_PROBE_TTL_MS) {
    return _serverProbe.available;
  }

  let available = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch("/api/health", {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const contentType = res.headers.get("content-type") || "";
    available = res.ok && contentType.includes("application/json");
  } catch {
    available = false;
  }

  _serverProbe = { at: agora, available };
  return available;
}

/** Esquece o resultado da sonda (chamado depois de um erro de rede). */
export function invalidateServerProbe(): void {
  _serverProbe = null;
}

/**
 * Chave onde o App guarda o token de sessão (`elo1.<payload>.<hmac>`).
 * Mantida aqui para que nenhum componente precise repetir a string.
 */
export const SESSION_TOKEN_STORAGE_KEY = "elo_session_token";

/** Lê o token de sessão do armazenamento local (ou `null`). */
export function getStoredSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage?.getItem(SESSION_TOKEN_STORAGE_KEY) || null;
  } catch (_) {
    return null;
  }
}

/**
 * `fetchJsonApi` + `Authorization: Bearer <token>`.
 *
 * Usado nas rotas que passaram a exigir sessão na Parte 2 da auditoria
 * (autorizações de menores, arquivamento de eventos). Sem o cabeçalho o
 * servidor responde 401 — e a tela mostraria "nenhum registro" como se não
 * houvesse dado, escondendo o problema.
 *
 * Se não houver token, a função devolve `null` (mesmo contrato do
 * `fetchJsonApi`): o chamador segue para o estado vazio.
 */
export async function fetchJsonApiWithAuth(
  input: string,
  init?: RequestInit
): Promise<Response | null> {
  const token = getStoredSessionToken();
  if (!token) return null;
  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  return fetchJsonApi(input, { ...init, headers });
}

/**
 * Traduz uma resposta de erro da API em mensagem para a tela.
 *
 * Regra que vale para todo o app: **nunca** transformar falha de infraestrutura
 * em "nenhum registro". Lista vazia por erro é indistinguível de lista vazia
 * real, e foi exatamente isso que fez o painel administrativo parecer vazio.
 */
export async function mensagemDeErroDaApi(
  res: Response | null,
  padrao: string
): Promise<string> {
  if (!res) {
    return (
      "Esta função não está disponível na versão publicada do eloEscola. " +
      "Ela grava dados, e o site publicado só consegue ler."
    );
  }

  let corpo: any = null;
  try {
    corpo = await res.clone().json();
  } catch {
    /* corpo não-JSON (HTML de SPA, proxy, etc.) */
  }

  if (corpo?.code === "SAAS_NOT_CONFIGURED") {
    return corpusMensagem(corpo) || "O servidor está sem SUPABASE_SECRET_KEY: configure para usar esta função.";
  }
  if (corpo?.code === "SAAS_UNREACHABLE") {
    return corpusMensagem(corpo) || "O banco de dados não respondeu. Verifique se o Supabase está ativo e acessível.";
  }
  if (corpo?.error) return String(corpo.error);

  if (res.status === 401) return "Sua sessão expirou. Entre novamente.";
  if (res.status === 403) return "Ação restrita ao Administrador Chefe da instituição.";
  if (res.status === 503) return "Serviço indisponível no momento. Tente novamente em instantes.";
  return padrao;
}

function corpusMensagem(corpo: any): string {
  return typeof corpo?.error === "string" ? corpo.error : "";
}
