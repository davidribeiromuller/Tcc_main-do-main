/**
 * Rodada 40 — máscaras reais, contato comercial no topo, WhatsApp e o erro
 * "servidor do eloEscola".
 *
 * Testa comportamento, não texto: as máscaras são executadas com entradas
 * reais, e o link do WhatsApp é conferido como URL (é ele que abre a conversa
 * certa — um `+` no lugar errado abre a conversa de outra pessoa).
 *
 * Roda com: npx tsx test-round40-contato-e-mascaras.mjs
 */
import assert from "node:assert/strict";

import {
  formatarCPF,
  formatarCNPJ,
  formatarTelefone,
  telefoneValido,
  telefoneParaEnvio,
  telefoneParaWhatsApp,
} from "./src/lib/formMasks.ts";
import {
  montarMensagemAviso,
  linkWhatsAppDoLead,
  WHATSAPP_COMERCIAL,
} from "./src/lib/salesContact.ts";

let ok = 0;
const falhas = [];
function check(nome, fn) {
  try {
    fn();
    ok++;
    console.log(`  ✓ ${nome}`);
  } catch (erro) {
    falhas.push({ nome, erro });
    console.log(`  ✗ ${nome}\n      ${erro.message}`);
  }
}

console.log("\n[1] CPF: máscara 000.000.000-00 progressiva");
check("11111111111 vira 111.111.111-11", () =>
  assert.equal(formatarCPF("11111111111"), "111.111.111-11"));
check("formata durante a digitação", () => {
  assert.equal(formatarCPF("1111"), "111.1");
  assert.equal(formatarCPF("1111111"), "111.111.1");
  assert.equal(formatarCPF("1111111111"), "111.111.111-1");
});
check("não perde dígitos se o usuário colar formatado", () =>
  assert.equal(formatarCPF("111.111.111-11"), "111.111.111-11"));
check("descarta dígitos além de 11", () =>
  assert.equal(formatarCPF("111111111119999"), "111.111.111-11"));

console.log("\n[2] Telefone: (DDD) 9XXXX-XXXX");
check("celular completo", () =>
  assert.equal(formatarTelefone("41999999999"), "(41) 99999-9999"));
check("fixo completo usa 4 dígitos antes do hífen", () =>
  assert.equal(formatarTelefone("4133334444"), "(41) 3333-4444"));
check("aceita +55 e normaliza (sem duplicar o número)", () => {
  assert.equal(formatarTelefone("+55 41 99999-9999"), "(41) 99999-9999");
  assert.equal(telefoneParaEnvio("+55 41 99999-9999"), "41999999999");
});
check("o mesmo número em formatos diferentes vira o mesmo valor de envio", () =>
  assert.equal(
    telefoneParaEnvio("(41) 99999-9999"),
    telefoneParaEnvio("+5541999999999")
  ));
check("valida DDD + 8 ou 9 dígitos", () => {
  assert.equal(telefoneValido("41999999999"), true);
  assert.equal(telefoneValido("4133334444"), true);
  assert.equal(telefoneValido("419999"), false);
  assert.equal(telefoneValido(""), false);
});
check("máscara incompleta não vira número válido", () =>
  assert.equal(telefoneValido(formatarTelefone("4199")), false));

console.log("\n[3] CNPJ: 00.000.000/0000-00");
check("formata completo", () =>
  assert.equal(formatarCNPJ("12345678000199"), "12.345.678/0001-99"));
check("formata durante a digitação", () => {
  assert.equal(formatarCNPJ("12"), "12");
  assert.equal(formatarCNPJ("12345"), "12.345");
  assert.equal(formatarCNPJ("12345678"), "12.345.678");
  assert.equal(formatarCNPJ("123456780001"), "12.345.678/0001");
});

console.log("\n[4] WhatsApp: link correto para (41) 99511-9914");
check("o número comercial é o informado pelo autor", () =>
  assert.equal(WHATSAPP_COMERCIAL, "5541995119914"));
