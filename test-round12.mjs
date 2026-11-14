/**
 * Testes da rodada 12.
 *
 * Foco nas três correções que podiam causar dano silencioso:
 *  1. confirmação de presença (gravava em rota inexistente → 404 → erro na tela)
 *  2. links de inscrição (risco de mandar o aluno para o site errado)
 *  3. repertório do assistente (respondia qualquer coisa com "escolas")
 *
 * Rodar: npx tsx test-round12.mjs
 */
import { buscarLinkInscricao, limparCacheLinks, ORGANIZADORES_COBERTOS } from "./src/lib/eventLinksService.ts";
import { responderLocalmente, normalizarTexto } from "./src/lib/assistantKnowledge.ts";

let passou = 0;
let falhou = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

console.log("\n=== 1. Links de inscrição — catálogo curado ===");
{
  limparCacheLinks();

  const obmep = await buscarLinkInscricao("OBMEP 2027 - 1ª Fase");
  ok("OBMEP encontrada", obmep.url === "https://www.obmep.org.br/", String(obmep.url));
  ok("fonte catalogo", obmep.fonte === "catalogo");
  ok("organizador identificado", /OBMEP/.test(obmep.organizador ?? ""));

  const obi = await buscarLinkInscricao("Olimpíada Brasileira de Informática (OBI)");
  ok("OBI → IC/UNICAMP", obi.url === "https://olimpiada.ic.unicamp.br/", String(obi.url));

  const onhb = await buscarLinkInscricao("ONHB - Olimpíada Nacional em História do Brasil");
  ok("ONHB", onhb.url === "https://www.olimpiadadehistoria.com.br/", String(onhb.url));

  const ufpr = await buscarLinkInscricao("Vestibular UFPR 2027");
  ok("Vestibular UFPR", /ufpr\.br/.test(ufpr.url ?? ""), String(ufpr.url));

  const jeps = await buscarLinkInscricao("JEPS - Jogos Escolares do Paraná");
  ok("JEPS → SEED-PR", /educacao\.pr\.gov\.br/.test(jeps.url ?? ""), String(jeps.url));

  ok("catálogo cobre 20+ organizadores", ORGANIZADORES_COBERTOS.length >= 20, String(ORGANIZADORES_COBERTOS.length));
}

console.log("\n=== 2. Links de inscrição — sem palpite ===");
{
  limparCacheLinks();
  // Título genérico, sem organizador conhecido. A busca na web vai falhar
  // (rede do sandbox bloqueada), então DEVE devolver null — nunca um chute.
  const generico = await buscarLinkInscricao("Festa Junina da Escola Municipal XYZ", { timeoutMs: 1200 });
  ok("não inventa URL", generico.url === null, String(generico.url));
  ok("avisa que não achou", generico.fonte === "nenhuma");
  ok("observação orienta o usuário", /confirme/i.test(generico.observacao));

  const vazio = await buscarLinkInscricao("");
  ok("título vazio → null", vazio.url === null);
}

console.log("\n=== 3. Repertório do assistente ===");
{
  const ctx = {
    eventos: [
      { title: "Feira de Ciências", day: 20, month: 10, year: 2026, time: "14:00", city: "Araucária", isPaid: false, location: "Ginásio" },
      { title: "Festival de Teatro", day: 27, month: 10, year: 2026, time: "19:00", city: "Curitiba", isPaid: true, price: "R$ 20" },
    ],
  };

  const telefone = responderLocalmente("qual o telefone das escolas?", ctx);
  ok("telefone responde com números", /\d{4}/.test(telefone), telefone.slice(0, 60));
  ok("telefone não vira lista genérica", /Telefones/.test(telefone));

  const endereco = responderLocalmente("onde fica a escola?", ctx);
  ok("endereço responde", /Endereços/.test(endereco));

  const modalidades = responderLocalmente("quais cursos técnicos vocês têm?", ctx);
  ok("modalidades responde", /Modalidades/.test(modalidades));

  const cadastro = responderLocalmente("como faço para criar conta?", ctx);
  ok("cadastro responde", /Como entrar/.test(cadastro));

  const presenca = responderLocalmente("como confirmar presença no evento?", ctx);
  ok("presença responde", /confirmar presença/i.test(presenca));

  const gratuito = responderLocalmente("quais eventos gratuitos?", ctx);
  ok("gratuitos lista só os grátis", /Feira de Ciências/.test(gratuito) && !/Festival de Teatro/.test(gratuito), gratuito);

  const pagos = responderLocalmente("tem evento pago?", ctx);
  ok("pagos lista só os pagos", /Festival de Teatro/.test(pagos) && !/Feira de Ciências/.test(pagos), pagos);

  const acessibilidade = responderLocalmente("tem modo escuro?", ctx);
  ok("acessibilidade responde", /Modo escuro/i.test(acessibilidade));

  const publicar = responderLocalmente("quem pode publicar evento?", ctx);
  ok("permissões responde", /Chefe Administrador/.test(publicar));

  const saudacao = responderLocalmente("oi", { nomeUsuario: "David" });
  ok("saudação personalizada", /David/.test(saudacao), saudacao.slice(0, 40));

  const ajuda = responderLocalmente("o que você pode fazer?", ctx);
  ok("ajuda lista comandos", /leia a tela/.test(ajuda) && /modo escuro/.test(ajuda));

  const desconhecido = responderLocalmente("xyzabc pergunta sem sentido", ctx);
  ok("desconhecido não fica vazio", desconhecido.length > 50);
  ok("desconhecido é honesto", /Não tenho essa informação/.test(desconhecido));
}

console.log("\n=== 4. Escola específica ganha da pergunta genérica ===");
{
  const wysocki = responderLocalmente("me fala da escola Helena Wysocki");
  ok("identifica a escola certa", /Helena Wysocki/.test(wysocki), wysocki.slice(0, 60));
  ok("traz telefone da escola", /\d{4}/.test(wysocki));

  const szymanski = responderLocalmente("quero saber do Julio Szymanski");
  ok("identifica Szymanski", /Szymanski/.test(szymanski), szymanski.slice(0, 60));
}

console.log("\n=== 5. Normalização ===");
{
  ok("remove acento", normalizarTexto("Ação Órfã") === "acao orfa");
  ok("remove pontuação", normalizarTexto("oi, tudo bem?") === "oi tudo bem");
  ok("colapsa espaços", normalizarTexto("a    b") === "a b");
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
