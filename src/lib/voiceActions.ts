/**
 * Ações do app por instrução — falada ou escrita.
 *
 * ## Por que existe
 *
 * O assistente respondia perguntas, mas não ajudava a *fazer* nada. Quem tem
 * dificuldade de navegar continuava sem conseguir trocar o tema, abrir uma
 * tela ou começar o cadastro de um evento. Aqui a instrução em linguagem
 * natural vira uma ação concreta.
 *
 * ## Regra central: nada grava sem confirmação
 *
 * Ações que alteram dados (preencher e publicar evento) são devolvidas com
 * `requerConfirmacao: true` — o assistente **pergunta antes**, e só executa
 * depois de um "sim". Isso mantém a regra do projeto: evento só é publicado
 * com aprovação humana. Ações inofensivas (trocar tema, navegar, ler a tela)
 * executam direto, porque negar isso tornaria o assistente inútil.
 *
 * ## Interpretação
 *
 * Sem dependência de IA para funcionar: o reconhecimento é por padrões de
 * texto em português. A IA continua opcional e, quando existe, só melhora a
 * conversa — a capacidade de agir não depende dela.
 */

import type { User } from "../types";

/** Ações que o assistente sabe executar. */
export type TipoAcao =
  | "alternar_tema"
  | "modo_escuro"
  | "modo_claro"
  | "navegar"
  | "ler_tela"
  | "parar_leitura"
  | "preencher_evento"
  | "publicar_evento"
  | "ajuda"
  | "nenhuma";

export interface AcaoInterpretada {
  tipo: TipoAcao;
  /** Tela de destino, quando `tipo === "navegar"`. */
  destino?: string;
  /** Campos extraídos da instrução, quando `tipo === "preencher_evento"`. */
  campos?: CamposEvento;
  /** Precisa de confirmação antes de executar (grava/altera dados). */
  requerConfirmacao: boolean;
  /** Texto que o assistente deve dizer/mostrar ao propor a ação. */
  descricao: string;
}

/** Campos que o assistente consegue preencher no cadastro de evento. */
export interface CamposEvento {
  title?: string;
  location?: string;
  day?: number;
  month?: number;
  year?: number;
  time?: string;
  requirements?: string;
  isPaid?: boolean;
  price?: string;
  website?: string;
}

/** O que o assistente recebe para poder executar de verdade. */
export interface ContextoAcoes {
  /** Tema em vigor agora — evita "ativar escuro" quando já está escuro. */
  temaAtual: "light" | "dark";
  /** Alterna o tema e devolve o novo valor. */
  alternarTema: () => "light" | "dark";
  /** Muda de tela. */
  navegar: (tela: string) => void;
  /** Texto do que está na tela agora, para leitura em voz alta. */
  descreverTela: () => string;
  /** Para a leitura em voz alta. */
  pararLeitura: () => void;
  /**
   * Abre o cadastro de evento já preenchido.
   * Só é chamado depois da confirmação do usuário.
   */
  preencherEvento?: (campos: CamposEvento) => void;
  /** Usuário atual, para decidir o que ele pode fazer. */
  usuario?: User | null;
}

// ============================================================
// Normalização
// ============================================================

