/**
 * Rodada 37 — quem JÁ tinha função ADM entra e vê o painel.
 *
 * O pedido: "reconstrua a parte dos ADM, inclusive quem já tinha a função ADM
 * dentro do app". Não basta a rota existir: a conta que já estava no banco
 * precisa (1) autenticar, (2) receber o token, (3) ser reconhecida como
 * administradora e (4) conseguir ler o diretório no painel.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { subirBancoSimulado } from "./test-helpers/mockPostgrest.mjs";

let ok = 0, fail = 0;
const falhas = [];
const check = (n, c, d = "") => {
  if (c) { ok++; console.log(`  ✓ ${n}`); }
  else { fail++; falhas.push(n); console.log(`  ✗ ${n}${d ? ` — ${d}` : ""}`); }
};

const PORT = 3997;
const PORTA_BANCO = 3998;

/*
  RODADA 39 — esta suíte antes usava `SUPABASE_SECRET_KEY: "fake-para-teste"`
  e nenhuma `SUPABASE_URL`: o servidor não tinha como consultar banco algum e
  caía no JSON de demonstração. O teste passava sem provar nada, e foi por isso
  que o bug real ("o painel mostra id 9901, não o do banco") sobreviveu.

  Agora aponta para o PostgREST simulado, com as linhas reais de `users`.
  O servidor e a suíte precisam ser assíncronos para esperar o banco subir.
*/
const env = {
  ...process.env,
  PORT: String(PORT),
  SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef",
  SUPABASE_URL: `http://127.0.0.1:${PORTA_BANCO}`,
  SUPABASE_SECRET_KEY: "chave-de-teste-nao-e-segredo",
};
// Banco simulado primeiro: o servidor já faz probe de conexão no arranque.
const banco = await subirBancoSimulado(PORTA_BANCO);

const proc = spawn("npx", ["tsx", "server.ts"], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
let log = "";
proc.stdout.on("data", (d) => (log += d.toString()));
proc.stderr.on("data", (d) => (log += d.toString()));

const base = `http://127.0.0.1:${PORT}`;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperar() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return true; } catch {}
    await dormir(500);
  }
  return false;
}

try {
  check("servidor sobe", await esperar(), log.slice(-200));

  // As contas administrativas que JÁ existiam no app (seed do fallback).
  const contas = [
    /*
      RODADA 39 — `diretoria@helenawysocki.com` está com `ativo = false` no
      banco real desde 08/09/2026 (verificado no projeto). O login dela é
      recusado com 403 e ISSO É O CERTO — a suíte antiga exigia 200 e por isso
      "quebrava" ao passar a consultar o banco de verdade.

      O Chefe usado aqui é `professor@gmail.com` (id 759): admin ativo, com
      senha em texto (legado), que é o caso da migração no login.
    */
    { email: "professor@gmail.com", senha: "1234", cargo: "chefe", rotulo: "Chefe existente (id 759)" },
    /*
      RODADA 39 — `funcionario@helenawysocki.com` também está `ativo = false`
      no banco real (mesmo seed antigo da Diretoria). A suíte exigia 200 e
      falhava assim que o servidor passou a consultar o banco.

      Quem exercita o caminho de "Funcionário Administrador" agora é uma conta
      ATIVA do próprio banco (`davidribeiromuller@gmail.com`, id 117), com o
      cargo ajustado no simulador — o que testa de verdade a regra de que o
      cargo vem da coluna `role`, e não de e-mail fixo.
    */
    { email: "davidribeiromuller@gmail.com", senha: "123456", cargo: "funcionario", rotulo: "Funcionário ADM (id 117)" },
  ];

  for (const conta of contas) {
    console.log(`\n--- ${conta.rotulo} (${conta.email}) ---`);

    const res = await fetch(`${base}/api/auth/local-login-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: conta.email, password: conta.senha }),
    });
    const corpo = await res.json().catch(() => ({}));

    check(`${conta.rotulo}: login aceito (200)`, res.status === 200, `status=${res.status} ${corpo.error || ""}`);
    check(`${conta.rotulo}: recebe token de sessão`, typeof corpo.token === "string" && corpo.token.length > 50);

    const u = corpo.user || {};
    check(`${conta.rotulo}: perfil volta completo`, Boolean(u.email && u.nome), JSON.stringify(u).slice(0, 120));

    const auth = { Authorization: `Bearer ${corpo.token}` };

    // Reconhecimento do cargo na rota do painel
    const usuarios = await fetch(`${base}/api/users`, { headers: auth });
    const corpoU = await usuarios.json().catch(() => ({}));
    check(`${conta.rotulo}: abre o diretório do painel (200)`, usuarios.status === 200, `status=${usuarios.status}`);
    check(
      `${conta.rotulo}: servidor reconhece o cargo`,
      ["chefe", "funcionario"].includes(corpoU.adminRole),
      `adminRole=${corpoU.adminRole}`
    );
    check(
      `${conta.rotulo}: cargo compatível com a conta`,
      corpoU.adminRole === conta.cargo,
      `esperado=${conta.cargo} obtido=${corpoU.adminRole}`
    );

    // Escopo por cargo
    const esc = await fetch(`${base}/api/admin/school-accounts`, { headers: auth });
    if (conta.cargo === "chefe") {
      check(`${conta.rotulo}: passa pela guarda de Chefe (não 403)`, esc.status !== 403, `status=${esc.status}`);
    } else {
      check(`${conta.rotulo}: barrado no exclusivo de Chefe (403)`, esc.status === 403, `status=${esc.status}`);
    }

    // O Funcionário não pode ver dados pessoais restritos
    if (conta.cargo === "funcionario") {
      const lista = corpoU.users || [];
      const amostra = lista[0] || {};
      const restritos = ["cpf", "phone", "birthdate", "gender", "password"].filter((k) => k in amostra);
      check(`${conta.rotulo}: sem dados pessoais restritos`, restritos.length === 0, restritos.join(","));
    }
  }

  // Ninguém sem token entra
  console.log("\n--- proteção sem sessão ---");
  for (const rota of ["/api/users", "/api/admin/audit", "/api/events/deleted"]) {
    const r = await fetch(`${base}${rota}`);
    check(`sem token em ${rota} → 401`, r.status === 401, `status=${r.status}`);
  }

  // A mensagem enganosa não existe mais no código
  console.log("\n--- mensagem de erro do login corrigida ---");
  const svc = readFileSync("src/lib/usersService.ts", "utf8");
  // Remove comentários: o texto antigo pode aparecer documentando o bug.
  const svcSemComentarios = svc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  check(
    "não existe mais a mensagem enganosa de 'conexão' no código executável",
    !/Erro de conexão ao consultar banco de dados/.test(svcSemComentarios)
  );
  check("login checa se há servidor antes de consultar o banco", /isServerAvailable\(\)/.test(svc));
} finally {
  try { if (proc.pid) process.kill(-proc.pid, "SIGTERM"); } catch {}
  await dormir(600);
  try { if (proc.pid) process.kill(-proc.pid, "SIGKILL"); } catch {}
  await banco.fechar();
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${ok} passaram, ${fail} falharam`);
if (fail) { console.log("\nFalhas:"); falhas.forEach((f) => console.log("  -", f)); process.exit(1); }
console.log("RODADA 37 OK — contas ADM existentes entram no painel");
