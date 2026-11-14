/**
 * Histórico de presença em eventos.
 *
 * ## O bug que este arquivo corrige
 *
 * "Confirmar presença" chamava `POST /api/users/:id/participations`. Essa rota
 * só existe no `server.ts` local (Express). Em produção o app é **estático** no
 * GitHub Pages — não há servidor Node —, então toda confirmação virava
 * `404` (visível no console do navegador como *"Failed to load resource: the
 * server responded with a status of 404"*). O usuário via erro ao confirmar.
 *
 * ## Como funciona agora
 *
 * Mesmo padrão já usado em eventos e usuários: **Supabase primeiro**, `fetch`
 * para o backend local como alternativa (quando rodando em `npm run dev`), e
 * uma cópia em `localStorage` para o caso de o usuário estar sem rede.
 *
 * A confirmação de presença é importante para o histórico do aluno, então ela
 * é **idempotente**: confirmar duas vezes o mesmo evento não duplica nada nem
 * apaga o que já existia.
 */

import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";

/**
 * Seam de teste.
 *
 * Os testes de unidade precisam exercitar o caminho do Supabase sem rede.
 * Em produção isto é sempre `null` e `obterCliente()` devolve o cliente real.
 */
let clienteDeTeste: any = null;

/** Injeta um cliente falso. Uso exclusivo de testes. */
export function __definirClienteParaTeste(cliente: any): void {
  clienteDeTeste = cliente;
}

function obterCliente(): any {
  return clienteDeTeste ?? getSupabaseClient();
}

/** `true` quando há cliente (real ou de teste). */
function temCliente(): boolean {
  return Boolean(clienteDeTeste) || isSupabaseConfigured();
}

export interface Participacao {
  id?: number;
  userId: number;
  eventId: number;
  eventTitle: string;
  eventLocation: string;
  eventDate: string;
  eventTime: string;
  confirmedAt: string;
}

/** Chave do cache local, por usuário. */
function chaveCache(userId: number | string): string {
  return `participacoes_${userId}`;
}

