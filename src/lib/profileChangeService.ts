import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";
import { fetchJsonApiWithAuth } from "./staticHosting.ts";
import { updateUserDirectInSupabase } from "./usersService.ts";
import type { User } from "../types.ts";
import { mensagemPrecisaServidor } from "./mensagensServidor.ts";

/**
 * Solicitações de alteração de perfil (rodada 25).
 * ---------------------------------------------------------------------------
 * Regra de negócio definida com o usuário:
 *
 *  - **Foto de perfil e telefone para contato** são livres: gravam na hora.
 *  - **Todo o resto** (nome, e-mail, CPF, data de nascimento, gênero,
 *    instituição e cargo/função) só muda depois que um **Funcionário ADM**
 *    aprova.
 *
 * Antes disso, "Salvar Perfil" chamava `PUT /api/users/profile` — um backend
 * Express que não existe no GitHub Pages. A chamada falhava, o estado era
 * revertido e o usuário via "Falha ao salvar perfil. O estado anterior foi
 * restaurado". Nada chegava ao Supabase.
 */

/** Campos que exigem aprovação de um ADM. */
export const CAMPOS_COM_APROVACAO = [
  "nome",
  "email",
  "cpf",
  "birthdate",
  "gender",
  "institution",
  "role",
] as const;

export type CampoComAprovacao = (typeof CAMPOS_COM_APROVACAO)[number];

/** Campos que o próprio usuário altera livremente. */
export const CAMPOS_LIVRES = ["foto_perfil", "phone"] as const;

export type CampoDePerfil = CampoComAprovacao | (typeof CAMPOS_LIVRES)[number];

export interface AlteracaoDePerfil {
  campo: CampoDePerfil;
  valorAnterior: string;
  valorNovo: string;
}

export interface SolicitacaoDePerfil {
  id: number;
  userId: number;
  userUid: string;
  userNome: string;
  alteracoes: AlteracaoDePerfil[];
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
}

/** Rótulo humano de cada campo (usado no painel e nos toasts). */
export const ROTULOS_CAMPOS: Record<CampoDePerfil, string> = {
  nome: "Nome",
  email: "E-mail",
  cpf: "CPF",
  birthdate: "Data de nascimento",
  gender: "Gênero",
  institution: "Instituição",
  role: "Cargo / Função",
  foto_perfil: "Foto de perfil",
  phone: "Telefone para contato",
};

function normalizar(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

/**
 * Compara o que está no formulário com o que está no banco e devolve, por
 * campo, o que mudou. A ordem segue `TODOS_OS_CAMPOS` para os diffs
 * aparecerem sempre iguais no painel.
 */
export function calcularAlteracoes(
  atual: Partial<User> | null | undefined,
  novo: Partial<Record<CampoDePerfil, unknown>>
): AlteracaoDePerfil[] {
  if (!atual) return [];
  const campos: CampoDePerfil[] = [...CAMPOS_COM_APROVACAO, ...CAMPOS_LIVRES];
  const alteracoes: AlteracaoDePerfil[] = [];

  for (const campo of campos) {
    if (!(campo in novo)) continue;
    const anterior = normalizar((atual as any)[campo]);
    const proximo = normalizar(novo[campo]);
    if (anterior !== proximo) {
      alteracoes.push({ campo, valorAnterior: anterior, valorNovo: proximo });
    }
  }

  return alteracoes;
}

/** Separa as alterações em "livres" e "sujeitas a aprovação". */
export function separarAlteracoes(alteracoes: AlteracaoDePerfil[]) {
  const livres = alteracoes.filter((a) => (CAMPOS_LIVRES as readonly string[]).includes(a.campo));
  const sujeitas = alteracoes.filter((a) => (CAMPOS_COM_APROVACAO as readonly string[]).includes(a.campo));
  return { livres, sujeitas };
}

function mapSolicitacao(row: any): SolicitacaoDePerfil {
  const pedido = row.requested_changes || {};
  const anterior = row.previous_values || {};
  const campos: CampoDePerfil[] = [...CAMPOS_COM_APROVACAO, ...CAMPOS_LIVRES];

  const alteracoes: AlteracaoDePerfil[] = Object.keys(pedido)
    .filter((c): c is CampoDePerfil => campos.includes(c as CampoDePerfil))
    .map((campo) => ({
      campo,
      valorAnterior: normalizar(anterior[campo]),
      valorNovo: normalizar(pedido[campo]),
    }));

  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    userUid: row.user_uid || "",
    userNome: row.user_nome || "Usuário",
    alteracoes,
    status: (row.status || "pending") as SolicitacaoDePerfil["status"],
    createdAt: row.created_at || new Date().toISOString(),
    reviewedAt: row.reviewed_at || null,
    reviewedBy: row.reviewed_by || null,
    rejectionReason: row.rejection_reason || null,
  };
}

/**
 * Grava direto os campos livres (foto e telefone).
 * Retorna o usuário atualizado para o app refletir na hora.
 */
export async function salvarCamposLivres(
  userId: number,
  alteracoes: AlteracaoDePerfil[]
): Promise<{ user: User | null; error: any }> {
  if (alteracoes.length === 0) return { user: null, error: null };

  const payload: Partial<User> = {};
  for (const a of alteracoes) {
    (payload as any)[a.campo] = a.valorNovo;
  }

  return updateUserDirectInSupabase(userId, payload);
}

/**
 * Registra um pedido de aprovação com o que o usuário quer mudar.
 * O perfil NÃO é alterado aqui — só depois da aprovação de um ADM.
 */
