/**
 * Testes da rodada 17 — LISTA SEPARADA de contas escolares.
 *
 * Problema relatado: "não consigo adicionar, crie uma lista separada para
 * contas escolares, e tudo mais".
 *
 * Causas encontradas:
 *  1. A conta institucional era gravada em `users` com `uid` fixo
 *     (`inst-<escola>`) → a segunda conta da MESMA escola colidia em
 *     `users_uid_key` e a criação falhava.
 *  2. As contas escolares apareciam misturadas no diretório de usuários e
 *     inflavam os contadores do painel.
 *  3. Botões Verificar/Redefinir/Bloquear chamavam `/api/...`, que não existe
 *     no GitHub Pages → erro 405 no console e nenhuma ação.
 *
 * Rodar: node test-round17.mjs
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

let passou = 0;
let falhou = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

const servico = readFileSync("./src/lib/schoolAccountsService.ts", "utf8");
const painel = readFileSync("./src/components/AdminPanel.tsx", "utf8");
const app = readFileSync("./src/App.tsx", "utf8");
const usersSvc = readFileSync("./src/lib/usersService.ts", "utf8");
const migration = readFileSync("./src/db/migrations/0009_school_accounts_table.sql", "utf8");

console.log("\n=== 1. Tabela separada ===");
{
  ok("migration cria `school_accounts`", /CREATE TABLE IF NOT EXISTS public\.school_accounts/.test(migration));
  ok("a tabela tem chave primária própria (serial)", /id SERIAL PRIMARY KEY/.test(migration));
  ok("guarda escola (school_id/slug/nome)", /school_id INTEGER NOT NULL/.test(migration) && /school_name TEXT/.test(migration));
  ok("guarda a senha que o Chefe vê", /password TEXT/.test(migration));
  ok("identificador único por conta escolar", /idx_school_accounts_identifier/.test(migration));
  ok("e-mail único por conta escolar", /idx_school_accounts_email/.test(migration));
  ok("status e verificação separados", /account_status/.test(migration) && /verification_status/.test(migration));
  ok("RLS ligada com políticas", /ENABLE ROW LEVEL SECURITY/.test(migration) && /allow_insert_school_accounts/.test(migration));
  ok("migra contas antigas de `users` role Escola", /FROM public\.users u/.test(migration) && /u\.role = 'Escola'/.test(migration));
}

console.log("\n=== 2. Serviço dedicado ===");
{
  ok("módulo novo existe e usa a tabela própria",
    /from\("school_accounts"\)/.test(servico));
  ok("cria conta com o e-mail/identificador da escola",
    /login_identifier: identificador/.test(servico) && /institutional_email: email/.test(servico));
  ok("detecta duplicidade DENTRO da lista escolar",
    /from\("school_accounts"\)\s*\.select\("id, login_identifier, institutional_email"\)/.test(servico));
  ok("não grava mais em `users`", !/from\("users"\)\s*\.insert/.test(servico));
  ok("explica quando a migration não foi aplicada", /0009_school_accounts_table\.sql/.test(servico));
  ok("lista ordenada por escola", /order\("school_id"/.test(servico));
  ok("bloquear/desbloquear grava account_status",
    /account_status: ativo \? "active" : "suspended"/.test(servico));
  ok("verificação grava verified_by/verified_at",
    /verified_by: "ADM Chefe"/.test(servico));
  // Rodada 32 (segurança): a senha passou a ser gravada com hash scrypt.
  // O requisito original — "o Chefe redefine e o usuário é forçado a trocar" —
  // continua valendo; o que muda é que não existe mais texto claro.
  ok("redefinir senha força troca no próximo acesso",
    /must_change_password: true/.test(servico) && /password: hashPassword\(novaSenha\)/.test(servico));
  ok("remover conta existe como ação explícita",
    /export async function removerContaEscolar/.test(servico));
  ok("autentica por identificador OU e-mail",
    /login_identifier\.eq\.\$\{termo\},institutional_email\.eq\.\$\{termo\}/.test(servico));
  ok("conta bloqueada não entra", /account_status === "suspended"/.test(servico));
  ok("usuário de sessão sai com role Escola e escolaId",
    /role: "Escola"/.test(servico) && /escolaId: Number\(conta\.school_id\)/.test(servico));
}

console.log("\n=== 3. Painel usa a lista separada ===");
{
  ok("AdminPanel importa o serviço novo", /schoolAccountsService\.ts/.test(painel));
  ok("não importa mais o serviço antigo de `users`", !/institutionalAdminService/.test(painel));
  ok("carrega com listarContasEscolares()", /await listarContasEscolares\(\)/.test(painel));
  ok("criar usa criarContaEscolar()", /await criarContaEscolar\(/.test(painel));
  ok("bloquear usa alternarStatusContaEscolar()", /await alternarStatusContaEscolar\(/.test(painel));
  ok("verificar usa definirVerificacaoContaEscolar()", /await definirVerificacaoContaEscolar\(/.test(painel));
  ok("senha usa redefinirSenhaContaEscolar()", /await redefinirSenhaContaEscolar\(/.test(painel));
  ok("remover usa removerContaEscolar()", /await removerContaEscolar\(/.test(painel));
  const painelSemComentarios = painel
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  ok("nenhum botão da aba bate em /api/",
    !/\/api\/admin\/institutional-accounts/.test(painelSemComentarios));
  ok("mostra a senha na ficha da conta", /Senha:<\/span>[\s\S]{0,200}acc\.password/.test(painel));
  ok("mostra responsável com cargo", /acc\.responsavel[\s\S]{0,80}acc\.cargo/.test(painel));
  ok("aba chama-se lista de contas escolares",
    /Contas escolares das 6 escolas de Araucária/.test(painel));
  ok("explica erro em vez de fingir lista vazia", /erroContasEscolares/.test(painel));
  ok("resumo conta escolas sem conta",
    /Escolas sem conta/.test(painel));
  ok("modal de criação renomeado", /Nova conta escolar/.test(painel));
  ok("trocar de escola reescreve e-mail sugerido",
    /email: `\$\{e\.target\.value\.replace\(\/-\/g, "\."\)\}@escola\.pr\.gov\.br`/.test(painel));
}

console.log("\n=== 4. Separação do diretório de usuários ===");
{
  ok("diretório exclui role Escola na origem",
    /filter\(\(row: any\) => String\(row\.role \|\| ""\)\.toLowerCase\(\) !== "escola"\)/.test(usersSvc));
  ok("login institucional usa a tabela escolar",
    /autenticarContaEscolar/.test(app));
}

console.log("\n=== 5. Regras herdadas preservadas ===");
{
  ok("senha mínima de 6 caracteres continua", /senha\.length < 6/.test(servico));
  ok("conta nasce pendente de verificação",
    /verification_status: "pending_verification"/.test(servico));
  ok("nada é publicado automaticamente (sem insert em events)",
    !/from\("events"\)/.test(servico));
  ok("exclusão exige confirmação", /window\.confirm/.test(painel));
}

console.log("\n=== 6. Renderização real da aba (jsdom) ===");
{
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://x.github.io/admin" });
  global.window = dom.window;
  global.document = dom.window.document;
  try { Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true }); } catch {}
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;
  global.Node = dom.window.Node;
  global.getComputedStyle = dom.window.getComputedStyle;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  dom.window.Element.prototype.scrollTo = function () {};
  dom.window.Element.prototype.scrollIntoView = function () {};
  global.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });

  const RTL = await import("@testing-library/react");
  const React = (await import("react")).default;
  const AdminPanel = (await import("./src/components/AdminPanel.tsx")).default;

  const chefe = { id: 1, uid: "u1", nome: "David", email: "davidribeiromuller2009@gmail.com", role: "ADM Chefe", isAdmin: true, ativo: true };

  RTL.render(
    React.createElement(AdminPanel, {
      usersList: [],
      events: [],
      onUpdateUser: async () => {},
      onDeleteUser: async () => {},
      currentUser: chefe,
      onShowToast: () => {},
    })
  );

  // Abre a aba de contas escolares
  const aba = RTL.screen.getByRole("button", { name: /Contas das Escolas/i });
  RTL.fireEvent.click(aba);
  await new Promise((r) => setTimeout(r, 400));

  const texto = document.body.textContent ?? "";
  ok("aba abre com o título da lista separada", /Contas escolares das 6 escolas de Araucária/.test(texto));
  ok("explica que a lista é separada dos usuários", /separada do diretório de usuários/i.test(texto));
  ok("botão de criar conta escolar na tela", RTL.screen.queryByRole("button", { name: /Nova conta escolar/i }) !== null);
  ok("resumo mostra contas escolares", /Contas escolares/.test(texto));
  ok("exibe estado de carregando ou lista/vazio", /Carregando contas escolares|Nenhuma conta escolar|Identificador:/.test(texto));

  RTL.cleanup();
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
