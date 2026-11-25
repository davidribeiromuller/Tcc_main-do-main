/**
 * Máscaras de entrada brasileiras — um só lugar para CPF, CNPJ e telefone.
 *
 * POR QUE CENTRALIZAR (rodada 40):
 *
 * A tela de cadastro formata o CPF à mão no componente (`handleCpfChange`) e o
 * telefone com uma função de 40 linhas cheia de `if` aninhados que produzia
 * máscaras inconsistentes: `(41) 9 9999-9999`, `+55 41 9 9999-9999` e o que o
 * usuário digitasse colado. Cada tela nova repetia a lógica (ou esquecia).
 *
 * Aqui as funções são puras: recebem o que foi digitado, devolvem o texto
 * formatado. O `input` guarda o valor formatado e o envio usa `somenteDigitos`.
 *
 * Regra de produto: quem digita vê máscara; quem envia manda dígitos. O banco
 * nunca recebe `(41) 99999-9999` — recebe `41999999999`.
 */

/** Remove tudo que não é dígito. */
export function somenteDigitos(valor: string): string {
  return String(valor ?? "").replace(/\D/g, "");
}

/**
 * CPF no formato `000.000.000-00`, formatado progressivamente.
 *
 * Mascarar durante a digitação (e não só no `blur`) é o que evita o usuário
 * perder a conta de quantos dígitos faltam.
 */
export function formatarCPF(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * CNPJ no formato `00.000.000/0000-00`.
 *
 * Existe porque o contato comercial atende escolas, e escola é CNPJ — o
 * formulário antigo não tinha onde informar isso.
 */
export function formatarCNPJ(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Telefone brasileiro no formato `(41) 99999-9999` (celular) ou
 * `(41) 3333-4444` (fixo), formatado progressivamente.
 *
 * Decisões:
 *  - DDD obrigatório entre parênteses, como as pessoas escrevem no Brasil;
 *  - 9 dígitos após o DDD → hífen depois do 5º (celular);
 *  - 8 dígitos → hífen depois do 4º (fixo);
 *  - enquanto o usuário digita, o hífen aparece só quando dá para saber;
 *  - aceita `+55` na entrada e DESCARTA: o app é nacional, e guardar o prefixo
 *    fazia o mesmo número existir em dois formatos (`+5541...` e `4199...`),
 *    o que quebra a checagem de telefone duplicado.
 */
export function formatarTelefone(valor: string): string {
  let d = somenteDigitos(valor);
  // Prefixo do país (55) + DDD: remove o 55 quando o número tem tamanho de
  // telefone brasileiro com o código do país.
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);

  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;

  const ddd = d.slice(0, 2);
  const resto = d.slice(2);

  /*
    Posição do hífen:
      - 9 dígitos → celular: quebra depois do 5º  (99999-9999);
      - 8 dígitos → fixo:     quebra depois do 4º  (3333-4444);
      - menos de 8 (ainda digitando): usa 5, que é o caso mais comum hoje.
    Enquanto o número está incompleto o hífen "anda" — é o comportamento
    esperado de máscara progressiva, não um bug.
  */
  const posicaoHifen = resto.length === 8 ? 4 : 5;
  if (resto.length <= posicaoHifen) return `(${ddd}) ${resto}`;

  return `(${ddd}) ${resto.slice(0, posicaoHifen)}-${resto.slice(posicaoHifen)}`;
}

/** `true` quando o telefone tem DDD + 8 ou 9 dígitos. */
export function telefoneValido(valor: string): boolean {
  const d = somenteDigitos(valor);
  const semPais = d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
  return /^[1-9]{2}9?\d{8}$/.test(semPais);
}

/** Telefone só com dígitos, no formato que o banco guarda (`41999999999`). */
export function telefoneParaEnvio(valor: string): string {
  const d = somenteDigitos(valor);
  const semPais = d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
  return semPais;
}

/**
 * Telefone para o link do WhatsApp (`55DDDNUMERO`, só dígitos).
 *
 * É o formato que `https://wa.me/<numero>` exige: código do país + DDD +
 * número, sem `+`, sem espaço, sem hífen. Um `+` ou um parêntese aqui faz o
 * link abrir a conversa errada.
 */
export function telefoneParaWhatsApp(valor: string): string {
  const d = telefoneParaEnvio(valor);
  if (d.length < 10) return "";
  return `55${d}`;
}

/** Formata o CEP `00000-000`. */
export function formatarCEP(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}
