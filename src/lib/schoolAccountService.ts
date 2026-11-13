import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";
import { registerUserDirectInSupabase, findUserByEmailDirectInSupabase } from "./usersService.ts";
import {
  validateSchoolRegistration,
  type SchoolRegistrationInput,
} from "./schoolAccountValidation.ts";
import type { User } from "../types.ts";

export type SchoolRegistrationData = SchoolRegistrationInput & {
  /** Quando true, exige vínculo prévio em `institutional_links`. */
  requireLink?: boolean;
};

export type SchoolRegistrationResult = {
  success: boolean;
  user?: User;
  error?: string;
  /** Erros por campo, para destacar no formulário. */
  fieldErrors?: Record<string, string>;
};

/**
 * Normaliza o CPF para só dígitos — o formato de exibição é aplicado na UI.
 */
export function normalizeCPF(cpf: string): string {
  return (cpf || "").replace(/\D/g, "");
}

/**
 * Confere o vínculo escolar (CPF + matrícula + instituição) na tabela
 * `institutional_links`, que a secretaria carrega antes de liberar o acesso.
 *
 * Retorna `{ found: boolean, role?: string }`. Se a tabela ainda não existir
 * (migration 0007 não aplicada), devolve `found: false, skipped: true` em vez
 * de estourar erro — assim o app continua funcionando enquanto o banco é
 * atualizado, e a validação de campos segue valendo.
 */
export async function verifyInstitutionalLink(
  institution: string,
  cpf: string,
  matricula: string
): Promise<{ found: boolean; role?: string; skipped?: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { found: false, skipped: true };
  }

  const supabase = getSupabaseClient();
  const cpfDigits = normalizeCPF(cpf);

  try {
    const { data, error } = await supabase.rpc("verify_institutional_link", {
      p_institution: institution,
      p_cpf: cpfDigits,
      p_matricula: matricula.trim(),
    });

    if (error) {
      // Função ainda não criada (migration pendente) — não bloquear o fluxo.
      const msg = `${error.message || ""}`.toLowerCase();
      if (msg.includes("could not find") || msg.includes("does not exist") || error.code === "42883") {
        return { found: false, skipped: true };
      }
      return { found: false, error: error.message };
    }

    const row = Array.isArray(data) ? data[0] : data;
    // Uma função que devolve tipo composto retorna UMA linha de NULLs quando não
    // acha nada. Sem esta checagem o vínculo era considerado encontrado sem
    // existir. Exigimos que a instituição venha preenchida.
    if (!row || !row.institution) return { found: false };

    return { found: true, role: row.role || "Aluno" };
  } catch (err: any) {
    const msg = `${err?.message || ""}`.toLowerCase();
    if (msg.includes("does not exist") || msg.includes("could not find")) {
      return { found: false, skipped: true };
    }
    return { found: false, error: err?.message };
  }
}

/**
 * Cadastro de conta escolar ("Primeiro acesso").
 *
 * Fluxo:
 *  1. Valida os campos (CPF com dígito verificador, matrícula, data de
 *     nascimento, e-mail institucional, e-mail pessoal, senha provisória).
 *  2. Consulta o vínculo CPF + matrícula na instituição (opcional: quando a
 *     secretaria cadastrou, confere a matrícula e define a `role`).
 *  3. Cria o usuário com `must_change_password = true`.
 */
export async function registerSchoolAccount(
  data: SchoolRegistrationData
): Promise<SchoolRegistrationResult> {
  const email = (data.email || "").trim().toLowerCase();

  // 1. Campos
  const fieldErrors = validateSchoolRegistration({ ...data, email });
  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      error: "Confira os campos destacados para concluir o cadastro.",
      fieldErrors,
    };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: "Banco de dados indisponível. Tente novamente em instantes." };
  }

  // 2. E-mail já cadastrado?
  const existente = await findUserByEmailDirectInSupabase(email);
  if (existente) {
    return {
      success: false,
      error: "Este e-mail já está cadastrado no sistema escolar. Você pode entrar ou recuperar a senha.",
      fieldErrors: { email: "Este e-mail já está cadastrado." },
    };
  }

  // 3. Vínculo prévio — OPCIONAL.
  //
  // Decisão do autor do TCC: o cadastro é aberto; quem tem e-mail institucional
  // e dados coerentes cria a própria conta. O vínculo só é usado quando a
  // secretaria o cadastrou, para conferir a matrícula e definir a `role`.
  // `requireLink: true` continua disponível para quem quiser o modelo fechado.
  const link = await verifyInstitutionalLink(data.institution, data.cpf, data.matricula);
  const shouldRequireLink = data.requireLink === true;

  if (shouldRequireLink && !link.skipped && !link.found) {
    return {
      success: false,
      error:
        "Não encontramos seu vínculo escolar. Confira a matrícula e o CPF ou procure a secretaria da escola para liberar seu primeiro acesso.",
      fieldErrors: {
        matricula: "Matrícula não confere com o vínculo cadastrado pela escola.",
        cpf: "CPF não confere com o vínculo cadastrado pela escola.",
      },
    };
  }

  // 4. Criação do usuário
  const role = link.role || data.role || "Aluno";
  const { user, error } = await registerUserDirectInSupabase({
    nome: data.nome.trim(),
    email,
    password: data.password,
    cpf: data.cpf,
    phone: "",
    birthdate: data.birthdate,
    gender: "Não informado",
    role,
    institution: data.institution,
    matricula: data.matricula.trim(),
    personal_email: data.personalEmail.trim().toLowerCase(),
    must_change_password: true,
  } as any);

  if (!user) {
    return { success: false, error: error || "Não foi possível criar sua conta agora." };
  }

  // 5. Marca o vínculo como ativado (best effort).
  //    A tabela não é mais legível/gravável pelo cliente (tem CPF e senha
  //    provisória), então a atualização passa por uma função SECURITY DEFINER.
  if (link.found) {
    try {
      await getSupabaseClient().rpc("activate_institutional_link", {
        p_institution: data.institution,
        p_cpf: normalizeCPF(data.cpf),
        p_matricula: data.matricula.trim(),
        p_user_id: user.id,
      });
    } catch (err) {
      console.warn("[schoolAccount] Falha ao marcar vínculo como ativado:", err);
    }
  }

  return { success: true, user };
}
