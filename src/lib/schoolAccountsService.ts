/**
 * Contas escolares (equipe gestora das escolas) — lista SEPARADA.
 *
 * Histórico do problema: as contas institucionais eram gravadas na tabela
 * `users` com `role: "Escola"`. Isso misturava a gestão escolar com o
 * diretório de alunos/servidores: as contas apareciam no meio dos usuários,
 * entravam nos contadores ("24 contas totais", "22 ativas"), não tinham
 * `escolaId` (a linha "Responsável" saía sem cargo) e — pior — o `uid` era
 * fixo (`inst-<escola>`), então a segunda conta da MESMA escola colidia em
 * `users_uid_key` e a criação falhava.
 *
 * Agora as contas escolares vivem na tabela `school_accounts`, com identidade
 * própria, e continuam autenticando pelo mesmo caminho (e-mail ou
 * identificador + senha) através do serviço de autenticação.
 *
 * Regras de negócio preservadas:
 *  - Só o Administrador Chefe cria, bloqueia, verifica e redefine senha.
 *  - A senha é guardada em texto (decisão de escopo do TCC) e o Chefe pode
 *    VÊ-LA e ALTERÁ-LA na ficha da conta.
 *  - Nada é publicado automaticamente: a conta nasce "pendente de verificação".
 */

import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";
import { ARAUCARIA_SCHOOLS } from "./schoolsData.ts";
import type { User } from "../types.ts";

export type SchoolAccountStatus = "active" | "suspended" | "revoked";
export type SchoolVerificationStatus = "pending_verification" | "verified" | "revoked";

/** Linha da tabela `school_accounts` no formato usado pela UI. */
export interface SchoolAccount {
  id: number;
  escolaId: number;
  escolaSlug: string;
  escolaNome: string;
  identificador: string;
  email: string;
  password?: string;
  responsavel: string;
  cargo: string;
  telefone?: string;
  ativo: boolean;
  status: SchoolAccountStatus;
  verificationStatus: SchoolVerificationStatus;
  createdAt?: string;
  updatedAt?: string;
  lastLogin?: string;
}

export interface NovaContaEscolar {
  escolaSlug: string;
  identificador: string;
  email: string;
  password: string;
  responsavel: string;
  cargo: string;
  telefone?: string;
}

export interface ResultadoContaEscolar {
  success: boolean;
  conta?: SchoolAccount;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/** Normaliza o identificador de acesso (sem espaços, minúsculo). */
export function normalizeIdentificador(valor: string): string {
  return (valor || "").trim().toLowerCase();
}

/**
 * Valida os campos do formulário antes de tocar no banco.
 * Devolve erros por campo para destacar na UI.
 */
export function validateNovaContaEscolar(
  dados: Partial<NovaContaEscolar>
): Record<string, string> {
  const erros: Record<string, string> = {};

  if (!dados.escolaSlug) {
    erros.escolaSlug = "Selecione a escola.";
  }

  const identificador = normalizeIdentificador(dados.identificador || "");
  if (!identificador) {
    erros.identificador = "Informe o identificador de acesso.";
  } else if (identificador.length < 4) {
    erros.identificador = "Use ao menos 4 caracteres.";
  } else if (!/^[a-z0-9._-]+$/.test(identificador)) {
    erros.identificador = "Use apenas letras, números, ponto, hífen ou underline.";
  }

  const email = (dados.email || "").trim().toLowerCase();
  if (!email) {
    erros.email = "Informe o e-mail institucional.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    erros.email = "E-mail institucional inválido.";
  }

  const senha = dados.password || "";
  if (!senha) {
    erros.password = "Defina a senha inicial.";
  } else if (senha.length < 6) {
    erros.password = "A senha precisa ter ao menos 6 caracteres.";
  }

  if (!(dados.responsavel || "").trim()) {
    erros.responsavel = "Informe o nome do responsável.";
  }

  if (!(dados.cargo || "").trim()) {
    erros.cargo = "Informe o cargo.";
  }

  return erros;
}

/** Converte a linha do banco no objeto da UI. */
function mapRow(row: any): SchoolAccount {
  const escola =
    ARAUCARIA_SCHOOLS.find((s) => s.id === Number(row.school_id)) ||
    ARAUCARIA_SCHOOLS.find((s) => s.slug === row.school_slug);

  return {
    id: Number(row.id),
    escolaId: Number(row.school_id) || escola?.id || 0,
    escolaSlug: row.school_slug || escola?.slug || "",
    escolaNome: escola?.name || row.school_name || "Escola",
    identificador: row.login_identifier || "",
    email: row.institutional_email || row.login_identifier || "",
    password: row.password || undefined,
    responsavel: row.responsible_name || "",
    cargo: row.responsible_role || "",
    telefone: row.institutional_contact || undefined,
    ativo: row.account_status !== "suspended" && row.account_status !== "revoked",
    status: (row.account_status || "active") as SchoolAccountStatus,
    verificationStatus: (row.verification_status || "pending_verification") as SchoolVerificationStatus,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
    lastLogin: row.last_login_at || undefined,
  };
}

/**
 * Lista as contas escolares. Aceita filtro por escola, útil para o portal.
 *
 * A tabela tem RLS fechada (só o Chefe pela política de escrita); a leitura
 * aqui é feita com a chave publicável e por isso pode voltar vazia. Nesse caso
 * devolvemos `error` para a UI explicar em vez de dizer "nenhuma conta".
 */
export async function listarContasEscolares(opcoes?: {
  escolaId?: number;
}): Promise<{ contas: SchoolAccount[]; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { contas: [], error: "Supabase não configurado." };
  }

  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from("school_accounts")
      .select("*")
      .order("school_id", { ascending: true })
      .order("id", { ascending: true });

