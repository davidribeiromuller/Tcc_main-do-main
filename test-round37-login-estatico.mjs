/**
 * Rodada 37 — login no modo estático (GitHub Pages).
 *
 * BUG QUE ESTE TESTE TRAVA:
 * no deploy real (GitHub Pages, sem Express), o app caía num "caminho 2" de
 * autenticação que consultava a tabela `users` com a chave PUBLICÁVEL. A RLS
 * só permite `users_self_read`, então a consulta falhava e a tela mostrava
 * "Erro de conexão ao consultar banco de dados" — mensagem errada em dois
 * sentidos: não era a conexão do usuário, e a consulta nunca poderia dar certo
 * (a tabela guarda hashes de senha e é fechada para o navegador de propósito).
 *
 * Aqui simulamos um host github.io em que TODA rota /api/* devolve o HTML do
 * SPA (exatamente o que o fallback de 404.html faz) e verificamos que o app
 * falha de forma honesta em vez de culpar a conexão.
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://davidribeiromuller.github.io/Tcc_main-do-main/",
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
// `global.navigator` tem apenas getter no Node 22 — o jsdom já expõe o seu via window.

// O servidor estático responde HTML para qualquer /api/* (fallback de SPA).
global.fetch = async (url) => {
  if (String(url).includes("/api/")) {
    return new Response("<!doctype html><html><body>SPA</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }
  return new Response("", { status: 404 });
};

const { isStaticHosting, fetchJsonApi } = await import("./src/lib/staticHosting.ts");
const { authenticateUserDirectInSupabase } = await import("./src/lib/usersService.ts");

let ok = 0, fail = 0;
const check = (n, c, d = "") => {
  if (c) { ok++; console.log(`  ✓ ${n}`); }
  else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ""}`); }
};

console.log("=== cenário: GitHub Pages (sem backend) ===");
check("isStaticHosting detecta github.io", isStaticHosting() === true);

const res = await fetchJsonApi("/api/auth/local-login-password", { method: "POST" });
check("fetchJsonApi devolve null em vez do HTML do SPA", res === null);

const { user, error } = await authenticateUserDirectInSupabase("diretoria@helenawysocki.com", "senha123");
check("login NÃO devolve usuário", user === null);
check("NÃO mostra 'Erro de conexão ao consultar banco de dados'",
  !String(error).includes("Erro de conexão ao consultar banco"));
/*
  RODADA 41 — a intenção nunca foi exigir a palavra "servidor do eloEscola"
  (que aliás virou o jargão reclamado pelo usuário). É: a mensagem precisa
  dizer que aquele endereço não faz login por senha e apontar a saída.
*/
check(
  "mensagem é honesta (explica o limite e aponta a saída)",
  /servidor ativo/.test(String(error)) && /visitante/i.test(String(error)),
  String(error)
);
check("mensagem orienta o visitante", /visitante/.test(String(error)));
console.log(`\n  mensagem exibida ao usuário:\n  "${error}"`);

console.log(`\n${fail === 0 ? "✅" : "❌"} ${ok} passaram, ${fail} falharam`);
process.exit(fail === 0 ? 0 : 1);