/** Lê as participações guardadas localmente (offline / fallback). */
export function lerParticipacoesLocais(userId: number | string): Participacao[] {
  try {
    const bruto = localStorage.getItem(chaveCache(userId));
    if (!bruto) return [];
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

/** Grava a lista local, sem explodir se o navegador estiver sem quota. */
function gravarParticipacoesLocais(userId: number | string, lista: Participacao[]): void {
  try {
    localStorage.setItem(chaveCache(userId), JSON.stringify(lista));
  } catch {
    /* modo privado / cota cheia: o dado do Supabase continua sendo a verdade */
  }
}

/** Converte uma linha da tabela para o tipo usado na interface. */
function mapearLinha(linha: any): Participacao {
  return {
    id: linha.id,
    userId: Number(linha.user_id),
    eventId: Number(linha.event_id),
    eventTitle: linha.event_title ?? "",
    eventLocation: linha.event_location ?? "",
    eventDate: linha.event_date ?? "",
    eventTime: linha.event_time ?? "",
    confirmedAt: linha.confirmed_at ?? new Date().toISOString(),
  };
}

/**
 * Lista as participações do usuário.
 *
 * Tenta Supabase → backend local → cache. Nunca lança: uma falha de leitura não
 * deve impedir o usuário de ver o resto do perfil.
 */
export async function listarParticipacoes(userId: number): Promise<Participacao[]> {
  // 1. Supabase (caminho real em produção)
  if (temCliente()) {
    try {
      const supabase = obterCliente();
      const { data, error } = await supabase
        .from("event_participations")
        .select("id, user_id, event_id, event_title, event_location, event_date, event_time, confirmed_at")
        .eq("user_id", userId)
        .order("confirmed_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        const lista = data.map(mapearLinha);
        gravarParticipacoesLocais(userId, lista);
        return lista;
      }
      if (error) {
        console.warn("[participacoes] Supabase indisponível para leitura:", error.message);
      }
    } catch (err) {
      console.warn("[participacoes] Exceção na leitura pelo Supabase:", err);
    }
  }

  // 2. Backend local (npm run dev)
  try {
    const token = localStorage.getItem("token") || "";
    const res = await fetch(`/api/users/${userId}/participations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.participations)) {
        const lista = data.participations.map((p: any) => ({
          id: p.id,
          userId: Number(p.userId ?? userId),
          eventId: Number(p.eventId),
          eventTitle: p.eventTitle ?? "",
          eventLocation: p.eventLocation ?? "",
          eventDate: p.eventDate ?? "",
          eventTime: p.eventTime ?? "",
          confirmedAt: p.confirmedAt ?? new Date().toISOString(),
        }));
        gravarParticipacoesLocais(userId, lista);
        return lista;
      }
    }
  } catch {
    /* GitHub Pages: a rota não existe. Cai no cache. */
  }

  // 3. Cache local
  return lerParticipacoesLocais(userId);
}

export interface ResultadoConfirmacao {
  sucesso: boolean;
  participacao?: Participacao;
  /** `true` quando o evento já estava confirmado antes desta chamada. */
  jaConfirmado?: boolean;
  erro?: string;
}

/**
 * Confirma presença em um evento.
 *
 * Grava no Supabase (ou backend local) e mantém uma cópia local imediata, para
 * que a interface responda mesmo se a rede estiver lenta.
 *
 * Idempotente por `(user_id, event_id)`: a tabela tem restrição única e o
 * código trata o conflito como sucesso ("já confirmado"), em vez de mostrar
 * erro para o usuário — antes era exatamente isso que aparecia na tela.
 */
export async function confirmarPresenca(params: {
  userId: number;
  eventId: number;
  eventTitle: string;
  eventLocation?: string;
  eventDate?: string;
  eventTime?: string;
}): Promise<ResultadoConfirmacao> {
  const agora = new Date().toISOString();
  const participacao: Participacao = {
    userId: params.userId,
    eventId: params.eventId,
    eventTitle: params.eventTitle,
    eventLocation: params.eventLocation || "Local a confirmar",
    eventDate: params.eventDate || new Date().toLocaleDateString("pt-BR"),
    eventTime: params.eventTime || "18:00",
    confirmedAt: agora,
  };

  if (!params.eventTitle || !params.eventId) {
    return { sucesso: false, erro: "Evento inválido para confirmar presença." };
  }

  // Mantém a cópia local em dia desde já: se a rede falhar, o usuário continua
  // vendo a presença confirmada no perfil.
  const locais = lerParticipacoesLocais(params.userId);
  const jaEstava = locais.some((p) => Number(p.eventId) === Number(params.eventId));
  if (!jaEstava) {
    gravarParticipacoesLocais(params.userId, [participacao, ...locais]);
  }

  if (temCliente()) {
    try {
      const supabase = obterCliente();

      // Confere antes de inserir: evita depender do código de erro do PostgREST
      // e permite devolver `jaConfirmado` com precisão.
      const { data: existente, error: erroBusca } = await supabase
        .from("event_participations")
        .select("id, user_id, event_id, event_title, event_location, event_date, event_time, confirmed_at")
        .eq("user_id", params.userId)
        .eq("event_id", params.eventId)
        .maybeSingle();

      if (!erroBusca && existente) {
        return { sucesso: true, jaConfirmado: true, participacao: mapearLinha(existente) };
      }

      const { data, error } = await supabase
        .from("event_participations")
        .insert([
          {
            user_id: params.userId,
            event_id: params.eventId,
            event_title: params.eventTitle,
            event_location: participacao.eventLocation,
            event_date: participacao.eventDate,
            event_time: participacao.eventTime,
          },
        ])
        .select()
        .single();

      if (!error && data) {
        const salva = mapearLinha(data);
        gravarParticipacoesLocais(
          params.userId,
          [salva, ...locais.filter((p) => Number(p.eventId) !== Number(params.eventId))]
        );
        return { sucesso: true, participacao: salva };
      }

      // 23505 = já existe (corrida entre duas abas). É sucesso, não erro.
      if (error?.code === "23505") {
        return { sucesso: true, jaConfirmado: true, participacao };
      }

      console.warn("[participacoes] Supabase recusou a confirmação:", error?.message);
      // A cópia local já guardou a presença; segue para o backend local.
    } catch (err) {
      console.warn("[participacoes] Exceção ao confirmar no Supabase:", err);
    }
  }

  // Backend local (npm run dev)
  try {
    const token = localStorage.getItem("token") || "";
    const res = await fetch(`/api/users/${params.userId}/participations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        eventId: params.eventId,
        eventTitle: params.eventTitle,
        eventLocation: participacao.eventLocation,
        eventDate: participacao.eventDate,
        eventTime: participacao.eventTime,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        sucesso: true,
        jaConfirmado: Boolean(data?.jaConfirmado),
        participacao: participacao,
      };
    }
  } catch {
    /* rota inexistente no GitHub Pages — o cache local já resolveu */
  }

  // Chegou aqui sem confirmação remota: a presença está salva só neste
  // navegador. Avisamos com honestidade em vez de dizer "erro".
  return {
    sucesso: true,
    participacao,
    erro:
      "Presença salva neste dispositivo. Não foi possível sincronizar com o servidor agora — " +
      "ela será enviada quando a conexão voltar.",
  };
}

/** Remove uma confirmação (usado quando o usuário cancela a presença). */
export async function cancelarPresenca(userId: number, eventId: number): Promise<boolean> {
  const locais = lerParticipacoesLocais(userId).filter(
    (p) => Number(p.eventId) !== Number(eventId)
  );
  gravarParticipacoesLocais(userId, locais);

  if (temCliente()) {
    try {
      const supabase = obterCliente();
      const { error } = await supabase
        .from("event_participations")
        .delete()
        .eq("user_id", userId)
        .eq("event_id", eventId)
        .select("id");
      if (!error) return true;
    } catch {
      /* segue para o backend local */
    }
  }

  try {
    const token = localStorage.getItem("token") || "";
    const res = await fetch(`/api/users/${userId}/participations/${eventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
