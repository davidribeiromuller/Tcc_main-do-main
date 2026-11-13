/**
 * Regras de data para eventos e sugestões.
 *
 * Decisão de produto: o app só trabalha com datas de hoje em diante.
 * Sugestões com data anterior à atual são descartadas na origem (Edge Function)
 * e filtradas na leitura, para não reaparecerem em bancos já populados.
 */

/**
 * Compara uma data (dia/mês/ano, mês 0-indexado) com hoje, ignorando o horário.
 *
 * @returns negativo se passada, 0 se hoje, positivo se futura.
 */
export function compareWithToday(day: number, month: number, year: number, now = new Date()): number {
  const alvo = new Date(year, month, day);
  alvo.setHours(0, 0, 0, 0);
  const hoje = new Date(now);
  hoje.setHours(0, 0, 0, 0);
  return alvo.getTime() - hoje.getTime();
}

/** true quando a data (dia/mês/ano) já passou. */
export function isPastDate(day: number, month: number, year: number, now = new Date()): boolean {
  return compareWithToday(day, month, year, now) < 0;
}

/** Ano mínimo aceito em formulários de evento. */
export function getMinEventYear(now = new Date()): number {
  return now.getFullYear();
}

/** Quantos anos à frente o formulário oferece. */
export const EVENT_YEAR_RANGE = 4;

/**
 * Anos disponíveis no seletor: do ano atual até +EVENT_YEAR_RANGE.
 */
export function getEventYearOptions(now = new Date()): number[] {
  const atual = now.getFullYear();
  return Array.from({ length: EVENT_YEAR_RANGE + 1 }, (_, i) => atual + i);
}

/**
 * Valida uma data de evento para cadastro/edição.
 *
 * @returns string com a mensagem de erro, ou `null` se a data é válida.
 */
export function validateEventDate(
  day: number,
  month: number,
  year: number,
  now = new Date()
): string | null {
  if (!Number.isFinite(day) || day < 1 || day > 31) {
    return "Informe um dia válido (entre 1 e 31).";
  }
  if (!Number.isFinite(month) || month < 0 || month > 11) {
    return "Informe um mês válido.";
  }
  if (!Number.isFinite(year) || year < getMinEventYear(now)) {
    return `O ano do evento precisa ser ${getMinEventYear(now)} ou posterior.`;
  }

  // Rejeita datas inexistentes (ex.: 31 de fevereiro).
  const data = new Date(year, month, day);
  if (data.getMonth() !== month || data.getDate() !== day) {
    return "Esta data não existe no calendário. Confira o dia e o mês.";
  }

  if (isPastDate(day, month, year, now)) {
    return "A data do evento precisa ser de hoje em diante.";
  }

  return null;
}