check("link usa wa.me com DDI 55 e só dígitos", () => {
  const link = linkWhatsAppDoLead({ nome: "Maria", email: "maria@escola.pr.gov.br" });
  assert.match(link, /^https:\/\/wa\.me\/5541995119914\?text=/);
});
check("mensagem é codificada (não corta em & ou +)", () => {
  const link = linkWhatsAppDoLead({
    nome: "Maria & João",
    email: "maria+teste@escola.pr.gov.br",
    mensagem: "Quero saber sobre boleto & Pix",
  });
  const texto = decodeURIComponent(link.split("?text=")[1]);
  assert.ok(texto.includes("Maria & João"));
  assert.ok(texto.includes("maria+teste@escola.pr.gov.br"));
  assert.ok(texto.includes("boleto & Pix"));
});
check("mensagem leva os campos que importam", () => {
  const texto = montarMensagemAviso({
    nome: "Maria",
    email: "maria@escola.pr.gov.br",
    telefone: "41999999999",
    escola: "CE Helena Wysocki",
    cnpj: "12.345.678/0001-99",
    cidade: "Araucária",
    uf: "PR",
    plano: "Escola",
    mensagem: "120 alunos",
  });
  for (const trecho of [
    "Maria",
    "maria@escola.pr.gov.br",
    "41999999999",
    "CE Helena Wysocki",
    "12.345.678/0001-99",
    "Araucária/PR",
    "Escola",
    "120 alunos",
  ]) {
    assert.ok(texto.includes(trecho), `faltou "${trecho}" na mensagem`);
  }
});

