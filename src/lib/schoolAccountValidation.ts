/**
 * Regras do cadastro de conta escolar.
 *
 * Modelo de vínculo (definido com o autor do TCC):
 *  - A **instituição** é dona do domínio de e-mail. Registra o domínio no
 *    Registro.br e contrata hospedagem (Google Workspace / Microsoft 365 são
 *    as opções usuais). O app NÃO hospeda e-mail: apenas valida o domínio.
 *  - **Aluno / professor / funcionário** recebe o e-mail institucional da
 *    instituição e, no "Primeiro acesso", informa CPF, matrícula, data de
 *    nascimento e um e-mail pessoal de recuperação.
 *  - A senha provisória é definida pela instituição e trocada no primeiro acesso.
 *
 * Sem o vínculo prévio (CPF + matrícula já carregados pela escola), qualquer
 * pessoa que soubesse um e-mail `@escola.pr.gov.br` entraria como aluno.
 */

/** Domínios institucionais reconhecidos como rede pública/privada de ensino. */
const INSTITUTIONAL_DOMAIN_PATTERNS: RegExp[] = [
  // Redes estaduais/municipais de educação: escola.pr.gov.br,
  // aluno.escola.sp.gov.br, etc.
  /(^|\.)escola\.[a-z]{2}\.gov\.br$/i,
  /\.edu\.br$/i,
  /\.edu$/i,
  /\.ac\.[a-z]{2}$/i,
  // Domínios governamentais de secretarias de educação.
  /(^|\.)(educacao|educar|seed)\.[a-z]{2}\.gov\.br$/i,
];

/** Provedores pessoais que NUNCA valem como e-mail institucional. */
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "yahoo.com",
  "yahoo.com.br",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
  "icloud.com",
  "protonmail.com",
  "proton.me",
  "aol.com",
  "gmx.com",
  "zoho.com",
]);

export type InstitutionalEmailCheck = {
  institutional: boolean;
  /** Mensagem de erro, quando `institutional` é false. */
  reason: string | null;
};

/**
 * Verifica se o e-mail pertence a um domínio institucional de ensino.
 * Domínios próprios registrados pela escola podem ser liberados
 * explicitamente por `allowedDomains`.
 */
export function checkInstitutionalEmail(
  email: string,
  allowedDomains: string[] = []
): InstitutionalEmailCheck {
  const clean = (email || "").trim().toLowerCase();
  const at = clean.lastIndexOf("@");

  if (at <= 0 || at === clean.length - 1) {
    return { institutional: false, reason: "Informe um e-mail institucional válido." };
  }

  const domain = clean.slice(at + 1);

  if (PERSONAL_EMAIL_DOMAINS.has(domain)) {
    return {
      institutional: false,
      reason:
        "Este é um e-mail pessoal. Use o e-mail institucional fornecido pela sua escola (ex.: nome@escola.pr.gov.br).",
    };
  }

  const liberados = allowedDomains
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  if (liberados.includes(domain)) return { institutional: true, reason: null };

  const bate = INSTITUTIONAL_DOMAIN_PATTERNS.some((re) => re.test(domain));
  if (!bate) {
    return {
      institutional: false,
      reason:
        "Domínio não reconhecido como institucional. Use o e-mail da escola ou peça à secretaria para liberar o domínio.",
    };
  }

  return { institutional: true, reason: null };
}

/** Remove tudo que não for dígito. */
function onlyDigits(value: string): string {
  return (value || "").replace(/\D/g, "");
}

/**
 * Valida CPF pelo dígito verificador (módulo 11).
 * Rejeita sequências repetidas (111.111.111-11 etc.).
 */
export function isValidCPF(cpf: string): boolean {
  const digits = onlyDigits(cpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calc = (tamanho: number): number => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) {
      soma += parseInt(digits[i], 10) * (tamanho + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calc(9) === parseInt(digits[9], 10) && calc(10) === parseInt(digits[10], 10);
}

/** Formata CPF como 000.000.000-00 enquanto o usuário digita. */
export function formatCPF(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Matrícula/RA escolar: de 4 a 20 caracteres alfanuméricos.
 * Cada rede usa um formato, então não impomos um padrão rígido.
 */
export function isValidMatricula(matricula: string): boolean {
  const clean = (matricula || "").trim();
  return clean.length >= 4 && clean.length <= 20 && /^[A-Za-z0-9][A-Za-z0-9.\-/]*$/.test(clean);
}

/**
 * Valida a data de nascimento: formato ISO `AAAA-MM-DD`, data real,
 * entre 4 e 120 anos atrás.
 */
export function validateBirthdate(value: string, now = new Date()): string | null {
  const clean = (value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return "Informe a data de nascimento no formato AAAA-MM-DD.";
  }

  const [ano, mes, dia] = clean.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) {
    return "Data de nascimento inválida.";
  }

  const hoje = new Date(now);
  if (data.getTime() > hoje.getTime()) {
    return "A data de nascimento não pode estar no futuro.";
  }

  const idade = (hoje.getTime() - data.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (idade < 4) return "A idade mínima para cadastro é de 4 anos.";
  if (idade > 120) return "Data de nascimento inválida.";

  return null;
}

/** E-mail pessoal de recuperação (não precisa ser institucional). */
export function validatePersonalEmail(email: string): string | null {
  const clean = (email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
    return "Informe um e-mail pessoal válido para recuperação de acesso.";
  }
  return null;
}

/**
 * Senha provisória: mínimo 8 caracteres, com ao menos uma letra e um número.
 * A troca é obrigatória no primeiro acesso.
 */
export function validateProvisionalPassword(password: string): string | null {
  const p = password || "";
  if (p.length < 8) return "A senha provisória deve ter no mínimo 8 caracteres.";
  if (!/[A-Za-z]/.test(p)) return "A senha provisória deve conter ao menos uma letra.";
  if (!/\d/.test(p)) return "A senha provisória deve conter ao menos um número.";
  return null;
}

export type SchoolRegistrationInput = {
  nome: string;
  email: string;
  matricula: string;
  cpf: string;
  birthdate: string;
  personalEmail: string;
  password: string;
  institution: string;
  role: string;
  allowedDomains?: string[];
  now?: Date;
};

/**
 * Valida o formulário de "Primeiro acesso" inteiro.
 * @returns lista de erros por campo (vazia quando está tudo certo).
 */
export function validateSchoolRegistration(
  input: SchoolRegistrationInput
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!(input.nome || "").trim()) {
    errors.nome = "Informe seu nome completo.";
  }
  if (!(input.institution || "").trim()) {
    errors.institution = "Selecione sua instituição de ensino.";
  }

  const emailCheck = checkInstitutionalEmail(input.email, input.allowedDomains);
  if (!emailCheck.institutional) {
    errors.email = emailCheck.reason || "E-mail institucional inválido.";
  }

  if (!isValidMatricula(input.matricula)) {
    errors.matricula = "Informe a matrícula/RA fornecida pela escola (4 a 20 caracteres).";
  }

  if (!isValidCPF(input.cpf)) {
    errors.cpf = "CPF inválido. Confira os 11 dígitos.";
  }

  const birthError = validateBirthdate(input.birthdate, input.now);
  if (birthError) errors.birthdate = birthError;

  const personalError = validatePersonalEmail(input.personalEmail);
  if (personalError) errors.personalEmail = personalError;

  const passwordError = validateProvisionalPassword(input.password);
  if (passwordError) errors.password = passwordError;

  return errors;
}
