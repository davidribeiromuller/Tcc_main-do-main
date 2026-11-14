/**
 * Acessibilidade por voz — leitura de tela e comandos de fala.
 *
 * ## O que este módulo resolve
 *
 * O Assistente Elo só funcionava por texto. Para quem tem dificuldade de
 * leitura, de visão ou de digitação, isso deixava o app inteiro inacessível —
 * inclusive as configurações. Aqui ficam as três peças que faltavam:
 *
 * 1. **Falar** (`speechSynthesis`): ler a resposta em voz alta, com controle
 *    de pausa e velocidade.
 * 2. **Ouvir** (`SpeechRecognition`): transformar fala em texto, sempre com
 *    permissão explícita do usuário e indicador visível de escuta.
 * 3. **Agir**: interpretar a instrução (falada ou escrita) como uma ação no
 *    app — trocar tema, navegar, preencher o formulário de evento.
 *
 * ## Decisões que valem explicar
 *
 * - **Nada é dito em voz alta sem o usuário pedir.** O módulo não liga o
 *   sintetizador sozinho: quem decide é o botão "Ouvir".
 * - **O microfone só liga por gesto.** `iniciarEscuta` precisa ser chamado a
 *   partir de um clique — navegadores exigem isso e é o comportamento correto
 *   (o usuário vê que está sendo ouvido).
 * - **Ações que gravam dados nunca executam direto.** Elas são devolvidas como
 *   `requerConfirmacao`, e o assistente pergunta antes. Isso mantém a regra do
 *   projeto: nada é publicado sem aprovação humana.
 * - **Compatibilidade.** `SpeechRecognition` só existe em navegadores baseados
 *   em Chromium e no Safari recente. Quando falta, `escutaDisponivel()` diz
 *   não e a interface esconde o microfone em vez de quebrar.
 */

// ============================================================
// Tipos mínimos das APIs do navegador
// ============================================================
//
// O TypeScript não traz `SpeechRecognition` no lib.dom padrão, então
// declaramos só o que usamos. Assim evitamos `any` espalhado no componente.

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function obterConstrutorEscuta(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionCtor | null;
}

/** `true` se o navegador consegue reconhecer fala. */
export function escutaDisponivel(): boolean {
  return obterConstrutorEscuta() !== null;
}

