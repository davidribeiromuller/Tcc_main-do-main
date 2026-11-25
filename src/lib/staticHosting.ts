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
  /*
    RODADA 42 — não rejeitar pelo NOME do host.

    Antes: `if (isStaticHosting()) return null;` em primeira linha. Isso
    derrubava TODA chamada de API só porque o domínio era github.io/netlify/
    vercel — inclusive quando havia um servidor real servindo `/api` ali. O
    resultado prático era o app inteiro em "somente leitura" mesmo com backend
    funcionando, que é exatamente a queixa do autor do TCC.

    Agora medimos: a requisição é feita e:
      · JSON          → é servidor de verdade, devolve a resposta;
      · HTML/404/erro → não há backend, devolve `null` (o chamador segue o
                        caminho alternativo, sem quebrar).
    A checagem de conteúdo já existia logo abaixo e é suficiente — ela reprova
    o HTML-200 do fallback de SPA sem depender do domínio.
  */
    if (isStaticHosting() && window.localStorage?.getItem("ELOESCOLA_FORCE_STATIC") === "1") {
      // Override manual preservado: serve para reproduzir o modo estático em
      // qualquer host durante testes.
      return null;
    }

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