export async function criarSolicitacaoDePerfil(params: {
  user: Pick<User, "id" | "uid" | "nome">;
  alteracoes: AlteracaoDePerfil[];
}): Promise<{ solicitacao: SolicitacaoDePerfil | null; error: any }> {
  if (!isSupabaseConfigured()) {
    return { solicitacao: null, error: new Error("Supabase não configurado no cliente") };
  }

  const { user, alteracoes } = params;
  if (alteracoes.length === 0) return { solicitacao: null, error: null };

  const requested: Record<string, string> = {};
  const previous: Record<string, string> = {};
  for (const a of alteracoes) {
    requested[a.campo] = a.valorNovo;
    previous[a.campo] = a.valorAnterior;
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("profile_change_requests")
      .insert({
        user_id: user.id,
        user_uid: user.uid,
        user_nome: user.nome,
        requested_changes: requested,
        previous_values: previous,
        status: "pending",
      })
      .select();

    if (error) return { solicitacao: null, error };
    if (!data || data.length === 0) {
      return { solicitacao: null, error: new Error("Solicitação não foi gravada") };
    }
    return { solicitacao: mapSolicitacao(data[0]), error: null };
  } catch (err) {
    return { solicitacao: null, error: err };
  }
}

/** Lista as solicitações (padrão: pendentes). */
export async function listarSolicitacoesDePerfil(
  status: "pending" | "approved" | "rejected" | "all" = "pending"
): Promise<{ solicitacoes: SolicitacaoDePerfil[]; error: any }> {
  // Servidor primeiro: a fila mostra nome/CPF/e-mail que usuários pediram para
  // mudar — não é dado para ficar legível com a chave pública.
  try {
    const res = await fetchJsonApiWithAuth(`/api/admin/profile-requests?status=${encodeURIComponent(status)}`);
    if (res && res.ok) {
      const corpo = await res.json().catch(() => null);
      if (corpo && Array.isArray(corpo.requests)) {
        return { solicitacoes: corpo.requests as SolicitacaoDePerfil[], error: null };
      }
    }
    if (res && (res.status === 401 || res.status === 403)) {
      return { solicitacoes: [], error: new Error("As alterações de perfil são visíveis apenas para administradores.") };
    }
  } catch {
    /* servidor indisponível — leitura direta abaixo */
  }

  if (!isSupabaseConfigured()) {
    return { solicitacoes: [], error: new Error("Supabase não configurado no cliente") };
  }

  try {
    const supabase = getSupabaseClient();
    let query = supabase.from("profile_change_requests").select("*");
    if (status !== "all") query = query.eq("status", status);

    const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
    if (error) return { solicitacoes: [], error };

    return { solicitacoes: (data ?? []).map(mapSolicitacao), error: null };
  } catch (err) {
    return { solicitacoes: [], error: err };
  }
}

/**
 * Aplica as alterações no perfil e marca a solicitação como aprovada.
 * Quando a aprovação do próprio registro falha, o perfil NÃO é tocado —
 * garantimos que o pedido continue pendente para nova tentativa.
 */
export async function aprovarSolicitacaoDePerfil(params: {
  solicitacao: SolicitacaoDePerfil;
  reviewedBy: string;
}): Promise<{ user: User | null; error: any }> {
  const { solicitacao } = params;
  if (solicitacao.status !== "pending") {
    return { user: null, error: new Error("Esta solicitação já foi revisada.") };
  }

  /*
    Aprovar aplica o valor direto em `users`. Fica no servidor, que confere o
    papel, reivindica o pedido (evita aprovação dupla) e só então grava. Sem
    servidor, a ação falha em vez de acontecer por um caminho inseguro.
  */
  try {
    const res = await fetchJsonApiWithAuth(`/api/admin/profile-requests/${solicitacao.id}/approve`, {
      method: "POST",
    });

    if (res && res.ok) {
      const payload: Partial<User> = {};
      for (const a of solicitacao.alteracoes) (payload as any)[a.campo] = a.valorNovo;
      return { user: { id: solicitacao.userId, ...payload } as User, error: null };
    }

    const detalhe = res ? await res.clone().json().catch(() => null) : null;
    if (detalhe?.error) return { user: null, error: new Error(detalhe.error) };
    if (!res) {
      return {
        user: null,
        error: new Error(mensagemPrecisaServidor("Aprovar alterações de perfil")),
      };
    }
    if (res.status === 403) return { user: null, error: new Error("Somente o Administrador Chefe aprova alterações de perfil.") };
    if (res.status === 409) return { user: null, error: new Error("Esta solicitação já foi revisada por outro administrador.") };
    return { user: null, error: new Error("Não foi possível aprovar a solicitação.") };
  } catch (err: any) {
    return { user: null, error: err instanceof Error ? err : new Error("Falha de rede ao aprovar.") };
  }
}

/** Rejeita a solicitação sem tocar no perfil. */
export async function rejeitarSolicitacaoDePerfil(params: {
  solicitacaoId: number;
  reviewedBy: string;
  motivo?: string;
}): Promise<{ success: boolean; error: any }> {
  try {
    const res = await fetchJsonApiWithAuth(`/api/admin/profile-requests/${params.solicitacaoId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: params.motivo ?? null }),
    });

    if (res && res.ok) return { success: true, error: null };

    const detalhe = res ? await res.clone().json().catch(() => null) : null;
    return {
      success: false,
      error: new Error(
        detalhe?.error ||
          (res?.status === 403
            ? "Somente o Administrador Chefe rejeita alterações de perfil."
            : "Não foi possível rejeitar a solicitação.")
      ),
    };
  } catch (err: any) {
    return { success: false, error: err instanceof Error ? err : new Error("Falha de rede.") };
  }
}

/** Conta quantas solicitações estão pendentes (badge da aba). */
export async function contarSolicitacoesPendentes(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  try {
    const supabase = getSupabaseClient();
    const { count, error } = await supabase
      .from("profile_change_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
