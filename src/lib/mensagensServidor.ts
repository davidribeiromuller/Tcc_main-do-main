/**
 * Mensagens de "esta função precisa do servidor".
 *
 * PROBLEMA (relatado pelo autor do TCC na rodada 40):
 *
 *   "tem um erro que fala do servidor do eloEscola, resolva isso também"
 *
 * Várias telas diziam literalmente "precisa do servidor do eloEscola". Isso é
 * vocabulário de quem construiu o sistema, não de quem usa. Para o aluno, o
 * professor ou o diretor, "servidor" não significa nada — parece que o app
 * quebrou, ou que existe um "servidor" que deveria estar ligado na tomada.
 *
 * Duas coisas precisam ser ditas juntas, sempre:
 *
 *   1. O QUE não dá para fazer agora, em linguagem de quem usa;
 *   2. POR QUE — e a razão é técnica mas explicável: o site publicado é uma
 *      versão em que o navegador só pode LER dados públicos. Tudo que precisa
 *      gravar, ou que envolve senha, depende de um processo do lado do
 *      servidor com a chave secreta.
 *
 * Por isso as mensagens aqui não mencionam "eloEscola" como se fosse um
 * serviço externo que caiu: o eloEscola é o próprio app, e a limitação é do
 * modo como ele está hospedado.
 *
 * REGRA: nenhuma string de interface deve conter "servidor do eloEscola".
 * `test-round41-linguagem.mjs` verifica isso em todo o `src/`.
 */

/** O motivo, em uma frase, sem jargão. */
export const MOTIVO_SEM_BACKEND =
  "Neste endereço o eloEscola está publicado como site estático: ele consegue " +
  "mostrar as informações, mas não consegue gravar nem conferir senhas.";

/**
 * Monta a mensagem final.
 *
 * @param acao   o que a pessoa tentou fazer ("Salvar as alterações")
 * @param saida  o caminho alternativo, quando existe ("Peça à secretaria")
 */
export function mensagemPrecisaServidor(acao: string, saida?: string): string {
  const base = `${acao} precisa de uma versão do eloEscola com servidor ativo. ${MOTIVO_SEM_BACKEND}`;
  return saida ? `${base} ${saida}` : base;
}

/**
 * Versão curta, para `toast` — onde não cabe uma frase inteira.
 * Diz o essencial: não é bug, é limite do modo publicado.
 */
export function avisoCurtoPrecisaServidor(acao: string): string {
  return `${acao}: disponível apenas na versão com servidor (a publicada é somente leitura).`;
}

/**
 * Para listas e telas que já explicam o contexto por perto: só o motivo,
 * sem repetir "precisa de".
 */
export const EXPLICACAO_MODO_LEITURA =
  "A versão publicada do eloEscola é somente leitura: mostra os dados, mas não " +
  "altera nada. Para editar, use a versão com servidor.";
