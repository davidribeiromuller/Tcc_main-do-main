// Edge Function: ai-event-scout
// Descrição:
//   A IA busca e monta, de forma autônoma, candidatos a eventos escolares de
//   Araucária/PR e os deposita na tabela `event_suggestions` com status
//   'pending'. NADA é publicado automaticamente: um admin aprova na aba
//   "Sugestões" e só então o evento é criado no app e no banco.
//
// Multi-provedor: funciona com QUALQUER uma destas chaves configurada nos
// secrets do projeto. A primeira encontrada é usada:
//
//   GEMINI_API_KEY      (Google Gemini)      → grátis no AI Studio
//   ANTHROPIC_API_KEY   (Claude)             → console.anthropic.com
//   OPENAI_API_KEY      (ChatGPT)            → platform.openai.com
//   OPENROUTER_API_KEY  (OpenRouter)         → openrouter.ai (tem modelos grátis)
//   GROQ_API_KEY        (Groq)               → console.groq.com (tem tier grátis)
//
// Opcionais:
//   AI_PROVIDER  → força um provedor: gemini | anthropic | openai | openrouter | groq
//   AI_MODEL     → força um modelo específico daquele provedor
//
// Invocação:
//   POST /functions/v1/ai-event-scout    (JWT obrigatório)
//   Body opcional: { "count": 5, "focus": "ciencia" }
//
// Deno runtime.

import { createClient } from "npm:@supabase/supabase-js@2";
import { runLocalEventEngine } from "./local_engine.ts";
import { buildRejectionMemory, colideComMemoria } from "./rejectionMemory.ts";
// Reaproveita a mesma regra do app (src/lib/eventClassification.ts).
// Duplicar as listas aqui já causou conflito de símbolo no bundle.
import { detectForbiddenContent } from "./eventClassification.ts";

const DEFAULT_COUNT = 5;
const MAX_COUNT = 8;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============================================================
// Schema neutro (JSON Schema) — convertido para cada provedor
// ============================================================
const ITEM_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    location: { type: "string" },
    address: { type: "string" },
    city: { type: "string", enum: ["Araucária", "Curitiba"] },
    category: { type: "string" },
    school_name: { type: "string" },
    is_school: { type: "boolean" },
    day: { type: "integer" },
    month: { type: "integer" },
    year: { type: "integer" },
    time: { type: "string" },
    is_paid: { type: "boolean" },
    price: { type: "string" },
    requirements: { type: "string" },
    website: { type: "string" },
    source_name: { type: "string" },
    source_url: { type: "string" },
    confidence: { type: "number" },
    reasoning: { type: "string" },
  },
  required: [
    "title",
    "description",
    "city",
    "day",
    "month",
    "year",
    "time",
    "confidence",
  ],
  additionalProperties: false,
};

const ROOT_SCHEMA = {
  type: "object",
  properties: { suggestions: { type: "array", items: ITEM_SCHEMA } },
  required: ["suggestions"],
  additionalProperties: false,
};