    if (opcoes?.escolaId) {
      query = query.eq("school_id", opcoes.escolaId);
    }

    const { data, error } = await query;

    if (error) {
      // Tabela ainda não criada (migration pendente): mensagem acionável.
      const msg = String(error.message || "");
      if (error.code === "42P01" || /does not exist|schema cache/i.test(msg)) {
        return {
          contas: [],
          error:
            "A tabela de contas escolares ainda não existe neste banco. Aplique a migration 0009_school_accounts_table.sql.",
        };
      }
      return { contas: [], error: msg || "Não foi possível listar as contas escolares." };
    }

    return { contas: (data || []).map(mapRow), error: null };
  } catch (err: any) {
    return { contas: [], error: err?.message || "Erro ao listar contas escolares." };
  }
}

/**
 * Cria a conta escolar.
 *
 * O identificador e o e-mail são únicos ENTRE CONTAS ESCOLARES — a mesma
 * escola pode ter mais de uma (direção, coordenação), e o erro antigo de
 * `users_uid_key` não acontece mais porque a chave primária é própria.
 */
export async function criarContaEscolar(
  dados: NovaContaEscolar
): Promise<ResultadoContaEscolar> {
  const fieldErrors = validateNovaContaEscolar(dados);
  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors, error: "Revise os campos destacados." };
  }

  const escola = ARAUCARIA_SCHOOLS.find((s) => s.slug === dados.escolaSlug);
  if (!escola) {
    return { success: false, error: "Escola não encontrada no cadastro de Araucária." };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: "Banco de dados indisponível. Tente novamente em instantes." };
  }

  const supabase = getSupabaseClient();
  const email = dados.email.trim().toLowerCase();
  const identificador = normalizeIdentificador(dados.identificador);

  try {
    // Duplicidade entre contas escolares (a lista é separada dos usuários).
    const { data: existentes, error: buscaError } = await supabase
      .from("school_accounts")
      .select("id, login_identifier, institutional_email")
      .or(`login_identifier.eq.${identificador},institutional_email.eq.${email}`)
      .limit(5);

    if (buscaError && buscaError.code !== "42P01") {
      console.warn("[schoolAccounts] Falha ao checar duplicidade:", buscaError.message);
    }

    const conflito = (existentes || [])[0];
    if (conflito) {
      const mesmoEmail =
        String(conflito.institutional_email || "").toLowerCase() === email;
      return {
        success: false,
        fieldErrors: mesmoEmail
          ? { email: "Já existe uma conta escolar com este e-mail." }
          : { identificador: "Já existe uma conta escolar com este identificador." },
        error: mesmoEmail
          ? "Já existe uma conta escolar com este e-mail."
          : "Já existe uma conta escolar com este identificador.",
      };
    }

    const { data, error } = await supabase
      .from("school_accounts")
      .insert([
        {
          school_id: escola.id,
          school_slug: escola.slug,
          school_name: escola.name,
          login_identifier: identificador,
          institutional_email: email,
          password: dados.password,
          responsible_name: dados.responsavel.trim(),
          responsible_role: dados.cargo.trim(),
          institutional_contact: dados.telefone?.trim() || email,
          account_status: "active",
          verification_status: "pending_verification",
          created_by: "ADM Chefe",
        },
      ])
      .select()
      .single();

    if (error) {
      const msg = String(error.message || "");
      if (error.code === "42P01" || /does not exist|schema cache/i.test(msg)) {
        return {
          success: false,
          error:
            "A tabela de contas escolares ainda não existe neste banco. Aplique a migration 0009_school_accounts_table.sql.",
        };
      }
      if (error.code === "23505") {
        return {
          success: false,
          fieldErrors: { identificador: "Identificador ou e-mail já cadastrado." },
          error: "Identificador ou e-mail já cadastrado para outra conta escolar.",
        };
      }
      return { success: false, error: msg || "Não foi possível criar a conta escolar." };
    }

    return { success: true, conta: mapRow(data) };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao criar a conta escolar." };
  }
}

