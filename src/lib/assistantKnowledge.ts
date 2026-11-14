/**
 * Repertório do Assistente Elo — respostas locais ampliadas.
 *
 * ## Por que este arquivo existe
 *
 * A conversa do assistente dependia do endpoint `/api/ai/chat` (Express). No
 * GitHub Pages essa rota não existe, então o assistente caía num fallback de
 * **três** assuntos: escolas, eventos e "gratuito". Qualquer outra pergunta
 * — telefone, endereço, como se cadastrar, como confirmar presença, o que é
 * um evento escolar — recebia a mesma resposta genérica.
 *
 * Aqui fica um repertório bem maior, que roda 100% no navegador: sem chave de
 * IA, sem rede, sem custo. A IA (quando configurada) continua sendo usada
 * primeiro e melhora a conversa — mas não é mais pré-requisito para o
 * assistente ser útil.
 *
 * ## Como a escolha funciona
 *
 * Cada tópico tem um `score` (quantas palavras-chave casaram). Ganha o maior;
 * empate fica com o primeiro registrado. A ordem importa: tópicos específicos
 * vêm antes dos genéricos, senão "telefone da escola" casaria com "escola"
 * e devolveria a lista em vez do telefone.
 */

import { ARAUCARIA_SCHOOLS } from "./schoolsData.ts";

