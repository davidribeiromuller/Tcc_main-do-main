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
import { fetchJsonApiWithAuth, isServerAvailable } from "./staticHosting.ts";
import { hashPassword, verifyPassword, validatePasswordStrength } from "./security.ts";
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
  /**
   * Legado: a senha em texto/hash NÃO trafega mais. Mantido apenas para não
   * quebrar telas antigas — sempre `undefined` a partir do servidor.
   * @deprecated use `senhaDefinida`.
   */
  password?: string;
  /** true quando existe senha cadastrada (o hash fica só no servidor). */
  senhaDefinida?: boolean;
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
    // `senhaDefinida` vem do servidor (booleano). O hash não trafega.
    senhaDefinida: row.senhaDefinida ?? Boolean(row.password),
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
  /*
    Servidor primeiro (é a única via que enxerga `school_accounts` depois que a
    RLS foi fechada). A chamada direta ao Supabase fica como último recurso de
    demonstração — e costuma voltar vazia, o que antes fazia o painel dizer
    "nenhuma conta" sem explicar o motivo.
  */
  const query = opcoes?.escolaId ? `?escolaId=${encodeURIComponent(String(opcoes.escolaId))}` : "";
  try {
    const res = await fetchJsonApiWithAuth(`/api/admin/school-accounts${query}`);
    if (res && res.ok) {
      const corpo = await res.json().catch(() => null);
      if (corpo && Array.isArray(corpo.accounts)) {
        return { contas: corpo.accounts as SchoolAccount[], error: null };
      }
    }
    if (res && (res.status === 401 || res.status === 403)) {
      return { contas: [], error: "A lista de contas escolares é exclusiva do Administrador Chefe." };
    }
    if (res && res.status === 503) {
      return {
        contas: [],
        error:
          "O servidor está sem SUPABASE_SECRET_KEY: sem isso não é possível ler as contas escolares.",
      };
    }
  } catch {
    /* servidor indisponível — tenta o caminho direto abaixo */
  }

  if (!isSupabaseConfigured()) {
    return { contas: [], error: "Supabase não configurado." };
  }

  try {
    const supabase = getSupabaseClient();
    let consulta = supabase
      .from("school_accounts")
      .select("*")
      .order("school_id", { ascending: true })
      .order("id", { ascending: true });

    if (opcoes?.escolaId) {
      consulta = consulta.eq("school_id", opcoes.escolaId);
    }

    const { data, error } = await consulta;

    if (error) {
      const msg = String(error.message || "");
      if (error.code === "42501" || /permission denied|row-level security/i.test(msg)) {
        return {
          contas: [],
          error:
            "A lista de contas escolares só pode ser lida pelo servidor do eloEscola. Em hospedagem estática, use o ambiente com backend.",
        };
      }
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
 * Executa uma ação de gestão sobre conta escolar no servidor.
 *
 * Centraliza a tradução de erro para que cada tela não invente a sua: 401 é
 * sessão vencida, 403 é falta de permissão e 503 é servidor sem chave secreta.
 * Nunca devolve `success: true` sem confirmação do servidor.
 */
async function chamarAcaoContaEscolar(
  url: string,
  metodo: "PUT" | "DELETE",
  corpo?: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetchJsonApiWithAuth(url, {
      method: metodo,
      headers: corpo ? { "Content-Type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });

    if (res && res.ok) return { success: true };

    const detalhe = res ? await res.clone().json().catch(() => null) : null;
    if (detalhe?.error) return { success: false, error: detalhe.error };

    if (!res) {
      return {
        success: false,
        error: "O servidor do eloEscola não respondeu. Esta ação exige backend (não funciona na versão estática).",
      };
    }
    if (res.status === 401) return { success: false, error: "Sua sessão expirou. Entre novamente." };
    if (res.status === 403) return { success: false, error: "Ação exclusiva do Administrador Chefe." };
    if (res.status === 503) {
      return { success: false, error: "O servidor está sem SUPABASE_SECRET_KEY; configure para usar esta função." };
    }
    return { success: false, error: "Não foi possível concluir a ação." };
  } catch (err: any) {
    return { success: false, error: err?.message || "Falha de rede ao falar com o servidor." };
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

  /*
    Criação pelo SERVIDOR: é ele quem valida duplicidade, aplica a força de
    senha e grava o hash scrypt. O navegador não tem (nem deve ter) caminho
    para inserir direto em `school_accounts` — a chave pública não escreve
    mais nessa tabela.
  */
  try {
    const res = await fetchJsonApiWithAuth("/api/admin/school-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        escolaSlug: dados.escolaSlug,
        identificador: dados.identificador,
        email: dados.email,
        password: dados.password,
        responsavel: dados.responsavel,
        cargo: dados.cargo,
        telefone: dados.telefone,
      }),
    });

    if (res) {
      const corpo = await res.clone().json().catch(() => null);
      if (res.ok) {
        return { success: true, conta: corpo?.conta };
      }
      return {
        success: false,
        error: corpo?.error || "Não foi possível criar a conta escolar.",
        fieldErrors: corpo?.fieldErrors,
      };
    }
  } catch {
    /* servidor indisponível */
  }

  return {
    success: false,
    error:
      "A criação de contas escolares exige o servidor do eloEscola (o banco não aceita mais escrita direta pelo navegador).",
  };
}

/** Bloqueia / desbloqueia a conta (não apaga: o histórico fica). */
export async function alternarStatusContaEscolar(
  contaId: number,
  ativo: boolean
): Promise<{ success: boolean; error?: string }> {
  return chamarAcaoContaEscolar(`/api/admin/school-accounts/${contaId}/status`, "PUT", { ativo });
}

/** Marca a conta como verificada (auditoria documental do Chefe) ou revoga. */
export async function definirVerificacaoContaEscolar(
  contaId: number,
  status: SchoolVerificationStatus
): Promise<{ success: boolean; error?: string }> {
  return chamarAcaoContaEscolar(`/api/admin/school-accounts/${contaId}/verify`, "PUT", {
    verificationStatus: status,
  });
}

/** Redefine a senha da conta escolar (o Chefe digita a nova senha). */
export async function redefinirSenhaContaEscolar(
  contaId: number,
  novaSenha: string
): Promise<{ success: boolean; error?: string }> {
  const forca = validatePasswordStrength(novaSenha || "");
  if (forca) return { success: false, error: forca };
  return chamarAcaoContaEscolar(`/api/admin/school-accounts/${contaId}/reset-password`, "PUT", {
    password: novaSenha,
  });
}

/** Remove definitivamente a conta escolar (ação explícita do Chefe). */
export async function removerContaEscolar(
  contaId: number
): Promise<{ success: boolean; error?: string }> {
  return chamarAcaoContaEscolar(`/api/admin/school-accounts/${contaId}`, "DELETE");
}

/**
 * Autentica a conta escolar por identificador OU e-mail + senha.
 * Devolve o usuário já no formato que o app usa para sessão ("role: Escola").
 */
export async function autenticarContaEscolar(
  identificadorOuEmail: string,
  password: string
): Promise<{ user: User | null; error: string | null }> {
  /*
    RODADA 39 — esta função é chamada pelo App (navegador) e fazia a consulta
    com a chave PUBLICÁVEL. `school_accounts` tem RLS ligado e ZERO políticas
    (de propósito: guarda senha), então a consulta voltava 401 e o console
    mostrava:

      Failed to load resource: the server responded with a status of 401
      jaoheenjltzzglfncgfq.supabase.co/rest/v1/school_accounts

    Sem servidor, não há como validar esta senha: a tabela é fechada para o
    navegador. Dizemos isso em vez de tentar de novo e falhar.
  */
  if (!(await isServerAvailable())) {
    return {
      user: null,
      error:
        "O acesso institucional exige o servidor do eloEscola em execução. " +
        "Esta versão publicada é apenas a demonstração estática.",
    };
  }

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

    // Parte 2: comparação por hash (scrypt) com migração automática de
    // registros legados em texto claro.
    const senhaCheck = verifyPassword(password, conta.password);
    if (!senhaCheck.ok) {
      return { user: null, error: "Credenciais inválidas. Verifique seu identificador e a senha." };
    }
    if (senhaCheck.needsUpgrade) {
      try {
        await getSupabaseClient()
          .from("school_accounts")
          .update({ password: hashPassword(password), updated_at: new Date().toISOString() })
          .eq("id", conta.id);
      } catch (migErr) {
        console.warn("[schoolAccounts] Falha ao migrar senha legada:", migErr);
      }
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