/** Gemini exige tipos em MAIÚSCULAS e não aceita additionalProperties. */
function toGeminiSchema(node: any): any {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;

  const out: any = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "additionalProperties") continue;
    if (k === "type" && typeof v === "string") {
      out.type = v.toUpperCase();
    } else if (k === "properties") {
      const props: any = {};
      for (const [pk, pv] of Object.entries(v as any)) props[pk] = toGeminiSchema(pv);
      out.properties = props;
    } else if (k === "items") {
      out.items = toGeminiSchema(v);
    } else if (k === "enum" || k === "required") {
      out[k] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ============================================================
// Prompt
// ============================================================
function buildPrompt(count: number, focus?: string, jaDecididos: string[] = []): string {
  const hoje = new Date().toISOString().slice(0, 10);

  /**
   * Lista explícita do que já foi avaliado, dentro do prompt.
   *
   * O filtro em código (memória de rejeição) é a garantia final, mas avisar o
   * modelo reduz o desperdício: sem isto ele gastava as `count` vagas repetindo
   * eventos que seriam descartados na saída, e o admin via "nenhuma sugestão
   * nova" mesmo havendo assuntos inéditos a descobrir.
   */
  const listaBloqueados =
    jaDecididos.length > 0
      ? `\nNÃO SUGIRA NEM REPITA (já avaliados pelo administrador, com qualquer
variação de nome — "feira"/"mostra"/"mostra de ciência"/"feira de ciências"
contam como o mesmo evento):\n${jaDecididos
          .slice(0, 60)
          .map((t) => `- ${t}`)
          .join("\n")}\n`
      : "";
  return `Você é o agente de descoberta de eventos do Elo Escola, um app escolar
das escolas de Araucária e Curitiba, no Paraná, Brasil.

Data de hoje: ${hoje}.

Sua tarefa: propor até ${count} eventos reais e verificáveis que acontecerão
nos próximos 12 meses (nunca no passado), nas cidades de **Araucária** e
**Curitiba** (Paraná). A maior parte deve ser ESCOLAR, mas inclua também
eventos ABERTOS AO PÚBLICO que sejam relevantes para estudantes do ensino
fundamental II e médio.

Priorize (escolares):
- Feiras de profissões, feiras de cursos e mostras vocacionais
- Olimpíadas do conhecimento (OBMEP, OBI, ONHB, MOBFOG) e competições estudantis
- Feiras de ciências, tecnologia, robótica e inovação
- Eventos culturais, artísticos e esportivos escolares
- Jogos escolares e competições entre escolas

Priorize (abertos ao público):
- Processos seletivos e vestibulares de instituições da região (UFPR, UTFPR, PUCPR)
- Mostras culturais, feiras de livro e exposições com fins educativos
- Feiras de ciência e tecnologia abertas à comunidade
- Eventos esportivos e culturais abertos ao público em geral

PROIBIDO — não inclua de forma alguma:
- Baladas, raves, boates, festas noturnas, micaretas e carnaval fora de época
- Shows, festivais de música com venda de ingresso e eventos com open bar
- Qualquer evento cujo público principal seja adulto ou envolva consumo de álcool
Eventos assim são descartados automaticamente pelo sistema.

${focus ? `Foco adicional pedido pelo administrador: ${focus}` : ""}
${listaBloqueados}
Regras obrigatórias:
- "month" é 0-indexado (0 = janeiro, 11 = dezembro).
- Datas devem estar no futuro em relação a hoje.
- "city" deve ser exatamente "Araucária" ou "Curitiba".
- "is_school" deve ser true apenas para eventos organizados por escola ou
  voltados a estudantes; false para eventos abertos ao público em geral.
- "time" no formato HH:MM (24h). Se não souber, use "08:00".
- "confidence" entre 0 e 1: use no máximo 0.6 quando a data for aproximada
  ou inferida, e acima de 0.8 apenas quando a data for oficialmente divulgada.
- Em "reasoning", explique em uma frase de onde veio a informação e o quanto
  a data é confiável.
- Em "source_name"/"source_url", informe a origem (site oficial, calendário
  escolar, edital). Se não houver URL oficial, deixe "source_url" vazio.
- NUNCA invente um evento. Se não tiver confiança mínima, não inclua.
- Descrições objetivas, de 1 a 3 frases, em português do Brasil.

Responda APENAS com um JSON válido no formato:
{"suggestions":[{ "title":"...", "description":"...", "city":"Araucária",
"day":1, "month":0, "year":2027, "time":"08:00", "confidence":0.8, ... }]}`;
}

// ============================================================
// Provedores
// ============================================================
type ProviderId = "gemini" | "anthropic" | "openai" | "openrouter" | "groq";

interface ProviderDef {
  id: ProviderId;
  label: string;
  envKeys: string[];
  defaultModel: string;
  signupUrl: string;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    // ATENÇÃO: gemini-2.5-flash foi APOSENTADO para contas novas
    // ("no longer available to new users"). Testado em 13/11/2026:
    //   gemini-2.5-flash      -> 404 (descontinuado)
    //   gemini-3.8-flash      -> 503 (alta demanda, instável)
    //   gemini-3.1-flash-lite -> 200 (estável, respondeu JSON estruturado)
    defaultModel: "gemini-3.1-flash-lite",
    signupUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    envKeys: ["ANTHROPIC_API_KEY"],
    defaultModel: "claude-sonnet-4-5",
    signupUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    label: "ChatGPT (OpenAI)",
    envKeys: ["OPENAI_API_KEY"],
    defaultModel: "gpt-4o-mini",
    signupUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    envKeys: ["OPENROUTER_API_KEY"],
    defaultModel: "google/gemini-2.5-flash-lite",
    signupUrl: "https://openrouter.ai/keys",
  },
  {
    id: "groq",
    label: "Groq",
    envKeys: ["GROQ_API_KEY"],
    defaultModel: "llama-3.3-70b-versatile",
    signupUrl: "https://console.groq.com/keys",
  },
];