console.log("\n[5] Tela de planos: contato no TOPO e sem fetch cru");
{
  const fs = await import("node:fs");
  const tela = fs.readFileSync("src/components/PlansAndPricing.tsx", "utf8");

  check("o formulário vem ANTES da lista de planos", () => {
    const posContato = tela.indexOf('id="contato-comercial"');
    const posPlanos = tela.indexOf("PLANOS");
    assert.ok(posContato > -1, "seção de contato não encontrada");
    assert.ok(posPlanos > -1, "seção de planos não encontrada");
    assert.ok(posContato < posPlanos, "contato deveria estar acima dos planos");
  });

  check("campos têm rótulo (label) e não só placeholder", () => {
    for (const id of ["contato-nome", "contato-email", "contato-telefone", "contato-cnpj"]) {
      assert.ok(tela.includes(`htmlFor="${id}"`), `falta label para ${id}`);
      assert.ok(tela.includes(`id="${id}"`), `falta input ${id}`);
    }
  });

  check("usa as máscaras centralizadas", () => {
    assert.ok(tela.includes("formatarTelefone"));
    assert.ok(tela.includes("formatarCNPJ"));
  });

  check("não faz fetch cru para /api", () => {
    assert.doesNotMatch(tela, /await fetch\("\/api/);
  });

  check("diz que o envio automático de WhatsApp exige API oficial", () => {
    assert.match(tela, /API oficial do WhatsApp Business/);
  });

  check("não promete envio automático quando ele não existe", () => {
    // A tela deve oferecer o LINK (clique), não afirmar "mensagem enviada".
    assert.ok(tela.includes("linkWhatsApp"));
    assert.doesNotMatch(tela, /mensagem enviada com sucesso/i);
  });
}

console.log("\n[6] Catálogo: cai para o banco quando não há servidor");
{
  const fs = await import("node:fs");
  const svc = fs.readFileSync("src/lib/plansService.ts", "utf8");

  check("existe leitura pública de plans/plan_addons", () => {
    assert.ok(svc.includes('from("plans")'));
    assert.ok(svc.includes('from("plan_addons")'));
    assert.ok(svc.includes("is_public"));
  });

  check("a tela usa o carregador com fallback", () => {
    const tela = fs.readFileSync("src/components/PlansAndPricing.tsx", "utf8");
    assert.ok(tela.includes("carregarCatalogoDePlanos"));
  });

  check("o caminho do servidor tem timeout (não trava em 'Carregando')", () => {
    // Sem `signal`, um servidor que aceita a conexão e não responde deixava a
    // promessa pendurada: a tela ficava em "Carregando planos…" para sempre.
    assert.match(svc, /AbortSignal\.timeout\(8000\)/);
    assert.match(svc, /tempo esgotado ao consultar o banco/);
  });

  check("erro técnico não vaza para a tela", () => {
    const trecho = svc.slice(svc.indexOf("export async function fetchPlansCatalogDirect"));
    // "TypeError: fetch failed" já apareceu na tela de planos; é diagnóstico
    // de console, não mensagem de produto.
    // O detalhe técnico pode (e deve) ir para o console; o que não pode é
    // virar texto da tela.
    assert.match(trecho.slice(0, 6000), /console\.warn\("\[plansService\]/);
    assert.doesNotMatch(trecho.slice(0, 6000), /error: err\?\.message/);
  });

  check("o fallback não inventa vagas de fundador", () => {
    // availableSlots vem zerado no caminho público: mostrar "3 vagas" seria
    // mentira se já houvesse adesões.
    const trecho = svc.slice(svc.indexOf("export async function fetchPlansCatalogDirect"));
    assert.match(trecho.slice(0, 6000), /availableSlots: 0/);
  });
}

console.log("\n[7] Mensagem do login não culpa 'o servidor do eloEscola'");
{
  const fs = await import("node:fs");
  const login = fs.readFileSync("src/components/Login.tsx", "utf8");
  check("o texto explica o motivo e dá a saída", () => {
    // A intenção: dizer o limite (somente leitura / versão com servidor) sem
    // jargão. O texto exato pode mudar; o que não pode é faltar a saída.
    assert.match(login, /somente leitura/);
    assert.match(login, /versão com servidor/);
    assert.match(login, /visitante/i);
  });
  check("não diz mais que o servidor 'precisa' sem explicar", () => {
    assert.doesNotMatch(login, /precisa do servidor do eloEscola\. Esta versão publicada é a demonstração estática/);
  });
}

console.log("\n[8] Servidor: aviso no WhatsApp é honesto");
{
  const fs = await import("node:fs");
  const server = fs.readFileSync("server.ts", "utf8");
  const notify = fs.readFileSync("src/lib/whatsappNotify.ts", "utf8");

  check("a rota grava o lead antes de tentar avisar", () => {
    const rota = server.slice(server.indexOf('app.post("/api/saas/leads"'));
    const posLead = rota.indexOf("createSalesLead");
    const posAviso = rota.indexOf("avisarEquipeNoWhatsApp");
    assert.ok(posLead > -1 && posAviso > -1);
    assert.ok(posLead < posAviso, "o aviso não pode acontecer antes da gravação");
  });

  check("a resposta separa 'salvo' de 'whatsapp'", () => {
    const rota = server.slice(server.indexOf('app.post("/api/saas/leads"'));
    assert.match(rota.slice(0, 3000), /saved: true/);
    assert.match(rota.slice(0, 3000), /whatsapp:/);
  });

  check("sem credenciais, devolve canal 'link' e entregue=false", () => {
    assert.match(notify, /canal: "link"/);
    assert.match(notify, /entregue: false/);
    assert.match(notify, /WHATSAPP_TOKEN/);
  });

  check("nunca lança exceção (lead não pode se perder por causa do aviso)", () => {
    assert.match(notify, /catch \(err: any\)/);
    const corpo = notify.slice(notify.indexOf("export async function avisarEquipeNoWhatsApp"));
    assert.doesNotMatch(corpo, /throw /);
  });
}

const total = ok + falhas.length;
console.log(`\n${ok}/${total} verificações passaram`);
if (falhas.length > 0) {
  console.log("\nFALHAS:");
  for (const f of falhas) console.log(` - ${f.nome}: ${f.erro.message}`);
  process.exit(1);
}
