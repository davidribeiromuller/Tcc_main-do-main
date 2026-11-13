// ============================================================
// ARQUIVO GERADO POR scripts/bundle-edge-function.mjs
// Não edite: altere index.ts / local_engine.ts / eventClassification.ts
// e rode `npm run bundle:edge`.
// ============================================================

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
// Reaproveita a mesma regra do app (src/lib/eventClassification.ts).
// Duplicar as listas aqui já causou conflito de símbolo no bundle.

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
function buildPrompt(count: number, focus?: string): string {
  const hoje = new Date().toISOString().slice(0, 10);
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

    // ---------- 3a. Motor local (sem chave) ----------
    const locais = runLocalEventEngine({ referenceDate: agora, limit: count });
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

        const resultado = await chamarModelo(def, apiKey, model, buildPrompt(count, focus));
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

    let descartadosPorHistorico = 0;
    const semRepeticao = candidatos.filter((s) => {
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
    const lote = aceitos;

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

// ---- embutido de eventClassification.ts ----
/**
 * Classificação de eventos por localidade, tipo e conteúdo.
 *
 * Decisões de produto (Rodada 5):
 * - A IA e o motor local buscam eventos de **Curitiba** e **Araucária**.
 * - O app separa eventos **escolares** de **não escolares**. "Não escolar" traz
 *   eventos abertos ao público das duas cidades (vestibular, feira de profissões,
 *   mostra cultural). O foco escolar fica na home.
 * - **Balada, rave, festa e show não são permitidos.** O bloqueio é feito aqui,
 *   de forma determinística: um prompt de IA não é garantia.
 */

const CIDADES_SUPORTADAS = ["Araucária", "Curitiba"] as const;
type CidadeSuportada = (typeof CIDADES_SUPORTADAS)[number];

/** Remove acentos e normaliza para comparação. */
function norm(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Descobre a cidade de um evento.
 *
 * Aceita cidade explícita; se não houver, tenta inferir pelo texto (local,
 * endereço, título). Retorna `null` quando não é possível afirmar — jamais
 * assume uma cidade padrão, para não gravar dado errado.
 */
function resolveEventCity(input: {
  city?: string | null;
  location?: string | null;
  address?: string | null;
  title?: string | null;
}): CidadeSuportada | null {
  const explicita = norm(input.city);
  if (explicita.includes("curitiba")) return "Curitiba";
  if (explicita.includes("araucaria")) return "Araucária";

  const texto = norm([input.location, input.address, input.title].filter(Boolean).join(" "));
  if (!texto) return null;

  // Araucária primeiro: "Araucária" nunca aparece em endereço de Curitiba,
  // mas muitos endereços de Araucária citam Curitiba na região metropolitana.
  if (texto.includes("araucaria")) return "Araucária";
  if (texto.includes("curitiba")) return "Curitiba";
  return null;
}

/**
 * Marcadores de evento escolar. Se qualquer um aparecer no texto, o evento é
 * tratado como escolar — a menos que haja marcação explícita em contrário.
 */
const MARCADORES_ESCOLAR = [
  "escolar",
  "escola",
  "colegio",
  "colégio",
  "estudante",
  "aluno",
  "olimpiada",
  "olimpíada",
  "obmep",
  "obmep",
  "mobfog",
  "onhb",
  "obi ",
  "vestibular",
  "feira de profiss",
  "feira de cursos",
  "feira de ciencia",
  "feira de ciência",
  "mostra de inovacao",
  "mostra de inovação",
  "jeps",
  "jogos escolares",
  "professor",
  "educacao",
  "educação",
  "universidade",
  "faculdade",
  "campus",
  "processo seletivo",
  "enem",
  "robotica",
  "robótica",
];

/**
 * Classifica o evento como escolar ou não escolar.
 *
 * Prioridade: categoria explícita ("Escolar"/"Acadêmico") > marcadores no texto.
 * Sem evidência, considera **não escolar** (aberto ao público), que é a leitura
 * conservadora: nada entra na vitrine escolar sem justificativa.
 */
function classifyEventAsSchool(input: {
  isSchool?: boolean | null;
  category?: string | null;
  title?: string | null;
  description?: string | null;
  schoolName?: string | null;
  location?: string | null;
}): boolean {
  if (typeof input.isSchool === "boolean") return input.isSchool;

  const categoria = norm(input.category);
  if (categoria === "escolar" || categoria === "academico" || categoria === "educacao") return true;
  if (categoria === "cultural" || categoria === "esporte" || categoria === "esportivo") return false;

  if (input.schoolName && norm(input.schoolName).length > 0) return true;

  const texto = norm(
    [input.title, input.description, input.category, input.location].filter(Boolean).join(" ")
  );
  return MARCADORES_ESCOLAR.some((m) => texto.includes(norm(m)));
}

/**
 * Termos que caracterizam conteúdo não permitido no app escolar.
 * Inclui variações no singular/plural e gírias comuns em cartazes.
 */
const TERMOS_PROIBIDOS = [
  "balada",
  "rave",
  "boate",
  "night club",
  "nightclub",
  "open bar",
  "openbar",
  "cerveja",
  "cervejada",
  "happy hour",
  "festival de musica",
  "show",
  "shows",
  "concerto",
  "turnê",
  "turne",
  "line-up",
  "lineup",
  "dj ",
  "festa",
  "festinha",
  "micareta",
  "carnaval",
  "oktoberfest",
  "pegação",
  "pegacao",
  "bebida",
  "alcool",
  "álcool",
  "drinks",
  "lual",
  "sarau reggae",
];

/**
 * Exceções: expressões legítimas que contêm um termo proibido por substring.
 * Ex.: "Festa Junina" e "Mostra de Dança" são eventos escolares clássicos.
 */
const EXCECOES_PERMITIDAS = [
  "festa junina",
  "festa julina",
  "festa da familia",
  "festa da família",
  "festa junina escolar",
  "festival de danca",
  "festival de dança",
  "festival estudantil",
  "festival de talentos",
  "festival de cinema",
  "festival de teatro",
  "mostra de danca",
  "mostra de dança",
  "show de talentos",
  "show de ciencias",
  "show de ciências",
  "feira de ciencias",
  "feira de ciências",
];

interface ResultadoConteudo {
  proibido: boolean;
  termo?: string;
  motivo?: string;
}

/**
 * Verifica se o evento é balada, rave, festa ou show — conteúdo não permitido.
 *
 * A checagem roda sobre título, descrição, categoria e requisitos, porque é
 * nesses campos que a IA descreve o evento.
 */
function detectForbiddenContent(input: {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  requirements?: string | null;
}): ResultadoConteudo {
  const texto = norm(
    [input.title, input.description, input.category, input.requirements]
      .filter(Boolean)
      .join(" ")
  );
  if (!texto) return { proibido: false };

  // Duas exceções podem coexistir no mesmo título: "Festa Junina + Show de Talentos".
  let base = texto;
  for (const excecao of EXCECOES_PERMITIDAS) {
    base = base.split(norm(excecao)).join(" ");
  }

  for (const termo of TERMOS_PROIBIDOS) {
    const alvo = norm(termo);
    // "show"/"festa" exigem limite de palavra para não casar em "showcase".
    const padrao = new RegExp(`(^|[^a-z])${alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`);
    if (padrao.test(base)) {
      return {
        proibido: true,
        termo: termo.trim(),
        motivo: `Conteúdo não permitido em app escolar: "${termo.trim()}".`,
      };
    }
  }

  return { proibido: false };
}

/** Formata a cidade para exibição, com fallback honesto. */
function formatEventCity(city: string | null | undefined): string {
  const resolvida = resolveEventCity({ city });
  return resolvida || "Local não informado";
}

// ---- embutido de local_engine.ts ----
// GERADO AUTOMATICAMENTE — não editar à mão.
//
// Cópia standalone do motor local de eventos para uso dentro da Edge Function
// (Deno), que não pode importar arquivos de `src/`.
//
// Fonte de verdade:
//   src/lib/localEventCatalog.ts
//   src/lib/localEventEngine.ts
//
// Para atualizar: rode `npm run sync:local-engine`.

/**
 * Base de conhecimento do motor local de eventos.
 *
 * Cada entrada descreve um evento ESCOLAR que se repete todo ano e cuja data
 * pode ser calculada a partir de uma regra conhecida.
 *
 * IMPORTANTE — honestidade sobre precisão:
 * O motor NÃO acessa a internet. Ele calcula datas a partir de padrões anuais.
 * Uma data calculada é uma ESTIMATIVA. Sempre que houver dúvida, a entrada
 * vem marcada com `estimated: true` e o admin deve confirmar na fonte oficial
 * antes de publicar.
 */

type EventCategory =
  | "Olimpíada"
  | "Feira de Profissões"
  | "Vestibular"
  | "Cultural"
  | "Esportivo"
  | "Tecnologia";

type DateRule =
  /** Dia fixo de um mês fixo. Ex.: 15 de junho. */
  | { kind: "fixed"; month: number; day: number; time?: string }
  /**
   * Uma ou mais janelas de meses. Usado quando a data exata varia a cada ano.
   * Escolhe o primeiro dia do primeiro mês da janela como referência.
   */
  | { kind: "window"; months: number[]; day?: number; time?: string };

interface LocalEventTemplate {
  id: string;
  title: string;
  category: EventCategory;
  description: string;
  /** Cidade de referência para o filtro do app. */
  city: "Araucária" | "Curitiba";
  location: string;
  /** Página oficial usada pelo admin para conferir a data. */
  sourceName: string;
  sourceUrl: string;
  rule: DateRule;
  /**
   * Confiança-base (0–1). Datas `fixed` recorrentes recebem valor maior,
   * janelas recebem valor menor. Nunca acima de MAX_LOCAL_CONFIDENCE.
   */
  confidence: number;
  /**
   * true = a data é estimativa (janela de meses ou regra sujeita a mudança).
   * A interface exibe "Data estimada — confirme na fonte oficial".
   */
  estimated: boolean;
  requirements?: string;
  isPaid?: boolean;
  price?: string;
  website?: string;
}

/**
 * Teto de confiança do motor local. Fica abaixo do que a IA normalmente
 * atribui a uma data oficialmente divulgada, porque aqui a data é CALCULADA.
 */
const MAX_LOCAL_CONFIDENCE = 0.55;

/**
 * Catálogo de eventos recorrentes.
 *
 * Escopo amplo: acadêmico (olimpíadas, feiras, vestibulares) + cultural e
 * esportivo escolar.
 */
const LOCAL_EVENT_TEMPLATES: LocalEventTemplate[] = [
  // ───────────────────────── Olimpíadas ─────────────────────────
  {
    id: "obmep-fase1",
    title: "OBMEP — 1ª Fase (Olimpíada Brasileira de Matemática)",
    category: "Olimpíada",
    description:
      "Primeira fase da Olimpíada Brasileira de Matemática das Escolas Públicas, aplicada nas próprias escolas. Prova objetiva de 20 questões para estudantes do 6º ano do Fundamental ao Ensino Médio.",
    city: "Araucária",
    location: "Escolas participantes de Araucária",
    sourceName: "Site oficial da OBMEP",
    sourceUrl: "https://www.obmep.org.br/",
    rule: { kind: "window", months: [5, 6], day: 15, time: "08:00" },
    confidence: 0.5,
    estimated: true,
    requirements: "Estudantes do 6º ano do Fundamental ao 3º ano do Ensino Médio",
    isPaid: false,
  },
  {
    id: "obmep-fase2",
    title: "OBMEP — 2ª Fase",
    category: "Olimpíada",
    description:
      "Segunda fase da OBMEP, com prova discursiva de 6 questões aplicada nos centros de aplicação definidos pela organização.",
    city: "Curitiba",
    location: "Centros de aplicação definidos pela OBMEP",
    sourceName: "Site oficial da OBMEP",
    sourceUrl: "https://www.obmep.org.br/",
    rule: { kind: "window", months: [8, 9], day: 20, time: "14:00" },
    confidence: 0.45,
    estimated: true,
    requirements: "Classificados na 1ª fase",
    isPaid: false,
  },
  {
    id: "obi-fase1",
    title: "OBI — Olimpíada Brasileira de Informática (1ª Fase)",
    category: "Tecnologia",
    description:
      "Primeira fase da Olimpíada Brasileira de Informática, com provas de raciocínio computacional e programação. Realizada nas escolas inscritas.",
    city: "Araucária",
    location: "Escolas inscritas de Araucária",
    sourceName: "Site oficial da OBI",
    sourceUrl: "https://olimpiada.ic.unicamp.br/",
    rule: { kind: "window", months: [4, 5], day: 10, time: "14:00" },
    confidence: 0.45,
    estimated: true,
    requirements: "Estudantes do Fundamental II e Ensino Médio",
    isPaid: false,
  },
  {
    id: "onhb",
    title: "ONHB — Olimpíada Nacional em História do Brasil",
    category: "Olimpíada",
    description:
      "Olimpíada Nacional em História do Brasil, organizada pela Unicamp. Fases online em equipe ao longo do primeiro semestre, com prova final presencial.",
    city: "Curitiba",
    location: "Participação online + fase final presencial",
    sourceName: "Site oficial da ONHB",
    sourceUrl: "https://www.olimpiadadehistoria.com.br/",
    rule: { kind: "window", months: [3, 4], day: 5, time: "08:00" },
    confidence: 0.45,
    estimated: true,
    requirements: "Equipes de estudantes com professor orientador",
    isPaid: false,
  },
  {
    id: "mobfog",
    title: "MOBFOG — Mostra Brasileira de Foguetes",
    category: "Olimpíada",
    description:
      "Mostra Brasileira de Foguetes, com lançamentos feitos pelas equipes escolares. A escola organiza a etapa interna e envia os resultados.",
    city: "Araucária",
    location: "Escolas participantes de Araucária",
    sourceName: "Site oficial da MOBFOG",
    sourceUrl: "https://www.mobfog.com.br/",
    rule: { kind: "window", months: [4, 5], day: 12, time: "09:00" },
    confidence: 0.42,
    estimated: true,
    requirements: "Equipes de até 3 estudantes do Fundamental II e Médio",
    isPaid: false,
  },
  {
    id: "obq",
    title: "OBQ — Olimpíada Brasileira de Química",
    category: "Olimpíada",
    description:
      "Olimpíada Brasileira de Química, com fase inicial aplicada nas escolas e fases seguintes em centros regionais.",
    city: "Curitiba",
    location: "Escolas e centros regionais do Paraná",
    sourceName: "Site oficial da OBQ",
    sourceUrl: "https://obquimica.org/",
    rule: { kind: "window", months: [5, 6], day: 22, time: "14:00" },
    confidence: 0.42,
    estimated: true,
    requirements: "Estudantes do Ensino Médio",
    isPaid: false,
  },

  // ─────────────────────── Feiras e vestibulares ───────────────────────
  {
    id: "feira-cursos-ufpr",
    title: "Feira de Cursos e Profissões da UFPR",
    category: "Feira de Profissões",
    description:
      "Feira anual da Universidade Federal do Paraná que apresenta os cursos de graduação, com estandes, laboratórios abertos e conversa com alunos e professores.",
    city: "Curitiba",
    location: "Campus da UFPR — Jardim Botânico",
    sourceName: "Site oficial da UFPR",
    sourceUrl: "https://www.ufpr.br/portalufpr/",
    rule: { kind: "window", months: [7, 8], day: 20, time: "09:00" },
    confidence: 0.5,
    estimated: true,
    requirements: "Estudantes do Ensino Médio e comunidade",
    isPaid: false,
  },
  {
    id: "feira-cursos-utfpr",
    title: "Feira de Cursos da UTFPR",
    category: "Feira de Profissões",
    description:
      "Evento da Universidade Tecnológica Federal do Paraná com apresentação dos cursos de engenharia, tecnologia e licenciaturas, além de visitas aos laboratórios.",
    city: "Curitiba",
    location: "Campus Curitiba da UTFPR",
    sourceName: "Site oficial da UTFPR",
    sourceUrl: "https://www.utfpr.edu.br/",
    rule: { kind: "window", months: [8, 9], day: 15, time: "09:00" },
    confidence: 0.45,
    estimated: true,
    requirements: "Estudantes do Ensino Médio",
    isPaid: false,
  },
  {
    id: "vestibular-ufpr",
    title: "Vestibular UFPR — 1ª Fase",
    category: "Vestibular",
    description:
      "Primeira fase do processo seletivo da Universidade Federal do Paraná, com prova objetiva aplicada em Curitiba e no interior do estado.",
    city: "Curitiba",
    location: "Locais de prova definidos pela UFPR",
    sourceName: "Site oficial do vestibular UFPR",
    sourceUrl: "https://www.nc.ufpr.br/",
    rule: { kind: "window", months: [10, 11], day: 20, time: "13:30" },
    confidence: 0.45,
    estimated: true,
    requirements: "Inscritos no vestibular",
    isPaid: true,
    price: "Taxa de inscrição no site oficial",
  },

  // ─────────────────────────── Cultural ───────────────────────────
  {
    id: "mostra-cultural-escolar",
    title: "Mostra Cultural Escolar",
    category: "Cultural",
    description:
      "Mostra de trabalhos culturais das escolas municipais, com apresentações de teatro, música, dança e exposição de artes visuais produzidas pelos estudantes.",
    city: "Araucária",
    location: "Espaços culturais e escolas de Araucária",
    sourceName: "Calendário escolar municipal",
    sourceUrl: "https://www.araucaria.pr.gov.br/",
    rule: { kind: "window", months: [9, 10], day: 10, time: "19:00" },
    confidence: 0.35,
    estimated: true,
    requirements: "Comunidade escolar e familiares",
    isPaid: false,
  },
  {
    id: "festival-teatro-estudantil",
    title: "Festival de Teatro Estudantil",
    category: "Cultural",
    description:
      "Festival com peças produzidas por grupos teatrais de escolas do Paraná, incluindo oficinas e rodas de conversa com os estudantes.",
    city: "Curitiba",
    location: "Teatros e centros culturais de Curitiba",
    sourceName: "Agenda cultural do Paraná",
    sourceUrl: "https://www.cultura.pr.gov.br/",
    rule: { kind: "window", months: [8, 9], day: 25, time: "19:30" },
    confidence: 0.3,
    estimated: true,
    requirements: "Grupos teatrais escolares inscritos",
    isPaid: false,
  },

  // ─────────────────────────── Esportivo ───────────────────────────
  {
    id: "jeps",
    title: "JEPS — Jogos Escolares do Paraná",
    category: "Esportivo",
    description:
      "Jogos Escolares do Paraná, principal competição esportiva estudantil do estado, com fases municipais, regionais e finais em diversas modalidades.",
    city: "Araucária",
    location: "Ginásios e praças esportivas de Araucária",
    sourceName: "Site oficial dos JEPS",
    sourceUrl: "https://www.esportes.pr.gov.br/",
    rule: { kind: "window", months: [3, 4, 5], day: 20, time: "08:00" },
    confidence: 0.4,
    estimated: true,
    requirements: "Atletas estudantes das escolas inscritas",
    isPaid: false,
  },
  {
    id: "jogos-internos",
    title: "Jogos Internos da Escola",
    category: "Esportivo",
    description:
      "Competição esportiva interna entre turmas, com modalidades coletivas e individuais. Data definida pela coordenação de educação física de cada escola.",
    city: "Araucária",
    location: "Quadras e ginásio da escola",
    sourceName: "Calendário escolar interno",
    sourceUrl: "https://www.araucaria.pr.gov.br/",
    rule: { kind: "window", months: [8, 9], day: 5, time: "08:00" },
    confidence: 0.3,
    estimated: true,
    requirements: "Turmas da própria escola",
    isPaid: false,
  },
];


/**
 * Motor local de descoberta de eventos — funciona SEM chave de IA.
 *
 * Ele percorre o catálogo de eventos recorrentes (`localEventCatalog.ts`) e
 * calcula a próxima ocorrência de cada um a partir da regra de data, gerando
 * candidatos no mesmo formato usado pela IA.
 *
 * O que ele faz: cobre o calendário previsível (olimpíadas, feiras,
 * vestibulares, eventos culturais e esportivos recorrentes).
 * O que ele NÃO faz: descobrir eventos inéditos. Para isso existe a IA.
 *
 * Toda data calculada é uma ESTIMATIVA. A confiança fica limitada a
 * `MAX_LOCAL_CONFIDENCE` e as entradas marcadas como `estimated` aparecem
 * na interface com aviso para confirmar na fonte oficial.
 */


/** Candidato gerado pelo motor, no mesmo formato aceito por `event_suggestions`. */
interface LocalCandidate {
  title: string;
  description: string;
  location: string;
  address: string | null;
  city: "Araucária" | "Curitiba";
  category: string;
  school_name: string | null;
  /** true = evento escolar; false = aberto ao público. */
  is_school: boolean;
  day: number;
  month: number;
  year: number;
  time: string;
  is_paid: boolean;
  price: string | null;
  requirements: string | null;
  website: string | null;
  source_name: string;
  source_url: string;
  ai_confidence: number;
  ai_reasoning: string;
  fingerprint: string;
  status: "pending";
  /** Campos extras gravados na tabela (colunas da migration 0006). */
  origin: "local_engine";
  is_estimated: boolean;
}

/** Normaliza texto para comparação (sem acento, sem pontuação). */
function normalize(value: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Mesma regra usada pela Edge Function, para deduplicar entre as fontes. */
function buildFingerprint(input: {
  title: string;
  day: number;
  month: number;
  year: number;
  city?: string | null;
}): string {
  return `${normalize(input.title)}|${input.year}-${input.month}-${input.day}|${normalize(
    input.city || ""
  )}`;
}

/** Retorna o último dia válido do mês (evita 31/04 virar 01/05). */
function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, new Date(year, month + 1, 0).getDate());
}

/**
 * Calcula a próxima ocorrência futura de um template.
 *
 * Estratégia: tenta o ano atual; se a data já passou (com folga de 1 dia),
 * tenta o ano seguinte. Isso resolve a virada de ano — em dezembro, a OBMEP
 * de junho é projetada para o ano que vem.
 */
function computeNextOccurrence(
  template: LocalEventTemplate,
  referenceDate: Date = new Date()
): { day: number; month: number; year: number; time: string } | null {
  const anoAtual = referenceDate.getFullYear();
  const { rule } = template;

  // Margem de 1 dia: não sugerir evento que está acontecendo/terminando hoje.
  const limite = new Date(referenceDate.getTime());
  limite.setHours(0, 0, 0, 0);

  for (let offset = 0; offset <= 2; offset++) {
    const year = anoAtual + offset;

    if (rule.kind === "fixed") {
      const day = clampDay(year, rule.month, rule.day);
      const data = new Date(year, rule.month, day);
      if (data.getTime() > limite.getTime()) {
        return { day, month: rule.month, year, time: rule.time ?? "08:00" };
      }
    } else {
      // Janela de meses: usa o primeiro mês da janela como referência.
      const meses = [...rule.months].sort((a, b) => a - b);
      for (const month of meses) {
        const day = clampDay(year, month, rule.day ?? 15);
        const data = new Date(year, month, day);
        if (data.getTime() > limite.getTime()) {
          return { day, month, year, time: rule.time ?? "08:00" };
        }
      }
    }
  }

  return null;
}

/** Texto da justificativa exibida ao admin. */
function buildReasoning(template: LocalEventTemplate, data: {
  day: number;
  month: number;
  year: number;
}): string {
  const MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];

  const janela =
    template.rule.kind === "window"
      ? template.rule.months.map((m) => MESES[m]).join(" a ")
      : MESES[template.rule.month];

  if (template.estimated) {
    return (
      `Evento recorrente com realização prevista em ${janela}. ` +
      `Data estimada pelo motor local — confirme no site oficial antes de publicar.`
    );
  }

  return `Evento recorrente com data prevista em ${data.day} de ${MESES[data.month]}. Confirme na fonte oficial.`;
}

/**
 * Gera os candidatos do motor local.
 *
 * @param options.referenceDate data de referência (para testes)
 * @param options.cities       filtra cidades; vazio = todas
 * @param options.limit        máximo de sugestões
 */
function runLocalEventEngine(options?: {
  referenceDate?: Date;
  cities?: Array<"Araucária" | "Curitiba">;
  limit?: number;
}): LocalCandidate[] {
  const referenceDate = options?.referenceDate ?? new Date();
  const cities = options?.cities ?? [];
  const limit = options?.limit ?? 10;

  const candidatos: LocalCandidate[] = [];

  for (const template of LOCAL_EVENT_TEMPLATES) {
    if (cities.length > 0 && !cities.includes(template.city)) continue;

    // Balada, rave, festa e show não entram no catálogo do app escolar.
    if (
      detectForbiddenContent({
        title: template.title,
        description: template.description,
        category: template.category,
        requirements: template.requirements,
      }).proibido
    ) {
      continue;
    }

    const ocorrencia = computeNextOccurrence(template, referenceDate);
    if (!ocorrencia) continue;

    // Confiança nunca ultrapassa o teto do motor local.
    const confianca = Math.min(template.confidence, MAX_LOCAL_CONFIDENCE);

    candidatos.push({
      title: template.title,
      description: template.description,
      location: template.location,
      address: null,
      city: template.city,
      category: template.category,
      school_name: null,
      is_school: classifyEventAsSchool({
        category: template.category,
        title: template.title,
        description: template.description,
        location: template.location,
      }),
      day: ocorrencia.day,
      month: ocorrencia.month,
      year: ocorrencia.year,
      time: ocorrencia.time,
      is_paid: Boolean(template.isPaid),
      price: template.price ?? null,
      requirements: template.requirements ?? null,
      website: template.website ?? template.sourceUrl,
      source_name: template.sourceName,
      source_url: template.sourceUrl,
      ai_confidence: confianca,
      ai_reasoning: buildReasoning(template, ocorrencia),
      fingerprint: buildFingerprint({
        title: template.title,
        day: ocorrencia.day,
        month: ocorrencia.month,
        year: ocorrencia.year,
        city: template.city,
      }),
      status: "pending",
      origin: "local_engine",
      is_estimated: template.estimated,
    });
  }

  // Ordena por data (mais próximos primeiro) e respeita o limite.
  candidatos.sort((a, b) => {
    const da = new Date(a.year, a.month, a.day).getTime();
    const db = new Date(b.year, b.month, b.day).getTime();
    if (da !== db) return da - db;
    return a.title.localeCompare(b.title, "pt-BR");
  });

  return candidatos.slice(0, limit);
}