/** Descobre qual provedor usar: AI_PROVIDER explícito ou a primeira chave presente. */
function resolveProvider(): { def: ProviderDef; apiKey: string } | null {
  const forced = Deno.env.get("AI_PROVIDER")?.toLowerCase();

  const ordenados = forced
    ? PROVIDERS.filter((p) => p.id === forced).concat(PROVIDERS.filter((p) => p.id !== forced))
    : PROVIDERS;

  for (const def of ordenados) {
    for (const key of def.envKeys) {
      const valor = Deno.env.get(key);
      if (valor && valor.trim().length > 0) {
        return { def, apiKey: valor.trim() };
      }
    }
  }
  return null;
}

/** Extrai o primeiro objeto JSON de uma resposta de texto. */
function extrairJson(texto: string): any {
  try {
    return JSON.parse(texto);
  } catch (_) {
    const inicio = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    if (inicio >= 0 && fim > inicio) {
      return JSON.parse(texto.slice(inicio, fim + 1));
    }
    throw new Error("A IA não retornou um JSON válido.");
  }
}

async function chamarGemini(
  def: ProviderDef,
  apiKey: string,
  model: string,
  prompt: string
): Promise<any> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(ROOT_SCHEMA),
      },
    }),
  });

  if (!resp.ok) throw new Error(`${def.label} ${resp.status}: ${(await resp.text()).slice(0, 400)}`);

  const json = await resp.json();
  const texto = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) throw new Error(`${def.label} não retornou conteúdo.`);
  return extrairJson(texto);
}

async function chamarAnthropic(
  def: ProviderDef,
  apiKey: string,
  model: string,
  prompt: string
): Promise<any> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.4,
      tools: [
        {
          name: "emitir_sugestoes",
          description: "Registra as sugestões de eventos encontradas.",
          input_schema: ROOT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "emitir_sugestoes" },
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) throw new Error(`${def.label} ${resp.status}: ${(await resp.text()).slice(0, 400)}`);

  const json = await resp.json();
  const bloco = json?.content?.find((b: any) => b.type === "tool_use");
  if (bloco?.input) return bloco.input;

  // Alguns modelos podem responder em texto mesmo com tool_choice
  const texto = json?.content?.find((b: any) => b.type === "text")?.text;
  if (texto) return extrairJson(texto);
  throw new Error(`${def.label} não retornou conteúdo estruturado.`);
}

/** OpenAI, OpenRouter e Groq compartilham o formato chat/completions. */
async function chamarOpenAiCompat(
  def: ProviderDef,
  apiKey: string,
  model: string,
  prompt: string
): Promise<any> {
  const baseUrl =
    def.id === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : def.id === "groq"
        ? "https://api.groq.com/openai/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions";

  const resp = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: "Você responde sempre com JSON válido, sem markdown.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!resp.ok) throw new Error(`${def.label} ${resp.status}: ${(await resp.text()).slice(0, 400)}`);

  const json = await resp.json();
  const texto = json?.choices?.[0]?.message?.content;
  if (!texto) throw new Error(`${def.label} não retornou conteúdo.`);
  return extrairJson(texto);
}

async function chamarModelo(
  def: ProviderDef,
  apiKey: string,
  model: string,
  prompt: string
): Promise<any> {
  switch (def.id) {
    case "gemini":
      return chamarGemini(def, apiKey, model, prompt);
    case "anthropic":
      return chamarAnthropic(def, apiKey, model, prompt);
    default:
      return chamarOpenAiCompat(def, apiKey, model, prompt);
  }
}

// ============================================================
// Deduplicação
// ============================================================
/**
 * Colunas que realmente existem em `event_suggestions`.
 *
 * ## O bug que isto corrige (500 persistente)
 *
 * O motor local monta o candidato com `is_school` (`localEventEngine.ts`),
 * porque a informação é útil em memória para classificar o evento. Mas
 * `is_school` **não é coluna da tabela** — o PostgREST responde:
 *
 *   PGRST204: Could not find the 'is_school' column of 'event_suggestions'
 *             in the schema cache
 *
 * O candidato da IA era montado campo por campo (limpo); o do motor local ia
 * cru para o lote, e o `.insert()` é único para todos. Um campo sobrando
 * invalidava a gravação inteira — daí a fila vazia e o 500 sempre que o motor
 * local gerava algo.
 *
 * A correção não é "tirar is_school do engine" (alguém reintroduziria amanhã):
 * é filtrar o lote contra a lista explícita de colunas, na fronteira com o
 * banco. Campo desconhecido é descartado, não vira erro de runtime.
 */
