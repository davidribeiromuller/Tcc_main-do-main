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

import { createClient } from "jsr:@supabase/supabase-js@2";
import { runLocalEventEngine } from "./local_engine.ts";

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

Sua tarefa: propor até ${count} eventos ESCOLARES reais e verificáveis que
acontecerão nos próximos 12 meses (nunca no passado) e que sejam relevantes
para estudantes do ensino fundamental II e médio.

Priorize:
- Feiras de profissões, feiras de cursos e mostras vocacionais
- Olimpíadas do conhecimento (OBMEP, OBI, ONHB, MOBFOG) e competições estudantis
- Feiras de ciências, tecnologia, robótica e inovação
- Eventos culturais, artísticos e esportivos escolares
- Processos seletivos e vestibulares de instituições da região

${focus ? `Foco adicional pedido pelo administrador: ${focus}` : ""}

Regras obrigatórias:
- "month" é 0-indexado (0 = janeiro, 11 = dezembro).
- Datas devem estar no futuro em relação a hoje.
- "city" deve ser exatamente "Araucária" ou "Curitiba".
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
    defaultModel: "gemini-2.5-flash",
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
    defaultModel: "google/gemini-2.0-flash-001",
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

    if (provedor) {
      try {
        const { def, apiKey } = provedor;
        const model = (Deno.env.get("AI_MODEL") || "").trim() || def.defaultModel;

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

          candidatos.push({
            title: String(s.title).slice(0, 200),
            description: s.description ?? null,
            location: s.location ?? null,
            address: s.address ?? null,
            city: s.city === "Curitiba" ? "Curitiba" : "Araucária",
            category: s.category ?? null,
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
        avisoIa = `A IA (${provedor.def.label}) falhou: ${String(
          (err as any)?.message ?? err
        ).slice(0, 200)}. As sugestões do motor local foram mantidas.`;
      }
    } else {
      avisoIa =
        "Nenhuma IA configurada — usando apenas o motor local. " +
        "Para ativar a descoberta de eventos inéditos, adicione GEMINI_API_KEY, " +
        "ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY ou GROQ_API_KEY " +
        "em Supabase → Edge Functions → Secrets.";
    }

    // --- 4. Deduplicação entre fontes ---
    // O motor local tem prioridade quando o mesmo evento aparece nas duas.
    const vistos = new Set<string>();
    const lote = candidatos.filter((s) => {
      if (vistos.has(s.fingerprint)) return false;
      vistos.add(s.fingerprint);
      return true;
    });

    const semDuplicatas = candidatos.length - lote.length;

    if (lote.length === 0) {
      return respostaJson({
        success: true,
        inseridas: 0,
        descartadas,
        fontes: fontesUsadas,
        provider: iaInfo?.provider ?? null,
        model: iaInfo?.model ?? null,
        aviso: avisoIa,
        message: "Nenhuma sugestão válida encontrada nesta rodada.",
      });
    }

    // --- 5. Gravação (ignora duplicatas por fingerprint) ---
    const { data: inseridas, error: insertError } = await serviceClient
      .from("event_suggestions")
      .upsert(lote, { onConflict: "fingerprint", ignoreDuplicates: true })
      .select("id");

    if (insertError) {
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
      fontes: fontesUsadas,
      provider: iaInfo?.provider ?? null,
      model: iaInfo?.model ?? null,
      resumo: { local_engine: origemLocal, ai: origemIa },
      aviso: avisoIa,
      message:
        totalInseridas > 0
          ? `${totalInseridas} sugestão(ões) adicionada(s) para revisão.`
          : "Nenhuma sugestão nova: os eventos recorrentes já estão na lista.",
    });
  } catch (err) {
    return respostaJson({ error: String((err as any)?.message ?? err) }, 500);
  }
});
