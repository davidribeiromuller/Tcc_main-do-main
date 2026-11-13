/**
 * Gestão de contas institucionais das escolas (exclusivo do Chefe).
 *
 * Contexto do problema: o Express expõe `POST /api/admin/institutional-accounts`,
 * mas o app publicado no GitHub Pages é **estático** — todo `/api/*` devolve o
 * HTML do index com status 200. Resultado: o Chefe não tinha como criar a conta
 * da escola na versão publicada, e a tela nem oferecia o botão.
 *
 * Solução: gravar a conta como um usuário com `role: "Escola"` na tabela
 * `users`. Esse é o formato que o login institucional já consulta
 * (`authenticateUserDirectInSupabase` por e-mail/identificador), então a conta
 * funciona nos dois ambientes sem depender de tabela nova.
 */

import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";
import { findUserByEmailDirectInSupabase } from "./usersService.ts";
import { ARAUCARIA_SCHOOLS } from "./schoolsData.ts";
import type { User } from "../types.ts";

export interface NovaContaInstitucional {
  escolaSlug: string;
  /** Identificador de acesso (ex.: "helena.wysocki" ou CGM). */
  identificador: string;
  email: string;
  password: string;
  responsavel: string;
  cargo: string;
  telefone?: string;
}

export interface ResultadoContaInstitucional {
  success: boolean;
  user?: User | null;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** true quando a gravação usou o backend Express em vez do Supabase. */
  viaBackend?: boolean;
}

/** Normaliza o identificador para comparação (sem espaços, minúsculo). */
export function normalizeIdentificador(valor: string): string {
  return (valor || "").trim().toLowerCase();
}

/**
 * Valida os campos do formulário antes de tocar no banco.
 * Retorna erros por campo para destacar na UI.
 */
export function validateNovaContaInstitucional(
  dados: Partial<NovaContaInstitucional>
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

/**
 * Cria a conta institucional de uma escola.
 *
 * Ordem: Supabase direto (funciona no GitHub Pages) → backend Express
 * (ambiente local). Se ambos falharem, devolve a mensagem mais informativa.
 */
export async function criarContaInstitucional(
  dados: NovaContaInstitucional
): Promise<ResultadoContaInstitucional> {
  const fieldErrors = validateNovaContaInstitucional(dados);
  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors, error: "Revise os campos destacados." };
  }

  const escola = ARAUCARIA_SCHOOLS.find((s) => s.slug === dados.escolaSlug);
  if (!escola) {
    return { success: false, error: "Escola não encontrada no cadastro de Araucária." };
  }

  const email = dados.email.trim().toLowerCase();
  const identificador = normalizeIdentificador(dados.identificador);
  const escolaNome = escola.name;
  const escolaId = escola.id;

  // 1. Caminho principal: grava direto no Supabase (funciona em hospedagem estática)
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();

    try {
      // Identificador e e-mail são únicos: a conta é a porta de entrada da escola.
      const { data: existentes, error: buscaError } = await supabase
        .from("users")
        .select("id, email, role, institution")
        .or(`email.ilike.${email},email.ilike.${identificador}@escola.pr.gov.br`)
        .limit(5);

      if (buscaError) {
        console.warn("[institutionalAdmin] Falha ao checar duplicidade:", buscaError.message);
      }

      const jaExisteEmail = (existentes || []).some(
        (u: any) => String(u.email || "").toLowerCase() === email
      );
      if (jaExisteEmail) {
        return {
          success: false,
          fieldErrors: { email: "Já existe uma conta com este e-mail." },
          error: "Já existe uma conta com este e-mail.",
        };
      }

      const { data, error } = await supabase
        .from("users")
        .insert([
          {
            uid: `inst-${escola.slug}`,
            nome: responsavelComEscola(dados.responsavel, escolaNome),
            email,
            password: dados.password,
            role: "Escola",
            is_admin: false,
            ativo: true,
            provider: "local",
            institution: escolaNome,
            phone: dados.telefone ? dados.telefone.trim() : null,
            foto_perfil: "",
            must_change_password: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) {
        // Mensagem acionável quando a coluna ainda não existe no banco.
        const msg = String(error.message || "");
        if (msg.includes("must_change_password")) {
          return {
            success: false,
            error:
              "O banco ainda não tem a coluna must_change_password. Aplique a migration da rodada 5 e tente novamente.",
          };
        }
        return { success: false, error: msg || "Não foi possível criar a conta institucional." };
      }

      return {
        success: true,
        user: {
          id: data.id,
          uid: data.uid,
          nome: data.nome,
          email: data.email,
          role: data.role,
          isAdmin: false,
          ativo: true,
          institution: data.institution,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        } as User,
      };
    } catch (err: any) {
      // Segue para o backend: em ambiente local ele também sabe criar.
      console.warn("[institutionalAdmin] Supabase falhou, tentando backend:", err?.message);
    }
  }

  // 2. Fallback: backend Express (ambiente local / dev)
  try {
    const res = await fetch("/api/admin/institutional-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        escolaId,
        escolaNome,
        identificador,
        password: dados.password,
        email,
        responsavel: dados.responsavel,
        cargo: dados.cargo,
        institutionalContact: dados.telefone || email,
      }),
    });

    // Em hospedagem estática o Express não existe e devolve HTML com 200.
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return {
        success: false,
        error:
          "Não foi possível criar a conta: o navegador não conseguiu falar com o banco. Verifique a conexão e tente novamente.",
      };
    }

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: payload?.error || "O servidor recusou a criação da conta." };
    }

    return { success: true, viaBackend: true, user: null };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Erro de conexão ao criar a conta institucional.",
    };
  }
}

/** Nome exibido da conta: "Responsável — Escola". */
function responsavelComEscola(responsavel: string, escolaNome: string): string {
  return `${(responsavel || "").trim()} — ${escolaNome}`.trim();
}

/**
 * Lista as contas institucionais já criadas (role "Escola").
 * Usado para mostrar o estado real da aba, com ou sem backend.
 */
export async function listarContasInstitucionais(): Promise<{
  contas: Array<Partial<User> & { institution?: string }>;
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { contas: [], error: "Supabase não configurado." };
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("users")
      .select("id, uid, nome, email, role, ativo, institution, created_at, last_login")
      .eq("role", "Escola")
      .order("created_at", { ascending: true });

    if (error) {
      return { contas: [], error: error.message };
    }

    return {
      contas: (data || []).map((row: any) => ({
        id: row.id,
        uid: row.uid,
        nome: row.nome,
        email: row.email,
        role: row.role,
        ativo: row.ativo !== false,
        institution: row.institution,
        createdAt: row.created_at,
        lastLogin: row.last_login,
      })),
      error: null,
    };
  } catch (err: any) {
    return { contas: [], error: err?.message || "Erro ao listar contas institucionais." };
  }
}

/** Verifica se já existe conta para a escola (uma por escola). */
export async function escolaJaTemConta(escolaNome: string): Promise<boolean> {
  const { contas } = await listarContasInstitucionais();
  return contas.some((c) => (c.institution || "").trim() === escolaNome.trim());
}