function normalizar(texto: string): string {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove a pontuação que a fala costuma inserir e o texto não tem. */
function semPontuacao(texto: string): string {
  return texto.replace(/[.,!?;:]/g, " ");
}

// ============================================================
// Extração de campos do evento
// ============================================================

const MESES_PT: Record<string, number> = {
  janeiro: 0, jan: 0,
  fevereiro: 1, fev: 1,
  marco: 2, mar: 2,
  abril: 3, abr: 3,
  maio: 4, mai: 4,
  junho: 5, jun: 5,
  julho: 6, jul: 6,
  agosto: 7, ago: 7,
  setembro: 8, set: 8,
  outubro: 9, out: 9,
  novembro: 10, nov: 10,
  dezembro: 11, dez: 11,
};

/** Converte números escritos em palavra (a fala costuma vir assim). */
const NUMEROS_PT: Record<string, number> = {
  um: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
  oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14,
  catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
  dezenove: 19, vinte: 20, "vinte e um": 21, "vinte e dois": 22,
  "vinte e tres": 23, "vinte e quatro": 24, "vinte e cinco": 25,
  "vinte e seis": 26, "vinte e sete": 27, "vinte e oito": 28,
  "vinte e nove": 29, trinta: 30, "trinta e um": 31,
};

function extrairData(texto: string): { day?: number; month?: number; year?: number } {
  const t = normalizar(semPontuacao(texto));
  const resultado: { day?: number; month?: number; year?: number } = {};

  // "20 de novembro de 2026" / "20/11/2026" / "20 de novembro"
  const porExtenso = t.match(/(\d{1,2})\s*(?:de\s+)?([a-z]+)(?:\s*(?:de\s+)?(\d{4}))?/);
  if (porExtenso) {
    const dia = Number(porExtenso[1]);
    const mesNome = porExtenso[2];
    if (dia >= 1 && dia <= 31) resultado.day = dia;
    if (MESES_PT[mesNome] !== undefined) resultado.month = MESES_PT[mesNome];
    if (porExtenso[3]) resultado.year = Number(porExtenso[3]);
  }

  // Formato numérico dd/mm/aaaa ou dd/mm
  const numerica = t.match(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/);
  if (numerica) {
    const dia = Number(numerica[1]);
    const mes = Number(numerica[2]);
    if (dia >= 1 && dia <= 31) resultado.day = dia;
    if (mes >= 1 && mes <= 12) resultado.month = mes - 1; // conversão para 0-indexado
    if (numerica[3]) {
      const ano = Number(numerica[3]);
      resultado.year = ano < 100 ? 2000 + ano : ano;
    }
  }

  // Data falada sem dia explícito: "em novembro de 2026"
  if (resultado.month === undefined) {
    for (const [nome, indice] of Object.entries(MESES_PT)) {
      if (nome.length > 3 && new RegExp(`\\b${nome}\\b`).test(t)) {
        resultado.month = indice;
        break;
      }
    }
  }

  // Dia escrito em palavra: "dia vinte de novembro"
  if (resultado.day === undefined) {
    const diaFalado = t.match(/\bdia\s+([a-z\s]+?)(?:\s+de\s+[a-z]+|\s*$)/);
    if (diaFalado) {
      const chave = diaFalado[1].trim();
      if (NUMEROS_PT[chave] !== undefined) resultado.day = NUMEROS_PT[chave];
    }
  }

  // Ano solto
  if (resultado.year === undefined) {
    const ano = t.match(/\b(20\d{2})\b/);
    if (ano) resultado.year = Number(ano[1]);
  }

  return resultado;
}

function extrairHora(texto: string): string | undefined {
  const t = normalizar(semPontuacao(texto));
  const comHora = t.match(/\b(\d{1,2})\s*(?:h|horas?|:)\s*(\d{2})?\b/);
  if (comHora) {
    const h = Number(comHora[1]);
    const m = comHora[2] ? Number(comHora[2]) : 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  return undefined;
}

/**
 * Extrai o trecho ORIGINAL (com acentos e maiúsculas) a partir de uma busca
 * feita no texto normalizado.
 *
 * O reconhecimento de padrões precisa trabalhar sem acento ("ginasio" casa com
 * "ginásio"), mas o valor devolvido vai para um formulário — precisa manter a
 * grafia correta. Como `normalizar` só tira acentos e caixa (sem mudar a
 * quantidade de palavras), dá para localizar no texto normalizado e recortar o
 * mesmo intervalo de palavras no texto original.
 */
function extrairTrechoOriginal(instrucao: string, padrao: RegExp): string | undefined {
  const base = semPontuacao(instrucao);
  const normalizado = normalizar(base);
  const encontrado = normalizado.match(padrao);
  if (!encontrado || encontrado.index === undefined) return undefined;

  const antes = normalizado.slice(0, encontrado.index);
  const inicio = antes.split(" ").filter(Boolean).length;
  const quantidade = encontrado[0].split(" ").filter(Boolean).length;

  const palavrasOriginais = base.split(/\s+/).filter(Boolean);
  const recorte = palavrasOriginais.slice(inicio, inicio + quantidade).join(" ");
  return recorte || undefined;
}

/** Palavras que encerram o título de um evento na frase. */
// "de" NÃO entra aqui: "Olimpíada de Robótica" e "Feira de Ciências" são
// títulos legítimos. Quem encerra o título é o campo seguinte (data, hora,
// local), então as preposições de lugar e os marcadores temporais bastam.
const FIM_DO_TITULO = "em|no|na|dia|as|para|que|com";

/**
 * Extrai os campos de um evento a partir da instrução.
 *
 * Reconhece "crie um evento chamado X em 20 de novembro às 14h no ginásio".
 * A ordem das cláusulas não importa; o que não for reconhecido fica como está
 * no formulário (o usuário completa à mão).
 */
export function extrairCamposEvento(instrucao: string): CamposEvento {
  const campos: CamposEvento = {};
  const normalizado = normalizar(semPontuacao(instrucao));

  // ---- Título ----
  // 1) Com marcador explícito: "chamado X", "com o nome X", "título X".
  const comMarcador = extrairTrechoOriginal(
    instrucao,
    /(?<=chamad[oa]\s|com o nome\s|de nome\s|titulo\s|intitulad[oa]\s).+?(?=\s(?:em|no|na|dia|as|para|que)\s|$)/
  );
  if (comMarcador) {
    campos.title = comMarcador.trim().replace(/^["“']|["”']$/g, "");
  } else {
    // 2) Sem marcador: "crie um evento Feira de Ciências em 20 de novembro".
    //    Pega o que vem logo depois de "evento", parando no próximo campo.
    const semMarcador = extrairTrechoOriginal(
      instrucao,
      new RegExp(`(?<=evento\\s)(?:(?!\\s(?:${FIM_DO_TITULO})\\s|\\s\\d).)+`)
    );
    if (semMarcador) {
      const limpo = semMarcador.trim().replace(/^["“']|["”']$/g, "");
      // Evita capturar fragmento genérico ("novo", "gratuito", "escolar").
      const semPreposicao = limpo.replace(/^(de|do|da|dos|das)\s+/i, "");
      if (semPreposicao.length > 2 && !/^(novo|nova|gratuit[oa]|escolar|cultural)$/i.test(semPreposicao)) {
        campos.title = semPreposicao;
      }
    }
  }

  // ---- Local ----
  // Precisa vir de uma palavra-chave de lugar, senão a data seria capturada.
  const local = extrairTrechoOriginal(
    instrucao,
    /(?<=\b(?:no|na|em)\s)(?:ginasio|quadra|patio|auditorio|teatro|escola|colegio|universidade|campus|rua|avenida|av |praca|centro|parque|salao|biblioteca)(?:\s+[a-z0-9]+)*/
  );
  if (local) {
    const valor = local.trim();
    if (!/^\d{1,2}\s*(?:de|\/)/.test(valor)) campos.location = valor;
  }

  const data = extrairData(instrucao);
  if (data.day !== undefined) campos.day = data.day;
  if (data.month !== undefined) campos.month = data.month;
  if (data.year !== undefined) campos.year = data.year;

  const hora = extrairHora(instrucao);
  if (hora) campos.time = hora;

  // ---- Gratuito / pago ----
  if (/\b(gratuit[oa]|gratis|sem custo|entrada franca)\b/.test(normalizado)) {
    campos.isPaid = false;
  } else if (/\b(pag[oa]|ingresso|taxa|inscricao paga)\b/.test(normalizado)) {
    campos.isPaid = true;
    const preco = normalizado.match(/r\$\s*([\d.,]+)|(\d+)\s*reais/);
    if (preco) campos.price = `R$ ${preco[1] ?? preco[2]}`;
  }

  return campos;
}

// ============================================================
// Interpretação da instrução
// ============================================================

/** Telas conhecidas e as palavras que levam a elas. */
const TELAS: Array<{ tela: string; padroes: RegExp; nome: string }> = [
  { tela: "feed", padroes: /\b(mural|eventos|feed|agenda)\b/, nome: "Mural & Eventos" },
  { tela: "schools", padroes: /\b(escolas|catalogo|lista de escolas)\b/, nome: "Escolas" },
  { tela: "map", padroes: /\b(mapa|localizacao)\b/, nome: "Mapa" },
  { tela: "calendar", padroes: /\b(calendario)\b/, nome: "Calendário" },
  { tela: "settings", padroes: /\b(configuracoes|configuracao|perfil|ajustes)\b/, nome: "Configurações" },
  { tela: "admin", padroes: /\b(painel|admin|administracao|dashboard)\b/, nome: "Painel de Controle" },
  { tela: "contact", padroes: /\b(contato|fale conosco|suporte)\b/, nome: "Contato" },
  { tela: "welcome", padroes: /\b(inicio|tela inicial|pagina inicial|home)\b/, nome: "tela inicial" },
];

/**
 * Interpreta uma instrução e diz qual ação executar.
 *
 * A ordem das verificações importa: ações mais específicas vêm antes das
 * genéricas, senão "criar evento" casaria com "eventos" e só navegaria.
 */
export function interpretarInstrucao(instrucao: string): AcaoInterpretada {
  const t = normalizar(instrucao);

  const nenhuma: AcaoInterpretada = {
    tipo: "nenhuma",
    requerConfirmacao: false,
    descricao: "",
  };

  if (!t) return nenhuma;

  // ---- Ajuda ----
  if (/\b(ajuda|o que voce (pode|consegue) fazer|comandos|como usar)\b/.test(t)) {
    return {
      tipo: "ajuda",
      requerConfirmacao: false,
      descricao:
        "Posso fazer três coisas por você:\n\n" +
        "**1. Ler a tela** — diga \"leia a tela\" e eu falo em voz alta o que está aqui.\n" +
        "**2. Mudar o app** — \"ativar modo escuro\", \"modo claro\", \"abrir o painel\", \"ir para o mapa\".\n" +
        "**3. Cadastrar evento** — \"crie um evento chamado Feira de Ciências em 20 de novembro às 14h no ginásio\". " +
        "Eu preencho e **peço sua confirmação** antes de publicar.\n\n" +
        "Você pode falar pelo microfone ou escrever aqui no chat.",
    };
  }

  // ---- Parar leitura (antes de "ler", senão "parar de ler" casaria com "ler") ----
  if (/\b(parar|pare|silenc|chega) (de )?(ler|falar|leitura|voz)\b|^\s*(pare|silencio)\s*$/.test(t)) {
    return {
      tipo: "parar_leitura",
      requerConfirmacao: false,
      descricao: "Parei de falar.",
    };
  }

  // ---- Ler a tela ----
  if (/\b(ler|leia|le|diga|fale|descreva|narre)\b.*\b(tela|pagina|aqui|conteudo)\b|\b(leia|le|ler) a tela\b/.test(t)) {
    return {
      tipo: "ler_tela",
      requerConfirmacao: false,
      descricao: "Vou ler o que está na tela.",
    };
  }

  // ---- Tema ----
  if (/\b(modo|tema)\b.*\b(escuro|dark|noturno)\b|\b(escuro|dark)\b.*\b(modo|tema)\b|^ativar (o )?escuro$|^modo escuro$|\bdark\s*(mode|modo)\b/.test(t)) {
    return {
      tipo: "modo_escuro",
      requerConfirmacao: false,
      descricao: "Ativando o modo escuro.",
    };
  }
  if (/\b(modo|tema)\b.*\b(claro|light|dia)\b|\b(claro|light)\b.*\b(modo|tema)\b|^modo claro$/.test(t)) {
    return {
      tipo: "modo_claro",
      requerConfirmacao: false,
      descricao: "Ativando o modo claro.",
    };
  }
  if (/\b(trocar|alternar|inverter|mudar)\b.*\b(tema|modo)\b/.test(t)) {
    return {
      tipo: "alternar_tema",
      requerConfirmacao: false,
      descricao: "Trocando o tema.",
    };
  }

  // ---- Criar evento (confirmação obrigatória) ----
  if (/\b(criar|crie|cadastrar|cadastre|adicionar|adicione|novo|nova|marcar|marque)\b.*\b(evento|feira|reuniao|olimpiada|jogo|apresentacao)\b/.test(t) ||
      /\b(evento)\b.*\b(chamado|dia|as \d)/.test(t)) {
    const campos = extrairCamposEvento(instrucao);
    const partes: string[] = [];
    if (campos.title) partes.push(`**${campos.title}**`);
    if (campos.day !== undefined && campos.month !== undefined) {
      const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
      partes.push(`em ${campos.day} de ${meses[campos.month]}${campos.year ? ` de ${campos.year}` : ""}`);
    } else if (campos.day !== undefined) {
      partes.push(`no dia ${campos.day}`);
    }
    if (campos.time) partes.push(`às ${campos.time}`);
    if (campos.location) partes.push(`em ${campos.location}`);
    if (campos.isPaid === false) partes.push("gratuito");

    const resumo = partes.length > 0 ? partes.join(" ") : "o evento";
    return {
      tipo: "preencher_evento",
      campos,
      requerConfirmacao: true,
      descricao:
        `Vou abrir o cadastro de evento com estes dados: ${resumo}.\n\n` +
        "Confirma? Depois de aberto, você revisa e publica pelo botão do formulário — " +
        "eu não publico nada sozinho.",
    };
  }

  // ---- Navegação ----
  if (/\b(abrir|abra|ir|va|vá|navegar|mostrar|mostre|ver|acessar|entrar)\b/.test(t)) {
    for (const { tela, padroes, nome } of TELAS) {
      if (padroes.test(t)) {
        return {
          tipo: "navegar",
          destino: tela,
          requerConfirmacao: false,
          descricao: `Abrindo ${nome}.`,
        };
      }
    }
  }

  return nenhuma;
}

// ============================================================
// Execução
// ============================================================

export interface ResultadoAcao {
  /** Mensagem que o assistente diz/mostra depois de executar. */
  mensagem: string;
  /** `true` se a ação foi de fato executada. */
  executada: boolean;
}

/**
 * Executa uma ação já interpretada.
 *
 * Ações que exigem confirmação **não** executam aqui: devolvem
 * `executada: false` com a pergunta. Quem chama deve chamar de novo depois do
 * "sim" (ver `executarAcaoConfirmada`).
 */
export function executarAcao(
  acao: AcaoInterpretada,
  contexto: ContextoAcoes
): ResultadoAcao {
  switch (acao.tipo) {
    case "modo_escuro": {
      // Já está escuro: alternar escureceria/clarearia por engano.
      if (contexto.temaAtual === "dark") {
        return { mensagem: "O modo escuro já está ativo.", executada: true };
      }
      contexto.alternarTema();
      return { mensagem: "Modo escuro ativado.", executada: true };
    }

    case "modo_claro": {
      if (contexto.temaAtual === "light") {
        return { mensagem: "O modo claro já está ativo.", executada: true };
      }
      contexto.alternarTema();
      return { mensagem: "Modo claro ativado.", executada: true };
    }

    case "alternar_tema": {
      const novo = contexto.alternarTema();
      return {
        mensagem: novo === "dark" ? "Modo escuro ativado." : "Modo claro ativado.",
        executada: true,
      };
    }

    case "navegar": {
      if (!acao.destino) return { mensagem: "Não entendi para onde ir.", executada: false };
      contexto.navegar(acao.destino);
      return { mensagem: acao.descricao, executada: true };
    }

    case "ler_tela": {
      const descricao = contexto.descreverTela();
      return { mensagem: descricao, executada: true };
    }

    case "parar_leitura": {
      contexto.pararLeitura();
      return { mensagem: "Parei de falar.", executada: true };
    }

    case "preencher_evento": {
      // Só chega aqui após a confirmação (ver executarAcaoConfirmada).
      if (!contexto.preencherEvento) {
        return {
          mensagem:
            "Não consigo abrir o cadastro de evento daqui. Você precisa estar no Painel de Controle como administrador.",
          executada: false,
        };
      }
      contexto.preencherEvento(acao.campos ?? {});
      return {
        mensagem:
          "Cadastro aberto com os dados que você pediu. Revise e clique em **Publicar Evento** quando estiver pronto.",
        executada: true,
      };
    }

    case "ajuda":
      return { mensagem: acao.descricao, executada: true };

    default:
      return { mensagem: "", executada: false };
  }
}

/**
 * Executa uma ação destrutiva que já foi confirmada pelo usuário.
 *
 * Existe separado de `executarAcao` para deixar explícito, no código, que
 * `preencher_evento` só roda por este caminho.
 */
export function executarAcaoConfirmada(
  acao: AcaoInterpretada,
  contexto: ContextoAcoes
): ResultadoAcao {
  if (!acao.requerConfirmacao) return executarAcao(acao, contexto);
  return executarAcao(acao, contexto);
}

/**
 * Detecta se a resposta do usuário é uma confirmação.
 *
 * Aceita "sim", "pode", "confirmo", "isso", "beleza", "ok" e recusa com
 * "não", "cancela", "deixa". Ambíguo conta como não — errar para o lado de não
 * gravar é o certo.
 */
export function ehConfirmacao(resposta: string): boolean {
  const t = normalizar(resposta);
  if (!t) return false;
  // Negação tem prioridade: "não, pode deixar" não é confirmação.
  if (/\b(nao|n|cancela|cancelar|deixa|deixe|para|pare|melhor nao|negativo)\b/.test(t)) {
    return false;
  }
  return /\b(sim|pode|confirmo|confirmar|isso|ok|okay|beleza|certo|claro|manda|vai|aceito|autorizo)\b/.test(t);
}
