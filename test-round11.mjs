/**
 * Testes da rodada 11 — acessibilidade por voz e tema na introdução.
 *
 * Cobre a interpretação de instruções (que é a parte onde um erro faz o
 * assistente executar a ação errada) e a extração de campos do evento.
 *
 * Rodar: node test-round11.mjs
 */
import {
  interpretarInstrucao,
  extrairCamposEvento,
  ehConfirmacao,
  executarAcao,
} from "./src/lib/voiceActions.ts";
import { limparParaFala } from "./src/lib/voiceAccessibility.ts";

let passou = 0;
let falhou = 0;

function ok(nome, condicao, detalhe = "") {
  if (condicao) {
    passou++;
    console.log(`  ✓ ${nome}`);
  } else {
    falhou++;
    console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

console.log("\n=== 1. Limpeza de Markdown para fala ===");
{
  const entrada =
    "🌟 **Escolas** de Araucária:\n- 1. Szymanski\n- 2. Wysocki\n\nClique [aqui](https://x.com) para ver.";
  const saida = limparParaFala(entrada);
  ok("remove asteriscos", !saida.includes("*"));
  ok("remove emoji", !/🌟/u.test(saida));
  ok("remove colchetes de link", !saida.includes("[") && !saida.includes("]"));
  ok("mantém o texto do link", saida.includes("aqui"));
  ok("mantém as palavras", saida.includes("Szymanski") && saida.includes("Wysocki"));
  ok("não deixa espaço duplo", !saida.includes("  "), JSON.stringify(saida));
  ok("mantém o conteúdo legível", saida.includes("Escolas de Araucária"));
}

console.log("\n=== 2. Temas ===");
{
  ok("modo escuro", interpretarInstrucao("ativar modo escuro").tipo === "modo_escuro");
  ok("modo escuro sem acento", interpretarInstrucao("ativar modo escuro").tipo === "modo_escuro");
  ok("tema escuro", interpretarInstrucao("quero o tema escuro").tipo === "modo_escuro");
  ok("modo claro", interpretarInstrucao("voltar para o modo claro").tipo === "modo_claro");
  ok("alternar", interpretarInstrucao("trocar o tema").tipo === "alternar_tema");
  ok("dark", interpretarInstrucao("ativar dark mode").tipo === "modo_escuro");
  ok("sem ação executada", interpretarInstrucao("ativar modo escuro").requerConfirmacao === false);
}

console.log("\n=== 3. Leitura de tela ===");
{
  ok("ler a tela", interpretarInstrucao("leia a tela").tipo === "ler_tela");
  ok("ler a tela com acento", interpretarInstrucao("lê a tela pra mim").tipo === "ler_tela");
  ok("descreva a página", interpretarInstrucao("descreva a página").tipo === "ler_tela");
  ok("parar de ler", interpretarInstrucao("parar de ler").tipo === "parar_leitura");
  ok("pare", interpretarInstrucao("pare").tipo === "parar_leitura");
  ok(
    "'parar de ler' não vira 'ler_tela'",
    interpretarInstrucao("pode parar de ler").tipo === "parar_leitura"
  );
}

console.log("\n=== 4. Navegação ===");
{
  ok("abrir painel", interpretarInstrucao("abrir o painel").tipo === "navegar");
  ok("painel → admin", interpretarInstrucao("abrir o painel").destino === "admin");
  ok("ir para o mapa", interpretarInstrucao("ir para o mapa").destino === "map");
  ok("ver escolas", interpretarInstrucao("ver escolas").destino === "schools");
  ok("abrir calendário", interpretarInstrucao("abrir o calendário").destino === "calendar");
  ok("configurações", interpretarInstrucao("ir para configurações").destino === "settings");
  ok("eventos → feed", interpretarInstrucao("abrir eventos").destino === "feed");
}

console.log("\n=== 5. Criar evento exige confirmação ===");
{
  const a = interpretarInstrucao("crie um evento chamado Feira de Ciências em 20 de novembro às 14h no ginásio");
  ok("reconhecido como preencher_evento", a.tipo === "preencher_evento", a.tipo);
  ok("exige confirmação", a.requerConfirmacao === true);
  ok("título extraído", a.campos?.title === "Feira de Ciências", JSON.stringify(a.campos));
  ok("dia extraído", a.campos?.day === 20, String(a.campos?.day));
  ok("mês extraído (0-index)", a.campos?.month === 10, String(a.campos?.month));
  ok("hora extraída", a.campos?.time === "14:00", String(a.campos?.time));
  ok("local extraído", /ginásio/i.test(a.campos?.location ?? ""), String(a.campos?.location));
  ok("descrição pede confirmação", /confirma\?/i.test(a.descricao));
  ok("descrição avisa que não publica", /não publico/i.test(a.descricao));
}

console.log("\n=== 6. Extração de campos em variações ===");
{
  const c1 = extrairCamposEvento("cadastre o evento Reunião de Pais dia 5 de março de 2027 as 19 horas");
  ok("dia em palavra+extenso", c1.day === 5, String(c1.day));
  ok("março", c1.month === 2, String(c1.month));
  ok("ano", c1.year === 2027, String(c1.year));
  ok("hora", c1.time === "19:00", String(c1.time));

  const c2 = extrairCamposEvento("criar evento Mostra Cultural em 22/11/2026 às 09:30 entrada gratuita");
  ok("data numérica dia", c2.day === 22, String(c2.day));
  ok("data numérica mês", c2.month === 10, String(c2.month));
  ok("data numérica ano", c2.year === 2026, String(c2.year));
  ok("gratuito", c2.isPaid === false, String(c2.isPaid));

  const c3 = extrairCamposEvento("crie um evento Olimpíada de Robótica em 3 de abril de 2027 no auditório");
  ok("título Olimpíada de Robótica", c3.title === "Olimpíada de Robótica", String(c3.title));
  ok("auditório", /auditório/i.test(c3.location ?? ""), String(c3.location));
}

console.log("\n=== 7. Confirmação ===");
{
  ok("sim", ehConfirmacao("sim") === true);
  ok("pode", ehConfirmacao("pode") === true);
  ok("confirmo", ehConfirmacao("confirmo") === true);
  ok("beleza", ehConfirmacao("beleza") === true);
  ok("não", ehConfirmacao("não") === false);
  ok("cancela", ehConfirmacao("cancela") === false);
  ok("'não, pode deixar' NÃO confirma", ehConfirmacao("não, pode deixar") === false);
  ok("vazio não confirma", ehConfirmacao("") === false);
  ok("texto ambíguo não confirma", ehConfirmacao("talvez depois") === false);
}

console.log("\n=== 8. Execução respeita estado do tema ===");
{
  const registros = [];
  const ctx = {
    temaAtual: "light",
    alternarTema: () => {
      registros.push("toggle");
      return "dark";
    },
    navegar: (t) => registros.push(`nav:${t}`),
    descreverTela: () => "Mural de Eventos. Próximos eventos: Feira.",
    pararLeitura: () => registros.push("parar"),
    preencherEvento: (c) => registros.push(`form:${c.title}`),
    usuario: null,
  };

  const r1 = executarAcao(interpretarInstrucao("modo escuro"), ctx);
  ok("troca para escuro", r1.executada && registros.includes("toggle"));

  const ctxEscuro = { ...ctx, temaAtual: "dark" };
  registros.length = 0;
  const r2 = executarAcao(interpretarInstrucao("modo escuro"), ctxEscuro);
  ok("já escuro → não alterna", registros.length === 0, JSON.stringify(registros));
  ok("já escuro → avisa", /já está ativo/i.test(r2.mensagem));

  registros.length = 0;
  const r3 = executarAcao(interpretarInstrucao("leia a tela"), ctx);
  ok("lê a tela", /Mural de Eventos/.test(r3.mensagem));

  registros.length = 0;
  executarAcao(interpretarInstrucao("abrir o mapa"), ctx);
  ok("navega para o mapa", registros.includes("nav:map"));
}

console.log("\n=== 9. Instrução comum não vira ação ===");
{
  ok(
    "pergunta sobre escolas não vira ação",
    interpretarInstrucao("quais são as escolas de Araucária?").tipo === "nenhuma",
    interpretarInstrucao("quais são as escolas de Araucária?").tipo
  );
  ok(
    "pergunta sobre eventos gratuitos não vira ação",
    interpretarInstrucao("quais eventos são gratuitos?").tipo === "nenhuma",
    interpretarInstrucao("quais eventos são gratuitos?").tipo
  );
  ok("vazio não vira ação", interpretarInstrucao("").tipo === "nenhuma");
  ok("ajuda", interpretarInstrucao("o que você pode fazer?").tipo === "ajuda");
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