/** Normaliza texto para comparação: minúsculas, sem acento, sem pontuação. */
export function normalizarTexto(texto: string): string {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ContextoResposta {
  /** Eventos atuais, para falar de agenda real. */
  eventos?: Array<{
    title: string;
    location?: string;
    city?: string;
    day?: number;
    month?: number;
    year?: number;
    time?: string;
    isPaid?: boolean;
    price?: string | null;
    requirements?: string | null;
    website?: string | null;
  }>;
  /** Nome do usuário, se conectado. */
  nomeUsuario?: string;
  /** Tela atual do app. */
  telaAtual?: string;
}

interface Topico {
  id: string;
  /** Palavras que identificam o assunto (já normalizadas). */
  chaves: string[];
  /** Peso extra para assuntos que devem ganhar empates. */
  peso?: number;
  responder: (ctx: ContextoResposta, texto: string) => string;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function formatarData(e: { day?: number; month?: number; year?: number }): string {
  if (e.day === undefined || e.month === undefined) return "data a confirmar";
  return `${e.day} de ${MESES[e.month] ?? "novembro"}${e.year ? ` de ${e.year}` : ""}`;
}

/** Lista compacta de eventos futuros. */
function listarEventos(ctx: ContextoResposta, filtro?: (e: any) => boolean, limite = 5): string {
  const eventos = (ctx.eventos ?? []).filter(filtro ?? (() => true));

  if (eventos.length === 0) {
    return "Não encontrei eventos com esse critério no momento. Novos eventos entram no **Mural & Eventos** assim que são aprovados pela equipe da escola.";
  }

  const linhas = eventos.slice(0, limite).map((e) => {
    const pago = e.isPaid ? ` · Ingresso ${e.price || "pago"}` : " · **Entrada gratuita**";
    const cidade = e.city ? ` · ${e.city}` : "";
    return `- **${e.title}** — ${formatarData(e)}${e.time ? ` às ${e.time}` : ""}${cidade}${pago}`;
  });

  const resto = eventos.length - limite;
  return (
    linhas.join("\n") +
    (resto > 0 ? `\n\nE mais ${resto} evento(s) no **Mural & Eventos**.` : "")
  );
}

/**
 * Tópicos do repertório.
 *
 * A ordem é a prioridade em caso de empate de palavras-chave.
 */
const TOPICOS: Topico[] = [
  // --------------------------------------------- escola específica (prioridade máxima)
  ...ARAUCARIA_SCHOOLS.map((escola) => {
    // Cada escola é identificada por uma palavra distintiva do nome.
    const chaves = normalizarTexto(escola.shortName || escola.name)
      .split(" ")
      .filter((p) => p.length > 4);
    return {
      id: `escola-${escola.slug}`,
      chaves,
      peso: 3,
      responder: () =>
        `🏫 **${escola.name}**\n\n` +
        `📍 **Endereço:** ${escola.address} — ${escola.neighborhood}, Araucária/PR\n` +
        `📞 **Telefone:** ${escola.phone}\n` +
        `✉️ **E-mail:** ${escola.email}\n` +
        `🎓 **Modalidades:** ${escola.modalities.join(", ")}\n\n` +
        `Abra **Escolas → ${escola.shortName || escola.name}** para ver estrutura, avisos e os eventos da instituição.`,
    } satisfies Topico;
  }),

  // --------------------------------------------- telefone
  {
    id: "telefone",
    chaves: ["telefone", "ligar", "contato", "fone", "whatsapp", "numero"],
    peso: 2,
    responder: () =>
      "📞 **Telefones das escolas de Araucária**\n\n" +
      ARAUCARIA_SCHOOLS.map((s) => `- **${s.shortName || s.name}**: ${s.phone}`).join("\n") +
      "\n\nEm emergência, a tela de introdução tem a seção **SOS** com os números de apoio (Polícia, Bombeiros, SAMU e Conselho Tutelar).",
  },

  // --------------------------------------------- endereço / localização
  {
    id: "endereco",
    chaves: ["endereco", "onde fica", "localizacao", "como chegar", "cep", "bairro", "rua"],
    peso: 2,
    responder: () =>
      "📍 **Endereços das escolas**\n\n" +
      ARAUCARIA_SCHOOLS.map(
        (s) => `- **${s.shortName || s.name}** — ${s.address}, ${s.neighborhood} (CEP ${s.cep})`
      ).join("\n") +
      "\n\nPara ver no mapa, abra a aba **Mapa**: ela usa sua localização real (com sua permissão) e mostra o que está perto de você.",
  },

  // --------------------------------------------- modalidades / cursos
  {
    id: "modalidades",
    chaves: ["modalidade", "curso", "cursos", "ensino medio", "tecnico", "fundamental", "serie", "ano escolar"],
    peso: 2,
    responder: () =>
      "🎓 **Modalidades oferecidas**\n\n" +
      ARAUCARIA_SCHOOLS.map((s) => `- **${s.shortName || s.name}**: ${s.modalities.join(", ")}`).join("\n") +
      "\n\nSe você procura um curso técnico específico, me diga qual — eu indico a escola que oferece.",
  },

  // --------------------------------------------- como se cadastrar
  {
    id: "cadastro",
    chaves: ["cadastr", "criar conta", "registrar", "inscricao no site", "como entro", "login", "entrar no app"],
    peso: 2,
    responder: () =>
      "🔑 **Como entrar no eloEscola**\n\n" +
      "1. **Entrar** — use e-mail e senha, ou **Continuar com Google**.\n" +
      "2. **Criar conta** — na tela de introdução, toque em **Entrar → Criar conta**. É cadastro aberto.\n" +
      "3. **Modo visitante** — dá para navegar sem conta; para confirmar presença e salvar histórico é preciso estar logado.\n\n" +
      "Esqueceu a senha? Na tela de login há **Esqueci minha senha**.",
  },

  // --------------------------------------------- confirmar presença
  {
    id: "presenca",
    chaves: ["presenca", "confirmar", "participar", "vou no evento", "inscrever no evento", "checkin", "check-in"],
    peso: 2,
    responder: () =>
      "✅ **Como confirmar presença**\n\n" +
      "1. Abra o evento (pelo **Mural** ou pelo **Calendário**).\n" +
      "2. Toque em **Confirmar Presença**.\n" +
      "3. A confirmação aparece na sua ficha em **Configurações → Histórico**.\n\n" +
      "Você precisa estar logado (não vale modo visitante). Se o evento exigir autorização de responsável, o app abre o formulário automaticamente.",
  },

  // --------------------------------------------- eventos gratuitos
  {
    id: "gratuitos",
    chaves: ["gratuit", "gratis", "entrada franca", "sem custo", "de graca", "barato"],
    peso: 2,
    responder: (ctx) =>
      "🆓 **Eventos gratuitos**\n\n" + listarEventos(ctx, (e) => !e.isPaid),
  },

  // --------------------------------------------- eventos pagos
  {
    id: "pagos",
    chaves: ["pago", "ingresso", "preco", "quanto custa", "valor"],
    peso: 2,
    responder: (ctx) =>
      "🎟️ **Eventos com ingresso**\n\n" + listarEventos(ctx, (e) => Boolean(e.isPaid)),
  },

  // --------------------------------------------- agenda / próximos
  {
    id: "agenda",
    chaves: ["evento", "agenda", "calendario", "programacao", "o que tem", "proximos", "quando"],
    peso: 1,
    responder: (ctx) =>
      "📅 **Agenda do eloEscola**\n\n" + listarEventos(ctx) +
      "\n\nPara filtrar por data, use o **Calendário**; por cidade ou bairro, use o **Mapa**.",
  },

  // --------------------------------------------- evento escolar vs aberto
  {
    id: "escolar",
    chaves: ["escolar", "nao escolar", "aberto ao publico", "so para alunos", "comunidade"],
    peso: 2,
    responder: () =>
      "🏫 **Evento escolar × evento aberto**\n\n" +
      "- **Escolar**: organizado pela escola para alunos e famílias (reuniões, feiras internas, jogos entre turmas).\n" +
      "- **Não escolar (aberto ao público)**: qualquer pessoa pode participar (mostras culturais, festivais, olimpíadas abertas).\n\n" +
      "No Mural você filtra por essa categoria nos chips no topo da lista.",
  },

  // --------------------------------------------- autorização de responsável
  {
    id: "autorizacao",
    chaves: ["autorizacao", "responsavel", "pai", "mae", "assinatura", "termo", "menor de idade"],
    peso: 2,
    responder: () =>
      "📝 **Autorização do responsável**\n\n" +
      "Alguns eventos (saídas de campo, competições fora da escola) exigem autorização assinada. " +
      "Nesse caso, ao confirmar presença o app abre o formulário do responsável — preencha e confirme.\n\n" +
      "A autorização fica registrada no evento e o aluno aparece como **Presença Confirmada**.",
  },

  // --------------------------------------------- modo escuro / acessibilidade
  {
    id: "acessibilidade",
    chaves: ["modo escuro", "tema escuro", "acessibilidade", "voz", "microfone", "falar", "ler a tela", "leitor"],
    peso: 2,
    responder: () =>
      "♿ **Acessibilidade do eloEscola**\n\n" +
      "- **Modo escuro**: em **Configurações** ou no botão de lua na tela de introdução.\n" +
      "- **Ler em voz alta**: no Assistente Elo, toque no alto-falante de qualquer resposta.\n" +
      "- **Comandos por voz**: toque no microfone e fale — \"leia a tela\", \"modo escuro\", \"abrir o mapa\".\n" +
      "- **Preencher evento por voz**: \"crie um evento chamado Feira de Ciências em 20 de novembro às 14h\". Eu preencho e peço sua confirmação.\n\n" +
      "O microfone só liga quando você toca nele.",
  },

  // --------------------------------------------- quem pode publicar
  {
    id: "publicar",
    chaves: ["publicar", "cadastrar evento", "quem pode", "permissao", "admin", "administrador", "funcionario"],
    peso: 2,
    responder: () =>
      "🛡️ **Quem publica no eloEscola**\n\n" +
      "- **Chefe Administrador**: gerencia usuários, eventos, escolas e sugestões.\n" +
      "- **Funcionário Administrador**: adiciona eventos e sugestões.\n" +
      "- **Aluno / visitante**: consulta e confirma presença.\n\n" +
      "Todo evento automático (sugerido pela IA) passa por **aprovação humana** antes de aparecer no Mural.",
  },

  // --------------------------------------------- sugestões de eventos
  {
    id: "sugestoes",
    chaves: ["sugestao", "sugestoes", "sugerir", "ia", "inteligencia artificial", "scout"],
    peso: 2,
    responder: () =>
      "✨ **Sugestões de eventos**\n\n" +
      "O eloEscola tem um motor próprio que monta sugestões a partir do calendário escolar e cultural de Araucária e Curitiba — " +
      "**sem precisar de chave de IA**. A IA, quando configurada, só enriquece o texto.\n\n" +
      "As sugestões ficam no **Painel ADM → Sugestões**, onde o Chefe Administrador aprova ou rejeita. " +
      "O que é rejeitado não volta a aparecer.",
  },

  // --------------------------------------------- transporte / merenda / matrícula
  {
    id: "servicos",
    chaves: ["transporte", "onibus", "merenda", "matricula", "uniforme", "horario de aula"],
    peso: 2,
    responder: () =>
      "🚌 **Serviços escolares**\n\n" +
      "Matrícula, transporte, merenda e uniforme são definidos pela **SEED/PR** e pela secretaria de cada escola — o eloEscola não gerencia essas informações.\n\n" +
      "O caminho mais rápido é ligar direto na secretaria: os telefones estão em **Escolas** (ou me pergunte \"telefone da escola X\").",
  },

  // --------------------------------------------- ajuda do próprio assistente
  {
    id: "ajuda",
    chaves: ["ajuda", "o que voce faz", "o que voce pode", "comandos", "como usar voce", "help"],
    peso: 2,
    responder: () =>
      "🤖 **O que eu faço**\n\n" +
      "**Responder** sobre escolas, eventos, endereços, telefones, modalidades, inscrições e acessibilidade.\n\n" +
      "**Agir no app** (pode falar pelo microfone):\n" +
      "- \"leia a tela\" · \"parar de ler\"\n" +
      "- \"ativar modo escuro\" · \"modo claro\"\n" +
      "- \"abrir o mapa\" · \"ir para configurações\" · \"ver escolas\"\n" +
      "- \"crie um evento chamado … em 20 de novembro às 14h no ginásio\"\n\n" +
      "Nada é publicado sem a sua confirmação.",
  },

  // --------------------------------------------- saudações
  {
    id: "saudacao",
    chaves: ["oi", "ola", "bom dia", "boa tarde", "boa noite", "tudo bem", "eai"],
    responder: (ctx) =>
      `Olá${ctx.nomeUsuario ? `, ${ctx.nomeUsuario}` : ""}! 👋\n\n` +
      "Sou o **Assistente Elo**. Posso falar sobre as 6 escolas de Araucária, a agenda de eventos de Araucária e Curitiba, " +
      "e também **agir no app** — trocar o tema, abrir telas, ler a tela em voz alta e preparar um cadastro de evento.\n\n" +
      "O que você precisa?",
  },
];

/**
 * Gera a resposta local para uma mensagem.
 *
 * @returns o texto da resposta — nunca vazio.
 */
export function responderLocalmente(mensagem: string, ctx: ContextoResposta = {}): string {
  const texto = normalizarTexto(mensagem);

  if (!texto) {
    return "Pode escrever ou falar sua dúvida — estou ouvindo. 🙂";
  }

  // Pontua cada tópico
  let melhor: { topico: Topico; score: number } | null = null;

  for (const topico of TOPICOS) {
    let score = 0;
    for (const chave of topico.chaves) {
      const chaveNorm = normalizarTexto(chave);
      if (!chaveNorm) continue;
      // Palavra inteira ou início de palavra ("cadastr" casa "cadastrar")
      if (new RegExp(`(^|\\s)${chaveNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(texto)) {
        score += chaveNorm.includes(" ") ? 3 : 1; // expressões valem mais que palavras soltas
      }
    }
    if (score === 0) continue;
    const pontuado = score + (topico.peso ?? 0);
    if (!melhor || pontuado > melhor.score) {
      melhor = { topico, score: pontuado };
    }
  }

  if (melhor) {
    try {
      return melhor.topico.responder(ctx, texto);
    } catch {
      /* se um tópico falhar, cai na resposta padrão */
    }
  }

  // Sem tópico: tenta achar um evento pelo nome
  const porTitulo = (ctx.eventos ?? []).find((e) =>
    normalizarTexto(e.title)
      .split(" ")
      .filter((w) => w.length > 3)
      .some((w) => texto.includes(w))
  );

  if (porTitulo) {
    return (
      `Encontrei este evento: 🌟\n\n` +
      `**${porTitulo.title}**\n` +
      `📅 ${formatarData(porTitulo)}${porTitulo.time ? ` às ${porTitulo.time}` : ""}\n` +
      `📍 ${porTitulo.location || "Local a confirmar"}${porTitulo.city ? ` — ${porTitulo.city}` : ""}\n` +
      `💰 ${porTitulo.isPaid ? porTitulo.price || "Pago" : "Entrada gratuita"}\n` +
      (porTitulo.requirements ? `✅ ${porTitulo.requirements}\n` : "") +
      (porTitulo.website ? `🔗 ${porTitulo.website}\n` : "") +
      `\nAbra o **Mural** para confirmar presença.`
    );
  }

  return (
    "Não tenho essa informação por aqui. Posso ajudar com:\n\n" +
    "- 🏫 as **6 escolas de Araucária** (endereço, telefone, modalidades)\n" +
    "- 📅 a **agenda** de eventos de Araucária e Curitiba\n" +
    "- ✅ como **confirmar presença** ou pedir autorização\n" +
    "- ♿ **acessibilidade** (modo escuro, voz, leitura de tela)\n\n" +
    "Se for sobre matrícula, transporte ou merenda, o melhor caminho é ligar na secretaria da escola."
  );
}