const COLUNAS_EVENT_SUGGESTIONS = [
  "title", "location", "address", "city", "category", "description",
  "requirements", "website", "image", "day", "month", "year", "time",
  "is_paid", "price", "school_name", "source_name", "source_url",
  "ai_confidence", "ai_reasoning", "fingerprint", "status", "origin",
  "is_estimated",
] as const;

/**
 * Reduz um candidato às colunas existentes.
 *
 * Mantém `null`/`false`/`0` (valores válidos) e remove `undefined`, para não
 * sobrescrever defaults do banco.
 */
function sanearParaInsercao(candidato: Record<string, any>): Record<string, any> {
  const limpo: Record<string, any> = {};
  for (const coluna of COLUNAS_EVENT_SUGGESTIONS) {
    const valor = candidato[coluna];
    if (valor !== undefined) limpo[coluna] = valor;
  }
  return limpo;
}

function fingerprint(s: {
  title: string;
  day: number;
  month: number;
  year: number;
  city?: string;
}): string {
  const norm = (v: string) =>
    (v || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  return `${norm(s.title)}|${s.year}-${s.month}-${s.day}|${norm(s.city || "")}`;
}

/** Normaliza texto para comparação semântica (sem acento, sem pontuação). */
function normalizarTexto(v: string): string {
  return (v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Palavras ignoradas na comparação de títulos. */
const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "a", "o", "as", "os", "para",
  "com", "no", "na", "nos", "nas", "por", "ao", "aos", "the", "of",
  "edicao", "edition", "nacional", "brasileira", "brasileiro", "municipal",
  "estadual", "2025", "2026", "2027", "2028", "2029", "2030",
]);

/**
 * Sinônimos que aparecem nas variações de título geradas pela IA.
 * "1ª Fase" e "Primeira Fase" descrevem o mesmo evento.
 */
const ORDINAIS: Record<string, string> = {
  "1": "primeira", "1a": "primeira", "1o": "primeira",
  "2": "segunda", "2a": "segunda", "2o": "segunda",
  "3": "terceira", "3a": "terceira", "3o": "terceira",
};

/**
 * Ano citado explicitamente no título, se houver.
 * "OBMEP 2027" e "OBMEP 2028" são edições distintas e não podem ser
 * confundidas pela deduplicação.
 */
function anoNoTitulo(titulo: string): number | null {
  const correspondencia = (titulo || "").match(/(20\d{2})/);
  return correspondencia ? parseInt(correspondencia[1], 10) : null;
}

/** Conjunto de palavras significativas do título. */
function palavrasChave(titulo: string): Set<string> {
  return new Set(
    normalizarTexto(titulo)
      .split(" ")
      .map((w) => ORDINAIS[w] || w)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

/** Similaridade de Jaccard entre os títulos (0 a 1). */
function similaridadeTitulo(a: string, b: string): number {
  const pa = palavrasChave(a);
  const pb = palavrasChave(b);
  if (pa.size === 0 || pb.size === 0) return 0;
  let intersecao = 0;
  for (const w of pa) if (pb.has(w)) intersecao++;
  return intersecao / (pa.size + pb.size - intersecao);
}

/** Diferença em dias entre duas datas (dia/mês/ano, mês 0-indexado). */
function diferencaEmDias(
  a: { day: number; month: number; year: number },
  b: { day: number; month: number; year: number }
): number {
  const ms = new Date(a.year, a.month, a.day).getTime() - new Date(b.year, b.month, b.day).getTime();
  return Math.abs(Math.round(ms / 86_400_000));
}

/** Janela (em dias) em que duas ocorrências são consideradas o mesmo evento. */
const JANELA_MESMO_EVENTO_DIAS = 30;
/** Similaridade mínima de título para considerar o mesmo evento. */
const LIMIAR_SIMILARIDADE = 0.6;

/** Cidade normalizada para comparação. */
function cidadeNormalizada(city: string | null | undefined): string {
  return normalizarTexto(city || "");
}

/**
 * Janela larga para títulos praticamente idênticos.
 *
 * Descoberta com dados reais: "Feira de Profissões da PUCPR" foi rejeitada em
 * 2027-08-15 e voltou como 2027-07-12. A IA inventa a data, então a distância
 * entre as duas tentativas não pode ser o critério principal — se o título é o
 * mesmo evento, a rejeição vale independentemente da data que ela chutou.
 */
const JANELA_TITULO_IDENTICO_DIAS = 180;
/** Similaridade a partir da qual o título é considerado o mesmo evento. */
const LIMIAR_TITULO_IDENTICO = 0.85;

/**
 * Dois candidatos descrevem o mesmo evento?
 *
 * O fingerprint exato falhava porque a IA gera variações do título e da data a
 * cada execução — por isso sugestões rejeitadas voltavam com fingerprint novo.
 * Estratégia: título idêntico ignora quase a data; título parecido exige data
 * próxima.
 */
function mesmoEvento(
  a: { title: string; day: number; month: number; year: number; city?: string | null },
  b: { title: string; day: number; month: number; year: number; city?: string | null }
): boolean {
  const cidadeA = cidadeNormalizada(a.city);
  const cidadeB = cidadeNormalizada(b.city);
  if (cidadeA && cidadeB && cidadeA !== cidadeB) return false;

  // Edições distintas (ano explícito diferente) nunca são o mesmo evento,
  // por mais parecidos que os títulos sejam.
  const anoA = anoNoTitulo(a.title);
  const anoB = anoNoTitulo(b.title);
  if (anoA !== null && anoB !== null && anoA !== anoB) return false;

  let similaridade = similaridadeTitulo(a.title, b.title);
  const dias = diferencaEmDias(a, b);

  // Contenção: "Vestibular UFPR 2027/2028" e "Vestibular UFPR 2027/2028 - Prova
  // da 1ª Fase" são o mesmo evento — o segundo só acrescenta qualificador.
  // Sem isto, a Jaccard sobe apenas para 0,5 e a rejeição se perdia.
  const menor = palavrasChave(a.title).size <= palavrasChave(b.title).size ? a.title : b.title;
  const maior = menor === a.title ? b.title : a.title;
  const chavesMenor = [...palavrasChave(menor)];
  if (chavesMenor.length > 0 && chavesMenor.every((w) => palavrasChave(maior).has(w))) {
    similaridade = Math.max(similaridade, 0.9);
  }

  // Mesmo título, data incerta: é o mesmo evento.
  if (similaridade >= LIMIAR_TITULO_IDENTICO) {
    return dias <= JANELA_TITULO_IDENTICO_DIAS;
  }

  // Título parecido só conta se as datas também estiverem próximas.
  return similaridade >= LIMIAR_SIMILARIDADE && dias <= JANELA_MESMO_EVENTO_DIAS;
}

// ============================================================
// Conteúdo não permitido
// ============================================================

/**
 * Traduz o erro cru do provedor numa mensagem acionável.
 *
 * Descoberta em produção: o Google aposentou o gemini-2.5-flash para contas
 * novas e responde 404 "no longer available to new users". Sem este mapa, o
 * admin veria só "A IA falhou" e não saberia que precisava trocar o modelo.
 */
function diagnosticarFalhaIa(
  bruto: string,
  provedorLabel: string,
  modelo: string
): { tipo: string; mensagem: string; sugestao: string | null } {
  const texto = bruto.toLowerCase();

  if (texto.includes("no longer available") || (texto.includes("404") && texto.includes("model"))) {
    return {
      tipo: "MODELO_DESCONTINUADO",
      mensagem:
        `O modelo "${modelo}" não está mais disponível para contas novas. ` +
        `A IA (${provedorLabel}) não pôde ser usada.`,
      sugestao:
        "Defina o secret AI_MODEL com um modelo atual, por exemplo gemini-3.1-flash-lite.",
    };
  }

  if (texto.includes("high demand") || texto.includes("unavailable") || texto.includes("503")) {
    return {
      tipo: "ALTA_DEMANDA",
      mensagem: `O modelo "${modelo}" está com alta demanda no momento (${provedorLabel}).`,
      sugestao: "Tente novamente em alguns minutos ou troque o AI_MODEL.",
    };
  }

  if (texto.includes("quota") || texto.includes("429") || texto.includes("resource_exhausted")) {
    return {
      tipo: "COTA_EXCEDIDA",
      mensagem: `A cota gratuita da IA (${provedorLabel}) foi atingida por agora.`,
      sugestao: "Aguarde a renovação da cota ou configure outra chave.",
    };
  }

  if (
    texto.includes("api key not valid") ||
    texto.includes("api_key_invalid") ||
    texto.includes("401") ||
    texto.includes("permission")
  ) {
    return {
      tipo: "CHAVE_INVALIDA",
      mensagem: `A chave da IA (${provedorLabel}) foi rejeitada.`,
      sugestao: "Confira o secret da chave em Supabase → Edge Functions → Secrets.",
    };
  }

  return {
    tipo: "ERRO_DESCONHECIDO",
    mensagem: `A IA (${provedorLabel}) falhou: ${bruto.slice(0, 180)}`,
    sugestao: null,
  };
}

function respostaJson(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ============================================================
// Handler
// ============================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return respostaJson({ error: "Use POST." }, 405);
  }

  try {
    // --- 1. Autenticação ---
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return respostaJson({ error: "Autenticação necessária." }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return respostaJson({ error: "Sessão inválida." }, 401);
    }

    // --- 2. Parâmetros ---
    let payload: any = {};
    try {
      payload = await req.json();
    } catch (_) {
      payload = {};
    }
    const count = Math.min(Math.max(Number(payload?.count) || DEFAULT_COUNT, 1), MAX_COUNT);
    const focus = typeof payload?.focus === "string" ? payload.focus : undefined;

    // --- 3. FONTES DE DESCOBERTA ---
    // O motor local SEMPRE roda (não precisa de chave).
    // A IA complementa quando houver chave configurada.
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const agora = new Date();
    const candidatos: any[] = [];
    const fontesUsadas: string[] = [];
    let descartadas = 0;
    let bloqueadosPorConteudo = 0;
    let avisoIa: string | null = null;

    /**
     * Memória de rejeição, lida ANTES de gerar candidatos.
     *
     * Antes, o histórico era consultado só no passo 4 (depois de o motor local
     * já ter produzido tudo), e o filtro por título só existia aqui dentro. Com
     * isso o motor local devolvia sempre o mesmo catálogo — o admin rejeitava a
     * OBMEP e ela reaparecia na rodada seguinte. Agora a memória alimenta a
     * geração na origem.
     */
    const { data: titulosDecididos } = await serviceClient
      .from("event_suggestions")
      .select("title")
      .in("status", ["rejected", "approved", "pending"])
      .limit(1000);

    const excludeTitles = ((titulosDecididos ?? []) as Array<{ title: string }>)
      .map((t) => t.title)
      .filter(Boolean);

    // ---------- 3a. Motor local (sem chave) ----------
    const locais = runLocalEventEngine({ referenceDate: agora, limit: count, excludeTitles });
    for (const candidato of locais) {
      candidatos.push(candidato);
    }
    if (locais.length > 0) fontesUsadas.push("local_engine");

    // ---------- 3b. IA (opcional) ----------
    const provedor = resolveProvider();
    let iaInfo: { provider: string; model: string } | null = null;
    let modelUsado = "";
    let falhaIa: { tipo: string; mensagem: string; sugestao: string | null } | null = null;

    if (provedor) {
      try {
        const { def, apiKey } = provedor;
        const model = (Deno.env.get("AI_MODEL") || "").trim() || def.defaultModel;
        modelUsado = model;

        const resultado = await chamarModelo(
          def,
          apiKey,
          model,
          buildPrompt(count, focus, excludeTitles)
        );
        const sugestoesIa = Array.isArray(resultado?.suggestions) ? resultado.suggestions : [];

        for (const s of sugestoesIa) {
          if (
            !s?.title ||
            !Number.isFinite(s?.day) ||
            !Number.isFinite(s?.month) ||
            !Number.isFinite(s?.year)
          ) {
            descartadas++;
            continue;
          }

          const dataEvento = new Date(s.year, s.month, s.day);
          if (isNaN(dataEvento.getTime()) || dataEvento.getTime() < agora.getTime()) {
            descartadas++; // nunca sugerir evento no passado
            continue;
          }

          // Balada, rave, festa e show não entram no app escolar.
          if (detectForbiddenContent({
            title: s.title,
            description: s.description,
            category: s.category,
            requirements: s.requirements,
          }).proibido) {
            bloqueadosPorConteudo++;
            continue;
          }

          candidatos.push({
            title: String(s.title).slice(0, 200),
            description: s.description ?? null,
            location: s.location ?? null,
            address: s.address ?? null,
            city: s.city === "Curitiba" ? "Curitiba" : "Araucária",
            // Categoria coerente com o tipo: o app usa isto para separar
            // escolar de "aberto ao público" na aba de eventos.
            category: s.category ?? (s.is_school === false ? "Aberto ao público" : "Escolar"),
            school_name: s.school_name ?? null,
            day: s.day,
            month: s.month,
            year: s.year,
            time: s.time ?? "08:00",
            is_paid: Boolean(s.is_paid),
            price: s.price ?? null,
            requirements: s.requirements ?? null,
            website: s.website || s.source_url || null,
            source_name: s.source_name ?? null,
            source_url: s.source_url ?? null,
            ai_confidence: Number(s.confidence) || 0.5,
            ai_reasoning: s.reasoning ?? null,
            fingerprint: fingerprint({
              title: s.title,
              day: s.day,
              month: s.month,
              year: s.year,
              city: s.city,
            }),
            status: "pending",
            origin: "ai",
            is_estimated: false,
          });
        }

        fontesUsadas.push("ai");
        iaInfo = { provider: def.id, model };
      } catch (err) {
        // A IA falhou, mas o motor local já produziu resultados.
        // Não derrubamos a requisição por causa disso.
        const bruto = String((err as any)?.message ?? err);
        const info = diagnosticarFalhaIa(bruto, provedor.def.label, modelUsado);
        avisoIa = `${info.mensagem} As sugestões do motor local foram mantidas.`;
        falhaIa = info;
      }
    } else {
      avisoIa =
        "Nenhuma IA configurada — usando apenas o motor local. " +
        "Para ativar a descoberta de eventos inéditos, adicione GEMINI_API_KEY, " +
        "ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY ou GROQ_API_KEY " +
        "em Supabase → Edge Functions → Secrets.";
    }

    // --- 4. Memória de decisões anteriores ---
    // Sugestões já rejeitadas ou aprovadas NUNCA voltam. Antes, o filtro era só
    // por fingerprint exato, então qualquer variação de título ou data criava
    // uma "sugestão nova" e a rejeição se perdia.
    const { data: historico, error: historicoError } = await serviceClient
      .from("event_suggestions")
      .select("title, day, month, year, city, status, reviewed_at")
      .in("status", ["rejected", "approved"])
      .order("reviewed_at", { ascending: false })
      .limit(500);

    if (historicoError) {
      console.warn("[ai-event-scout] Não foi possível ler o histórico:", historicoError.message);
    }

    const decididos = (historico ?? []) as Array<{
      title: string; day: number; month: number; year: number; city: string | null; status: string;
    }>;

    // Pendentes também servem para não duplicar o que já está na fila de revisão.
    const { data: pendentes } = await serviceClient
      .from("event_suggestions")
      .select("title, day, month, year, city")
      .eq("status", "pending")
      .limit(500);

    const jaConhecidos = [
      ...decididos.map((d) => ({ ...d, origem: "decidido" as const })),
      ...((pendentes ?? []) as any[]).map((d) => ({ ...d, origem: "pendente" as const })),
    ];

    /**
     * Memória por assunto, além da comparação por data/similaridade.
     *
     * `mesmoEvento` compara título E data (com janelas de 30/180 dias), o que é
     * correto para detectar duplicata. Mas o pedido do admin é outro: "não quero
     * ver isso de novo". A IA reescreve o título a cada rodada (medido: "Mostra
     * de Ciência e Tecnologia da UTFPR" → "Feira de Ciências e Tecnologia da
     * UTFPR", Jaccard 0,33) e às vezes muda também a data estimada — então o
     * evento escapava. Aqui o assunto é comparado sem data.
     */
    const memoriaAssunto = buildRejectionMemory(jaConhecidos.map((k) => k.title));

    let descartadosPorHistorico = 0;
    const semRepeticao = candidatos.filter((s) => {
      // Mesmo assunto (sem considerar data) de algo já decidido: fora.
      if (colideComMemoria(s.title, memoriaAssunto)) {
        descartadosPorHistorico++;
        return false;
      }

      const repetido = jaConhecidos.some((k) =>
        mesmoEvento(s, {
          title: k.title,
          day: Number(k.day),
          month: Number(k.month),
          year: Number(k.year),
          city: k.city,
        })
      );
      if (repetido) descartadosPorHistorico++;
      return !repetido;
    });

    // --- 5. Deduplicação entre fontes e entre candidatos desta rodada ---
    // Comparação semântica, não só fingerprint: o motor local e a IA podem
    // descrever o mesmo evento com títulos ligeiramente diferentes.
    const aceitos: typeof semRepeticao = [];
    let semDuplicatas = 0;
    for (const s of semRepeticao) {
      const duplicado = aceitos.some((a) => a.fingerprint === s.fingerprint || mesmoEvento(a, s));
      if (duplicado) {
        semDuplicatas++;
        continue;
      }
      aceitos.push(s);
    }
    /**
     * Saneamento final, na fronteira com o banco.
     *
     * Aplicado ao lote inteiro (motor local + IA) para que nenhuma fonte
     * derrube a inserção com uma coluna inventada.
     */
    const lote = aceitos
      .map((c) => sanearParaInsercao(c as Record<string, any>))
      .filter((c) => Object.keys(c).length > 0);

    if (lote.length === 0) {
      return respostaJson({
        success: true,
        inseridas: 0,
        descartadas,
        duplicatas: semDuplicatas,
        repetidas: descartadosPorHistorico,
        bloqueadas_por_conteudo: bloqueadosPorConteudo,
        fontes: fontesUsadas,
        provider: iaInfo?.provider ?? null,
        model: iaInfo?.model ?? null,
        aviso: avisoIa,
        falha_ia: falhaIa,
        message:
          descartadosPorHistorico > 0
            ? `Nenhuma sugestão inédita: ${descartadosPorHistorico} já havia sido avaliada antes e não voltam à fila.`
            : "Nenhuma sugestão válida encontrada nesta rodada.",
      });
    }

    // --- 5. Gravação ---
    //
    // NÃO usar `upsert({ onConflict: "fingerprint" })`.
    // O índice `idx_event_suggestions_fingerprint` é PARCIAL
    // (`WHERE fingerprint IS NOT NULL`), e o Postgres só aceita
    // `ON CONFLICT (coluna)` quando existe constraint completa na coluna:
    //
    //   ERROR: 42P10: there is no unique or exclusion constraint
    //   matching the ON CONFLICT specification
    //
    // A deduplicação já foi feita acima, em memória, comparando fingerprint
    // E similaridade semântica (`mesmoEvento`) — é mais rigorosa que o índice.
    // O insert simples é suficiente; se o índice parcial ainda barrar alguma
    // corrida, tratamos 23505 como duplicata em vez de derrubar a requisição.
    const { data: inseridas, error: insertError } = await serviceClient
      .from("event_suggestions")
      .insert(lote)
      .select("id");

    if (insertError) {
      const codigo = (insertError as any)?.code;
      const mensagem = String(insertError.message || "");

      // Corrida com outra execução: o índice parcial barrou um fingerprint
      // repetido. Não é falha para o usuário — só não entrou de novo.
      const ehDuplicata =
        codigo === "23505" ||
        codigo === "42P10" ||
        mensagem.includes("duplicate key") ||
        mensagem.includes("ON CONFLICT");

      /**
       * Coluna inexistente (PGRST204).
       *
       * Não deve acontecer depois do saneamento, mas se alguém adicionar um
       * campo novo ao motor local sem migração, a função precisa dizer o que
       * houve — em vez de devolver "500 Internal Server Error" e deixar o
       * admin sem pista (foi exatamente o que aconteceu com `is_school`).
       */
      const ehColunaInvalida =
        codigo === "PGRST204" || mensagem.includes("schema cache");

      if (ehColunaInvalida) {
        console.error(
          "[ai-event-scout] Insert rejeitado por coluna inexistente:",
          mensagem,
          "| colunas enviadas:",
          Object.keys(lote[0] ?? {}).join(", ")
        );
        return respostaJson(
          {
            success: false,
            inseridas: 0,
            error:
              "O banco recusou a gravação por uma coluna inexistente. " +
              "Isso é um problema de configuração do app, não seu. " +
              `Detalhe técnico: ${mensagem}`,
          },
          500
        );
      }

      if (ehDuplicata) {
        return respostaJson({
          success: true,
          inseridas: 0,
          descartadas,
          duplicadas: semDuplicatas + lote.length,
          repetidas: descartadosPorHistorico,
          bloqueadas_por_conteudo: bloqueadosPorConteudo,
          fontes: fontesUsadas,
          provider: iaInfo?.provider ?? null,
          model: iaInfo?.model ?? null,
          aviso: avisoIa,
          falha_ia: falhaIa,
          message:
            "Estas sugestões já estavam na fila ou já foram avaliadas antes e não voltam a aparecer.",
        });
      }

      return respostaJson({ error: insertError.message }, 500);
    }

    const totalInseridas = inseridas?.length ?? 0;
    const origemLocal = lote.filter((s) => s.origin === "local_engine").length;
    const origemIa = lote.filter((s) => s.origin === "ai").length;

    return respostaJson({
      success: true,
      inseridas: totalInseridas,
      descartadas,
      duplicadas: semDuplicatas,
      repetidas: descartadosPorHistorico,
      bloqueadas_por_conteudo: bloqueadosPorConteudo,
      fontes: fontesUsadas,
      provider: iaInfo?.provider ?? null,
      model: iaInfo?.model ?? null,
      resumo: { local_engine: origemLocal, ai: origemIa },
      aviso: avisoIa,
      falha_ia: falhaIa,
      message:
        totalInseridas > 0
          ? `${totalInseridas} sugestão(ões) adicionada(s) para revisão.`
          : "Nenhuma sugestão nova: os eventos recorrentes já estão na lista.",
    });
  } catch (err) {
    return respostaJson({ error: String((err as any)?.message ?? err) }, 500);
  }
});
