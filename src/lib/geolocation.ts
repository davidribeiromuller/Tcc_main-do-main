/**
 * Geolocalização do usuário — regra única do app.
 *
 * Antes esta lógica estava espalhada e divergente entre `App.tsx`,
 * `EventDetail.tsx`, `MapView.tsx` e `EventLocationModal.tsx`, com três
 * consequências ruins:
 *
 *  1. Havia botões "Usar Centro de Araucária (Padrão)" que gravavam um ponto
 *     fixo no centro da cidade como se fosse a posição do cliente. Rotas e
 *     distâncias passavam a sair de um lugar onde a pessoa não estava.
 *  2. O `App.tsx` restaurava `user_geolocation_coords` do localStorage **sem
 *     checar a idade**, enquanto o `EventDetail` checava. Abrir o app em outro
 *     lugar mantinha a coordenada de ontem como se fosse a atual — o que
 *     aparece como "posição aleatória".
 *  3. Cada tela usava timeouts diferentes, então uma funcionava e a outra não.
 *
 * Regra aqui: a posição do usuário só pode vir do GPS. Se não for possível
 * obter, devolvemos `null` e uma mensagem honesta — nunca um ponto inventado.
 */

/** Chave do localStorage onde a posição é guardada. */
export const GEOLOCATION_STORAGE_KEY = "user_geolocation_coords";

/**
 * Idade máxima aceitável de uma posição salva.
 *
 * 10 minutos: tempo suficiente para não pedir GPS a cada navegação, e curto o
 * bastante para não usar a coordenada de um lugar onde a pessoa já não está.
 */
export const GEOLOCATION_MAX_AGE_MS = 10 * 60 * 1000;

/** Tempo máximo esperando o GPS de alta precisão. */
export const GEOLOCATION_TIMEOUT_MS = 15000;

export type UserCoords = { lat: number; lng: number };

export type GeolocationFailureReason = "unsupported" | "denied" | "unavailable" | "timeout";

export type GeolocationSuccess = { ok: true; coords: UserCoords; approximate: boolean };
export type GeolocationFailure = {
  ok: false;
  reason: GeolocationFailureReason;
  message: string;
};
export type GeolocationResult = GeolocationSuccess | GeolocationFailure;

/**
 * Type guard explícito.
 *
 * O `tsconfig` do projeto não liga `strict`, e sem isso o TypeScript não
 * estreita a união ao testar `if (!resultado.ok)`. Com o guard a checagem fica
 * explícita e funciona em qualquer configuração.
 */
export function geolocationFalhou(r: GeolocationResult): r is GeolocationFailure {
  return r.ok === false;
}

const MENSAGENS: Record<GeolocationFailureReason, string> = {
  unsupported:
    "Este navegador não oferece suporte a geolocalização. Abra o app em um navegador atualizado para ver a rota a partir do seu local.",
  denied:
    "Permissão de localização negada. Autorize o acesso nas configurações do navegador para calcular a rota a partir de onde você está.",
  unavailable:
    "Não foi possível determinar sua localização agora. Verifique se o GPS está ligado e tente novamente em um local aberto.",
  timeout:
    "O GPS demorou demais para responder. Tente novamente com o sinal melhor — não vamos usar um local aproximado.",
};

/** Converte o código do erro de geolocalização no nosso motivo interno. */
function motivoDoErro(code: number): GeolocationFailureReason {
  if (code === 1) return "denied";
  if (code === 3) return "timeout";
  return "unavailable";
}

/**
 * Lê a posição salva, **descartando** o que estiver vencido, malformado ou sem
 * carimbo de tempo.
 *
 * O bug original: `<App>` aceitava qualquer JSON com `lat`/`lng` numéricos, sem
 * olhar `ts`. Uma posição de dias atrás era tratada como atual.
 */
export function readSavedCoords(now: number = Date.now()): UserCoords | null {
  if (typeof localStorage === "undefined") return null;

  try {
    const bruto = localStorage.getItem(GEOLOCATION_STORAGE_KEY);
    if (!bruto) return null;

    const parsed = JSON.parse(bruto);
    if (typeof parsed?.lat !== "number" || typeof parsed?.lng !== "number") {
      localStorage.removeItem(GEOLOCATION_STORAGE_KEY);
      return null;
    }
    if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) {
      localStorage.removeItem(GEOLOCATION_STORAGE_KEY);
      return null;
    }

    // Sem `ts` não dá para saber a idade: descartar é mais seguro do que
    // arriscar traçar rota a partir de um ponto desconhecido.
    const idade = parsed.ts ? now - Number(parsed.ts) : Infinity;
    if (!Number.isFinite(idade) || idade < 0 || idade > GEOLOCATION_MAX_AGE_MS) {
      localStorage.removeItem(GEOLOCATION_STORAGE_KEY);
      return null;
    }

    return { lat: parsed.lat, lng: parsed.lng };
  } catch {
    return null;
  }
}

/** Guarda a posição com carimbo de tempo. */
export function saveCoords(coords: UserCoords, now: number = Date.now()): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      GEOLOCATION_STORAGE_KEY,
      JSON.stringify({ lat: coords.lat, lng: coords.lng, ts: now })
    );
  } catch {
    /* modo privado / cota cheia — seguir sem persistir */
  }
}

/** Apaga a posição salva (usado quando o usuário nega a permissão). */
export function clearSavedCoords(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(GEOLOCATION_STORAGE_KEY);
  } catch {
    /* ignorar */
  }
}

/** Promessa em volta de `getCurrentPosition`. */
function pedirPosicao(
  opcoes: PositionOptions
): Promise<GeolocationResult> {
  return new Promise<GeolocationResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          ok: true,
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          approximate: !opcoes.enableHighAccuracy,
        }),
      (err) => resolve({ ok: false, reason: motivoDoErro(err.code), message: MENSAGENS[motivoDoErro(err.code)] }),
      opcoes
    );
  });
}

/**
 * Obtém a posição real do usuário.
 *
 * Tenta alta precisão primeiro. Se falhar por sinal/tempo (não por permissão
 * negada), tenta uma segunda vez com precisão menor — mas com
 * `maximumAge: 0`, ou seja, **sem reaproveitar** uma leitura antiga do cache do
 * navegador (o código anterior usava `maximumAge: 30000`, que podia devolver uma
 * posição de 30 segundos atrás em outro lugar).
 */
export async function requestCurrentCoords(): Promise<GeolocationResult> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return { ok: false, reason: "unsupported", message: MENSAGENS.unsupported };
  }

  const alta = await pedirPosicao({
    enableHighAccuracy: true,
    timeout: GEOLOCATION_TIMEOUT_MS,
    maximumAge: 0,
  });

  if (!geolocationFalhou(alta)) return alta;

  // Permissão negada: insistir não adianta, o navegador não vai pedir de novo.
  if (alta.reason === "denied") return alta;

  const baixa = await pedirPosicao({
    enableHighAccuracy: false,
    timeout: GEOLOCATION_TIMEOUT_MS,
    maximumAge: 0,
  });

  if (!geolocationFalhou(baixa)) return baixa;

  // Devolve o erro mais informativo: se a primeira tentativa estourou o tempo,
  // isso descreve melhor o problema do que a segunda falha.
  return alta.reason === "timeout" ? alta : baixa;
}