/** `true` se o navegador consegue falar. */
export function falaDisponivel(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// ============================================================
// 1. Falar
// ============================================================

/**
 * Limpa marcações Markdown antes de falar.
 *
 * O assistente responde em Markdown (`**negrito**`, listas com `- `, emojis).
 * Lido ao pé da letra, o sintetizador fala "asterisco asterisco" e "hífen" —
 * inutiliza a leitura.
 */
export function limparParaFala(texto: string): string {
  return (texto || "")
    // emojis e símbolos decorativos
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/gu, " ")
    .replace(/\*\*(.*?)\*\*/g, "$1")       // negrito
    .replace(/\*(.*?)\*/g, "$1")           // itálico
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1") // código
    .replace(/^\s*[-*•]\s+/gm, ", ")       // marcadores de lista
    .replace(/^\s*\d+\.\s+/gm, ", ")       // listas numeradas
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")    // links
    .replace(/[#_>|]/g, " ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ". ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export interface OpcoesFala {
  /** Velocidade: 0.5 (lento) a 2 (rápido). Padrão 1. */
  rate?: number;
  /** Tom: 0 a 2. Padrão 1. */
  pitch?: number;
  /** Idioma. Padrão pt-BR. */
  lang?: string;
  /** Chamado ao terminar (ou ao ser cancelado). */
  onFim?: () => void;
}

/**
 * Fala um texto em voz alta.
 *
 * Cancela qualquer fala anterior: empilhar respostas deixa o usuário ouvindo
 * mensagens antigas enquanto tenta entender a nova.
 */
export function falar(texto: string, opcoes: OpcoesFala = {}): boolean {
  if (!falaDisponivel()) return false;

  const limpo = limparParaFala(texto);
  if (!limpo) return false;

  try {
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(limpo);
    utter.lang = opcoes.lang ?? "pt-BR";
    utter.rate = Math.min(Math.max(opcoes.rate ?? 1, 0.5), 2);
    utter.pitch = Math.min(Math.max(opcoes.pitch ?? 1, 0), 2);
    utter.onend = () => opcoes.onFim?.();
    utter.onerror = () => opcoes.onFim?.();

    // Prefere uma voz pt-BR instalada; se não houver, o navegador usa o padrão.
    const vozes = window.speechSynthesis.getVoices?.() ?? [];
    const ptBr = vozes.find((v) => /pt[-_]BR/i.test(v.lang)) ?? vozes.find((v) => /^pt/i.test(v.lang));
    if (ptBr) utter.voice = ptBr;

    window.speechSynthesis.speak(utter);
    return true;
  } catch {
    return false;
  }
}

/** Interrompe qualquer leitura em andamento. */
export function pararFala(): void {
  if (!falaDisponivel()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* silencioso: alguns navegadores reclamam se não houver fala ativa */
  }
}

/** `true` enquanto o sintetizador está falando. */
export function estaFalando(): boolean {
  if (!falaDisponivel()) return false;
  try {
    return window.speechSynthesis.speaking;
  } catch {
    return false;
  }
}

// ============================================================
// 2. Ouvir
// ============================================================

export interface OpcoesEscuta {
  /** Texto parcial reconhecido enquanto o usuário fala. */
  onParcial?: (texto: string) => void;
  /** Texto final (fim da frase). */
  onFinal: (texto: string) => void;
  /** Erro de reconhecimento, já traduzido para linguagem de gente. */
  onErro?: (mensagem: string, tipo: ErroEscuta) => void;
  /** Chamado quando a escuta termina, por qualquer motivo. */
  onFim?: () => void;
  /** Idioma. Padrão pt-BR. */
  lang?: string;
}

export type ErroEscuta =
  | "permissao_negada"
  | "sem_microfone"
  | "sem_rede"
  | "nao_entendi"
  | "indisponivel"
  | "desconhecido";

/** Traduz o código de erro do navegador para uma mensagem acionável. */
function traduzirErro(codigo: string): { mensagem: string; tipo: ErroEscuta } {
  switch (codigo) {
    case "not-allowed":
    case "service-not-allowed":
      return {
        tipo: "permissao_negada",
        mensagem:
          "O microfone está bloqueado. Clique no ícone de cadeado na barra de endereço, permita o microfone e tente de novo.",
      };
    case "audio-capture":
      return {
        tipo: "sem_microfone",
        mensagem: "Não encontrei um microfone. Verifique se ele está conectado.",
      };
    case "network":
      return {
        tipo: "sem_rede",
        mensagem: "O reconhecimento de voz precisa de internet e a conexão falhou.",
      };
    case "no-speech":
      return {
        tipo: "nao_entendi",
        mensagem: "Não ouvi nada. Toque no microfone e fale mais perto.",
      };
    case "aborted":
      return { tipo: "desconhecido", mensagem: "Escuta cancelada." };
    default:
      return {
        tipo: "desconhecido",
        mensagem: `Não foi possível usar o microfone (${codigo}).`,
      };
  }
}

/**
 * Inicia a escuta do microfone.
 *
 * Devolve uma função para parar. Retorna `null` quando o navegador não suporta.
 *
 * IMPORTANTE: chame a partir de um clique. Além de exigência dos navegadores,
 * é o que garante que o usuário saiba que está sendo ouvido.
 */
export function iniciarEscuta(opcoes: OpcoesEscuta): (() => void) | null {
  const Ctor = obterConstrutorEscuta();
  if (!Ctor) {
    opcoes.onErro?.(
      "Este navegador não reconhece voz. Você pode digitar normalmente — ou usar Chrome, Edge ou Safari.",
      "indisponivel"
    );
    return null;
  }

  let reconhecimento: SpeechRecognitionLike | null = null;
  let finalizado = false;

  const encerrar = () => {
    if (finalizado) return;
    finalizado = true;
    try {
      reconhecimento?.stop();
    } catch {
      /* já parado */
    }
    opcoes.onFim?.();
  };

  try {
    reconhecimento = new Ctor();
    reconhecimento.lang = opcoes.lang ?? "pt-BR";
    // `continuous: false` encerra na primeira pausa — evita gravar ambiente
    // por tempo indeterminado, o que é ruim em privacidade e em precisão.
    reconhecimento.continuous = false;
    reconhecimento.interimResults = true;
    reconhecimento.maxAlternatives = 1;

    reconhecimento.onresult = (evento) => {
      let parcial = "";
      let final = "";
      for (let i = evento.resultIndex; i < evento.results.length; i++) {
        const resultado = evento.results[i];
        const texto = resultado[0]?.transcript ?? "";
        if (resultado.isFinal) final += texto;
        else parcial += texto;
      }
      if (parcial) opcoes.onParcial?.(parcial.trim());
      if (final.trim()) {
        opcoes.onFinal(final.trim());
        encerrar();
      }
    };

    reconhecimento.onerror = (evento) => {
      const { mensagem, tipo } = traduzirErro(evento.error);
      opcoes.onErro?.(mensagem, tipo);
      encerrar();
    };

    reconhecimento.onend = () => encerrar();

    reconhecimento.start();

    return () => {
      try {
        reconhecimento?.abort();
      } catch {
        /* silencioso */
      }
      encerrar();
    };
  } catch (err: any) {
    // `start()` falha se já houver escuta ativa em outro lugar da página.
    opcoes.onErro?.(
      err?.message?.includes("already started")
        ? "Já estou ouvindo. Fale ou aguarde alguns segundos."
        : "Não foi possível ligar o microfone agora.",
      "desconhecido"
    );
    return null;
  }
}