/** Bloqueia / desbloqueia a conta (não apaga: o histórico fica). */
export async function alternarStatusContaEscolar(
  contaId: number,
  ativo: boolean
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: "Supabase não configurado." };

  try {
    const { data, error } = await getSupabaseClient()
      .from("school_accounts")
      .update({
        account_status: ativo ? "active" : "suspended",
        updated_at: new Date().toISOString(),
      })
      .eq("id", contaId)
      .select("id");

    if (error) return { success: false, error: error.message };
    if (!data || data.length === 0) {
      return { success: false, error: "Conta escolar não encontrada para atualização." };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao alterar o status da conta." };
  }
}

/** Marca a conta como verificada (auditoria documental do Chefe) ou revoga. */
export async function definirVerificacaoContaEscolar(
  contaId: number,
  status: SchoolVerificationStatus
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: "Supabase não configurado." };

  try {
    const { data, error } = await getSupabaseClient()
      .from("school_accounts")
      .update({
        verification_status: status,
        verified_by: "ADM Chefe",
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", contaId)
      .select("id");

    if (error) return { success: false, error: error.message };
    if (!data || data.length === 0) {
      return { success: false, error: "Conta escolar não encontrada para verificação." };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao verificar a conta escolar." };
  }
}

/** Redefine a senha da conta escolar (o Chefe digita a nova senha). */
export async function redefinirSenhaContaEscolar(
  contaId: number,
  novaSenha: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: "Supabase não configurado." };
  if ((novaSenha || "").length < 6) {
    return { success: false, error: "A senha precisa ter ao menos 6 caracteres." };
  }

  try {
    const { data, error } = await getSupabaseClient()
      .from("school_accounts")
      .update({
        password: novaSenha,
        must_change_password: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contaId)
      .select("id");

    if (error) return { success: false, error: error.message };
    if (!data || data.length === 0) {
      return { success: false, error: "Conta escolar não encontrada para redefinir a senha." };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao redefinir a senha." };
  }
}

/** Remove definitivamente a conta escolar (ação explícita do Chefe). */
export async function removerContaEscolar(
  contaId: number
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: "Supabase não configurado." };

  try {
    const { error } = await getSupabaseClient()
      .from("school_accounts")
      .delete()
      .eq("id", contaId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao remover a conta escolar." };
  }
}

/**
 * Autentica a conta escolar por identificador OU e-mail + senha.
 * Devolve o usuário já no formato que o app usa para sessão ("role: Escola").
 */
export async function autenticarContaEscolar(
  identificadorOuEmail: string,
  password: string
): Promise<{ user: User | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { user: null, error: "Acesso institucional indisponível: Supabase não configurado." };
  }

  const termo = (identificadorOuEmail || "").trim().toLowerCase();
  if (!termo) return { user: null, error: "Informe o identificador institucional da escola." };

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("school_accounts")
      .select("*")
      .or(`login_identifier.eq.${termo},institutional_email.eq.${termo}`)
      .limit(1);

    if (error) {
      return { user: null, error: "Erro de conexão ao consultar as contas escolares." };
    }

    const conta = (data || [])[0];
    if (!conta) {
      return { user: null, error: "Identificador ou senha institucional incorretos." };
    }

    if (conta.account_status === "suspended" || conta.account_status === "revoked") {
      return {
        user: null,
        error: "Sua conta escolar está desativada ou bloqueada pela diretoria.",
      };
    }

    if (conta.password && conta.password !== password) {
      return { user: null, error: "Credenciais inválidas. Verifique seu identificador e a senha." };
    }

    const agora = new Date().toISOString();
    try {
      await supabase
        .from("school_accounts")
        .update({ last_login_at: agora, updated_at: agora })
        .eq("id", conta.id);
    } catch (_) {
      /* Estatística de acesso é best effort. */
    }

    const usuario: User = {
      id: Number(conta.id),
      uid: `school-account-${conta.id}`,
      nome: `${conta.responsible_name} — ${conta.school_name}`,
      email: conta.institutional_email,
      role: "Escola",
      ativo: true,
      isAdmin: false,
      escolaId: Number(conta.school_id),
      escolaNome: conta.school_name,
      identificador: conta.login_identifier,
      institution: conta.school_name,
      phone: conta.institutional_contact || undefined,
      mustChangePassword: conta.must_change_password === true,
      createdAt: conta.created_at || agora,
      lastLogin: agora,
    };

    return { user: usuario, error: null };
  } catch (err: any) {
    return { user: null, error: err?.message || "Erro ao autenticar a conta escolar." };
  }
}
