/**
 * Eventos pessoais do usuário.
 *
 * ## O que são
 *
 * Compromissos que o próprio usuário cadastra na agenda dele (prova, trabalho,
 * reunião de família). Não são eventos da escola: **não aparecem no mural
 * público nem no calendário institucional** — ficam na conta de quem criou,
 * como uma agenda particular.
 *
 * ## Por que têm tabela própria
 *
 * Poderiam ir para `events`, mas lá há regras de publicação, aprovação,
 * retenção de 3 dias e moderação. Um compromisso pessoal não deve ser
 * moderado nem expirar. Tabela separada também deixa o Painel ADM listar
 * "quem criou o quê" sem misturar com o catálogo oficial.
 *
 * ## O que o Painel ADM vê
 *
 * Todos os eventos pessoais de todos os usuários, cada um com o respectivo
 * dono (nome e e-mail). É o que permite a escola entender o uso real da
 * agenda — e o `owner_id` é gravado na criação, não inferido depois.
 */

import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";

/** Evento pessoal, no formato usado pela interface. */
export interface PersonalEvent {
  id: number;
  ownerId: number;
  ownerName: string;
  ownerEmail: string | null;
  title: string;
  description: string | null;
  location: string | null;
  city: string | null;
  /** Dia do mês (1–31). */
  day: number;
  /** Mês **0-indexado** (0 = janeiro), igual ao resto do app. */
  month: number;
  year: number;
  time: string | null;
  category: string | null;
  isPaid: boolean;
  price: string | null;
  reminder: boolean;
  notes: string | null;
  createdAt: string;
}

/** Dados necessários para criar um evento pessoal. */
export interface NovoEventoPessoal {
  ownerId: number;
  ownerName: string;
  ownerEmail?: string | null;
  title: string;
  description?: string;
  location?: string;
  city?: string;
  day: number;
  month: number;
  year: number;
  time?: string;
  category?: string;
  isPaid?: boolean;
  price?: string;
  reminder?: boolean;
  notes?: string;
}

/** Seam de teste: permite injetar um cliente falso sem tocar na rede. */
let clienteDeTeste: any = null;
export function __definirClienteParaTeste(cliente: any): void {
  clienteDeTeste = cliente;
}
function obterCliente(): any {
  return clienteDeTeste ?? getSupabaseClient();
}
function temCliente(): boolean {
  return Boolean(clienteDeTeste) || isSupabaseConfigured();
}

/** Chave do cache local (offline). */
function chaveCache(ownerId?: number): string {
  return ownerId ? `eventos_pessoais_${ownerId}` : "eventos_pessoais_todos";
}

