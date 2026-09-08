/**
 * Utilitário de Resiliência de API e Sincronização de Estado
 * Garante consistência entre a interface e o banco de dados (Supabase / Backend)
 */

export interface RequestOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
  retryOnStatus?: number[];
  timeoutMs?: number;
}

/**
 * Executa fetch com retentativas automáticas em caso de falhas de conexão ou 5xx
 */
export async function resilientFetch(
  url: string,
  options: RequestOptions = {}
): Promise<Response> {
  const {
    retries = 2,
    retryDelay = 800,
    retryOnStatus = [500, 502, 503, 504],
    timeoutMs = 12000,
    ...fetchOptions
  } = options;

  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Se for um status temporário de erro do servidor e ainda temos tentativas
      if (retryOnStatus.includes(response.status) && attempt < retries) {
        const waitTime = retryDelay * Math.pow(1.5, attempt);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      return response;
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;

      // Se ainda houver tentativas e for erro de rede / timeout
      if (attempt < retries) {
        const waitTime = retryDelay * Math.pow(1.5, attempt);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError || new Error(`Falha de conexão ao acessar ${url}`);
}

/**
 * Hook ou listener para detectar reconexão com a internet e re-sincronizar dados automaticamente
 */
export function setupNetworkAutoRecovery(onReconnected: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleOnline = () => {
    console.log("[Resilience] Conexão restabelecida. Atualizando dados automaticamente com o servidor...");
    onReconnected();
  };

  window.addEventListener("online", handleOnline);
  return () => {
    window.removeEventListener("online", handleOnline);
  };
}

/**
 * Verifica se é seguro recarregar a página (evita perda de formulários preenchidos)
 * e executa recarregamento controlado com proteção contra loops infinitos.
 */
export function safeAppReload(reason: string = "recuperação de estado"): boolean {
  if (typeof window === "undefined") return false;

  // Verifica se há inputs preenchidos na página para NÃO recarregar se o usuário estiver digitando
  const activeInputs = document.querySelectorAll("input, textarea");
  let hasUserDraft = false;
  activeInputs.forEach((el) => {
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    if (input.type !== "hidden" && input.type !== "checkbox" && input.type !== "radio") {
      if (input.value && input.value.trim().length > 0) {
        hasUserDraft = true;
      }
    }
  });

  if (hasUserDraft) {
    console.warn("[Resilience] Recarregamento evitado para proteger dados que estão sendo preenchidos pelo usuário.");
    return false;
  }

  // Previne loops de reload através de sessionStorage
  const reloadKey = "app_auto_recovery_reloaded_at";
  const lastReload = sessionStorage.getItem(reloadKey);
  const now = Date.now();
  if (lastReload && now - parseInt(lastReload, 10) < 30000) {
    console.warn("[Resilience] Recarregamento de página já tentado nos últimos 30s. Mantendo interface estável.");
    return false;
  }

  sessionStorage.setItem(reloadKey, now.toString());
  console.log(`[Resilience] Recarregando aplicação de forma segura para ${reason}...`);
  window.location.reload();
  return true;
}

