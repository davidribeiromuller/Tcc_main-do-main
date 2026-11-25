/**
 * Rodada 40 — integração do contato comercial com o servidor real.
 *
 * Sobe o `server.ts` de verdade contra um PostgREST simulado e confere o que o
 * formulário do site faz quando alguém envia um contato:
 *
 *   - o lead é GRAVADO em `sales_leads` (com CNPJ e mensagem preservados);
 *   - o telefone é gravado só com dígitos (o banco não recebe parênteses);
 *   - o aviso no WhatsApp devolve `canal: "link"` e `entregue: false` quando
 *     não há API oficial configurada — nunca um falso "enviado";
 *   - e-mail inválido é recusado antes de gravar.
 *
 * Roda com: npx tsx test-round40-lead-integracao.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { subirBancoSimulado } from "./test-helpers/mockPostgrest.mjs";

const PORTA_BANCO = 9940;
const PORTA_APP = 3140;

let ok = 0;
const falhas = [];
function check(nome, cond, detalhe = "") {
  if (cond) {
    ok++;
    console.log(`  ✓ ${nome}`);
  } else {
    falhas.push({ nome, detalhe });
    console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

const banco = await subirBancoSimulado(PORTA_BANCO, { tabelasExtras: { sales_leads: [] } });

const proc = spawn("npx", ["tsx", "server.ts"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(PORTA_APP),
    SUPABASE_URL: `http://127.0.0.1:${PORTA_BANCO}`,
    SUPABASE_SECRET_KEY: "chave-de-teste-nao-e-segredo",
    SESSION_SECRET: "0123456789abcdef0123456789abcdef",
    NODE_ENV: "development",
  },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});

async function esperar(url, tentativas = 60) {
  for (let i = 0; i < tentativas; i++) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* subindo */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

try {
  const subiu = await esperar(`http://127.0.0.1:${PORTA_APP}/api/health`);
  check("servidor sobe", subiu);
  if (!subiu) throw new Error("servidor não subiu");

  const base = `http://127.0.0.1:${PORTA_APP}`;

  // --- 1. contato válido ---
  const resposta = await fetch(`${base}/api/saas/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Maria Teste",
      email: "Maria.Teste@Escola.PR.gov.br",
      phone: "(41) 99999-9999",
      schoolName: "CE Helena Wysocki",
      cnpj: "12.345.678/0001-99",
      city: "Araucária",
      state: "PR",
      planInterest: "escola",
      message: "Temos 120 alunos e queremos começar em março.",
      source: "site_planos",
    }),
  });
  const corpo = await resposta.json();

  check("responde 201", resposta.status === 201, `status=${resposta.status}`);
  check("declara o lead salvo", corpo.saved === true);
  check("informa que o WhatsApp NÃO foi automático", corpo.whatsapp?.automatico === false);
  check(
    "não afirma entrega quando não houve entrega",
    corpo.whatsapp?.entregue === false,
    JSON.stringify(corpo.whatsapp)
  );
  check("entrega o link pronto para a equipe", /^https:\/\/wa\.me\/5541995119914\?text=/.test(corpo.whatsapp?.link || ""));
  check(
    "explica por que não foi automático",
    /WHATSAPP_TOKEN/.test(corpo.whatsapp?.motivo || "")
  );

  // --- 2. o que chegou ao banco ---
  /*
    O `supabase-js` envia o INSERT como ARRAY (`[{...}]`), mesmo quando o
    código chama `.insert([umObjeto])`. Aqui normalizamos os dois formatos —
    foi o que fez três verificações falharem na primeira execução, com
    `phone=undefined`, sem que houvesse nada errado na gravação.
  */
  const escrita = banco.escritas.filter((e) => e.tabela === "sales_leads").pop() || {};
  const gravadoBruto = escrita.dados;
  const gravado = Array.isArray(gravadoBruto) ? gravadoBruto[0] : gravadoBruto;
  check("gravou na tabela sales_leads", Boolean(gravado));
  check("telefone salvo só com dígitos", gravado?.phone === "41999999999", `phone=${gravado?.phone}`);
  check("e-mail salvo em minúsculas", gravado?.email === "maria.teste@escola.pr.gov.br", `email=${gravado?.email}`);
  check(
    "CNPJ e mensagem preservados em notes",
    String(gravado?.notes || "").includes("12.345.678/0001-99") &&
      String(gravado?.notes || "").includes("120 alunos")
  );

  // --- 3. e-mail inválido não grava ---
  const antes = banco.escritas.length;
  const invalido = await fetch(`${base}/api/saas/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Sem Email", email: "nao-e-email" }),
  });
  check("e-mail inválido responde 400", invalido.status === 400, `status=${invalido.status}`);
  check("e-mail inválido não grava nada", banco.escritas.length === antes);

  // --- 4. sem nome ---
  const semNome = await fetch(`${base}/api/saas/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "ok@escola.pr.gov.br" }),
  });
  check("sem nome responde 400", semNome.status === 400, `status=${semNome.status}`);
} finally {
  try {
    if (proc.pid) process.kill(-proc.pid, "SIGKILL");
  } catch {
    /* já morreu */
  }
  await banco.fechar();
}

const total = ok + falhas.length;
console.log(`\n${ok}/${total} verificações passaram`);
if (falhas.length > 0) {
  console.log("\nFALHAS:");
  for (const f of falhas) console.log(` - ${f.nome}${f.detalhe ? `: ${f.detalhe}` : ""}`);
  process.exit(1);
}