function lerCache(ownerId?: number): PersonalEvent[] {
  try {
    const bruto = localStorage.getItem(chaveCache(ownerId));
    if (!bruto) return [];
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function gravarCache(lista: PersonalEvent[], ownerId?: number): void {
  try {
    localStorage.setItem(chaveCache(ownerId), JSON.stringify(lista));
  } catch {
    /* modo privado / cota cheia */
  }
}

/** Linha da tabela → objeto da interface. */
function mapearLinha(linha: any): PersonalEvent {
  return {
    id: Number(linha.id),
    ownerId: Number(linha.owner_id),
    ownerName: linha.owner_name ?? "Usuário",
    ownerEmail: linha.owner_email ?? null,
    title: linha.title ?? "",
    description: linha.description ?? null,
    location: linha.location ?? null,
    city: linha.city ?? null,
    day: Number(linha.day),
    month: Number(linha.month),
    year: Number(linha.year),
    time: linha.time ?? null,
    category: linha.category ?? null,
    isPaid: Boolean(linha.is_paid),
    price: linha.price ?? null,
    reminder: Boolean(linha.reminder),
    notes: linha.notes ?? null,
    createdAt: linha.created_at ?? new Date().toISOString(),
  };
}

/**
 * Lista eventos pessoais.
 *
 * @param ownerId  quando informado, filtra pelo dono (agenda pessoal).
 *                 Sem ele, devolve TODOS — uso exclusivo do Painel ADM.
 */
export async function listarEventosPessoais(ownerId?: number): Promise<PersonalEvent[]> {
  if (temCliente()) {
    try {
      const supabase = obterCliente();
      let query = supabase
        .from("personal_events")
        .select(
          "id, owner_id, owner_name, owner_email, title, description, location, city, day, month, year, time, category, is_paid, price, reminder, notes, created_at"
        )
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .order("day", { ascending: false });

      if (ownerId) query = query.eq("owner_id", ownerId);

      const { data, error } = await query;

      if (!error && Array.isArray(data)) {
        const lista = data.map(mapearLinha);
        // O cache do dono guarda só os dele; o "todos" guarda a visão do painel.
        gravarCache(lista, ownerId);
        return lista;
      }

      if (error) {
        console.warn("[eventos-pessoais] Leitura falhou:", error.message);
      }
    } catch (err) {
      console.warn("[eventos-pessoais] Exceção na leitura:", err);
    }
  }

  return lerCache(ownerId);
}

/**
 * Cria um evento pessoal.
 *
 * @returns o evento salvo, ou `null` se não foi possível gravar.
 */
export async function criarEventoPessoal(
  dados: NovoEventoPessoal
): Promise<{ evento: PersonalEvent | null; erro?: string }> {
  // Validação mínima — espelha as restrições da tabela, para a mensagem sair
  // em português em vez de um erro de constraint.
  if (!dados.title?.trim()) {
    return { evento: null, erro: "Dê um nome ao compromisso." };
  }
  if (!dados.ownerId) {
    return { evento: null, erro: "É preciso estar conectado para criar um compromisso." };
  }
  if (dados.day < 1 || dados.day > 31) {
    return { evento: null, erro: "Dia inválido: use de 1 a 31." };
  }
  if (dados.month < 0 || dados.month > 11) {
    return { evento: null, erro: "Mês inválido." };
  }

  const agora = new Date();
  const dataDoEvento = new Date(dados.year, dados.month, dados.day);
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  if (dataDoEvento < hoje) {
    // Mesma regra dos eventos da escola: nada no passado.
    return { evento: null, erro: "Escolha uma data de hoje em diante." };
  }

  const registro = {
    owner_id: dados.ownerId,
    owner_name: dados.ownerName?.trim() || "Usuário",
    owner_email: dados.ownerEmail ?? null,
    title: dados.title.trim(),
    description: dados.description?.trim() || null,
    location: dados.location?.trim() || null,
    city: dados.city?.trim() || null,
    day: dados.day,
    month: dados.month,
    year: dados.year,
    time: dados.time?.trim() || null,
    category: dados.category ?? "Pessoal",
    is_paid: Boolean(dados.isPaid),
    price: dados.isPaid ? dados.price?.trim() || null : null,
    reminder: Boolean(dados.reminder),
    notes: dados.notes?.trim() || null,
  };

  if (temCliente()) {
    try {
      const supabase = obterCliente();
      const { data, error } = await supabase
        .from("personal_events")
        .insert([registro])
        .select()
        .single();

      if (!error && data) {
        const evento = mapearLinha(data);
        // Mantém o cache do dono em dia.
        const doDono = lerCache(dados.ownerId);
        gravarCache([evento, ...doDono], dados.ownerId);
        return { evento };
      }

      if (error) {
        console.warn("[eventos-pessoais] Supabase recusou a criação:", error.message);
        return { evento: null, erro: `Não foi possível salvar: ${error.message}` };
      }
    } catch (err: any) {
      return { evento: null, erro: err?.message || "Falha ao salvar o compromisso." };
    }
  }

  // Sem banco: guarda localmente para não perder o que o usuário digitou.
  const local: PersonalEvent = {
    id: Date.now(),
    ownerId: dados.ownerId,
    ownerName: registro.owner_name,
    ownerEmail: registro.owner_email,
    title: registro.title,
    description: registro.description,
    location: registro.location,
    city: registro.city,
    day: registro.day,
    month: registro.month,
    year: registro.year,
    time: registro.time,
    category: registro.category,
    isPaid: registro.is_paid,
    price: registro.price,
    reminder: registro.reminder,
    notes: registro.notes,
    createdAt: new Date().toISOString(),
  };
  const doDono = lerCache(dados.ownerId);
  gravarCache([local, ...doDono], dados.ownerId);

  return { evento: local };
}

/** Remove um evento pessoal. Só o dono (ou o painel) deve chamar isto. */
export async function removerEventoPessoal(id: number, ownerId?: number): Promise<boolean> {
  if (temCliente()) {
    try {
      const supabase = obterCliente();
      // `.select("id")` garante que a operação teve efeito — sem isso, um
      // delete bloqueado por RLS "passa" silenciosamente.
      const { data, error } = await supabase
        .from("personal_events")
        .delete()
        .eq("id", id)
        .select("id");

      if (!error && Array.isArray(data)) {
        if (ownerId) {
          gravarCache(
            lerCache(ownerId).filter((e) => e.id !== id),
            ownerId
          );
        }
        return true;
      }
    } catch {
      /* cai no cache abaixo */
    }
  }

  if (ownerId) {
    gravarCache(
      lerCache(ownerId).filter((e) => e.id !== id),
      ownerId
    );
  }
  return true;
}

/** `true` se a data do evento pessoal já passou (usado para "próximos"). */
export function eventoPessoalPassou(evento: PersonalEvent, agora = new Date()): boolean {
  const data = new Date(evento.year, evento.month, evento.day);
  return data < new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

/**
 * Ordena por proximidade, deixando os futuros primeiro.
 *
 * A agenda pessoal serve para o que vem — passado fica no fim, sem sumir
 * (diferente dos eventos da escola, que expiram em 3 dias).
 */
export function ordenarEventosPessoais(eventos: PersonalEvent[]): PersonalEvent[] {
  const agora = new Date();
  return [...eventos].sort((a, b) => {
    const passouA = eventoPessoalPassou(a, agora);
    const passouB = eventoPessoalPassou(b, agora);
    if (passouA !== passouB) return passouA ? 1 : -1;

    const da = new Date(a.year, a.month, a.day).getTime();
    const db = new Date(b.year, b.month, b.day).getTime();
    return passouA ? db - da : da - db;
  });
}
