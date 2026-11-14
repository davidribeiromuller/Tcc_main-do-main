/**
 * Testes da rodada 14 — eventos pessoais e cabeçalho do Feed.
 *
 * Foco no que pode causar dano: gravar compromisso no dono errado, aceitar
 * data no passado, ou apagar o compromisso de outra pessoa.
 *
 * Rodar: npx tsx test-round14.mjs
 */

import { readFileSync } from "node:fs";

let passou = 0;
let falhou = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

// ---------- ambiente ----------
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

// Mock do Supabase: guarda as linhas em memória, com filtros básicos.
const tabela = [];
let proximoId = 1;

function criarMock() {
  return {
    from: () => {
      let filtrosEq = [];
      const api = {};
      api.select = () => api;
      api.eq = (c, v) => { filtrosEq.push([c, v]); return api; };
      api.order = () => api;

      // thenable: permite `await supabase.from().select().order()`
      api.then = (resolve) => {
        const linhas = tabela.filter((l) => filtrosEq.every(([c, v]) => String(l[c]) === String(v)));
        resolve({ data: linhas, error: null });
      };

      api.insert = (linhas) => {
        const criadas = linhas.map((l) => {
          const nova = { id: proximoId++, created_at: new Date().toISOString(), ...l };
          tabela.push(nova);
          return nova;
        });
        return { select: () => ({ single: async () => ({ data: criadas[0], error: null }) }) };
      };

      api.delete = () => {
        const f = [];
        const d = {
          eq: (c, v) => { f.push([c, v]); return d; },
          select: async () => {
            const removidas = [];
            for (let i = tabela.length - 1; i >= 0; i--) {
              if (f.every(([c, v]) => String(tabela[i][c]) === String(v))) {
                removidas.push(...tabela.splice(i, 1));
              }
            }
            return { data: removidas, error: null };
          },
        };
        return d;
      };
      return api;
    },
  };
}

const {
  criarEventoPessoal,
  listarEventosPessoais,
  removerEventoPessoal,
  ordenarEventosPessoais,
  eventoPessoalPassou,
  __definirClienteParaTeste,
} = await import("./src/lib/personalEventsService.ts");

__definirClienteParaTeste(criarMock());

const HOJE = new Date();
const AMANHA = new Date(HOJE.getFullYear(), HOJE.getMonth(), HOJE.getDate() + 1);

console.log("\n=== 1. Criar compromisso ===");
{
  const { evento, erro } = await criarEventoPessoal({
    ownerId: 10,
    ownerName: "Maria Souza",
    ownerEmail: "maria@escola.pr.gov.br",
    title: "Prova de matemática",
    day: AMANHA.getDate(),
    month: AMANHA.getMonth(),
    year: AMANHA.getFullYear(),
    time: "08:00",
    category: "Prova",
  });

  ok("sem erro", !erro, String(erro));
  ok("retorna o evento", Boolean(evento));
  ok("dono gravado", evento?.ownerId === 10, String(evento?.ownerId));
  ok("nome do dono gravado", evento?.ownerName === "Maria Souza", String(evento?.ownerName));
  ok("e-mail do dono gravado", evento?.ownerEmail === "maria@escola.pr.gov.br");
  ok("título correto", evento?.title === "Prova de matemática");
  ok("foi para o banco", tabela.length === 1, String(tabela.length));
}

console.log("\n=== 2. Validações ===");
{
  const semTitulo = await criarEventoPessoal({
    ownerId: 10, ownerName: "Maria", title: "  ",
    day: 1, month: 0, year: 2027,
  });
  ok("recusa sem título", semTitulo.evento === null);
  ok("mensagem clara", /nome/i.test(semTitulo.erro ?? ""), String(semTitulo.erro));

  const semDono = await criarEventoPessoal({
    ownerId: 0, ownerName: "", title: "X", day: 1, month: 0, year: 2027,
  });
  ok("recusa sem dono", semDono.evento === null);
  ok("pede login", /conectado/i.test(semDono.erro ?? ""), String(semDono.erro));

  const diaInvalido = await criarEventoPessoal({
    ownerId: 10, ownerName: "Maria", title: "X", day: 45, month: 0, year: 2027,
  });
  ok("recusa dia 45", diaInvalido.evento === null);
  ok("explica o dia", /1 a 31/.test(diaInvalido.erro ?? ""));

  const mesInvalido = await criarEventoPessoal({
    ownerId: 10, ownerName: "Maria", title: "X", day: 1, month: 15, year: 2027,
  });
  ok("recusa mês 15", mesInvalido.evento === null);

  // Regra herdada: nada no passado.
  const passado = await criarEventoPessoal({
    ownerId: 10, ownerName: "Maria", title: "Retrospectiva",
    day: 1, month: 0, year: 2020,
  });
  ok("recusa data no passado", passado.evento === null);
  ok("avisa sobre a data", /hoje em diante/i.test(passado.erro ?? ""), String(passado.erro));
}

console.log("\n=== 3. Isolamento por dono ===");
{
  await criarEventoPessoal({
    ownerId: 20, ownerName: "João Lima", title: "Reunião de pais",
    day: AMANHA.getDate(), month: AMANHA.getMonth(), year: AMANHA.getFullYear(),
  });

  const daMaria = await listarEventosPessoais(10);
  const doJoao = await listarEventosPessoais(20);
  const todos = await listarEventosPessoais();

  ok("Maria vê só o dela", daMaria.every((e) => e.ownerId === 10), JSON.stringify(daMaria.map((e) => e.ownerId)));
  ok("João vê só o dele", doJoao.every((e) => e.ownerId === 20));
  ok("painel vê todos", todos.length === 2, String(todos.length));
  ok("painel mostra o dono de cada um", todos.every((e) => Boolean(e.ownerName)));
  ok("dono da Maria identificado", todos.find((e) => e.ownerId === 10)?.ownerName === "Maria Souza");
  ok("dono do João identificado", todos.find((e) => e.ownerId === 20)?.ownerName === "João Lima");
}

console.log("\n=== 4. Ordenação e passado ===");
{
  const passado = { id: 1, ownerId: 1, ownerName: "A", title: "Ontem", day: 1, month: 0, year: 2020, isPaid: false, reminder: false, createdAt: "" };
  const futuroProximo = { id: 2, ownerId: 1, ownerName: "A", title: "Amanhã", day: AMANHA.getDate(), month: AMANHA.getMonth(), year: AMANHA.getFullYear(), isPaid: false, reminder: false, createdAt: "" };
  const futuroDistante = { id: 3, ownerId: 1, ownerName: "A", title: "Ano que vem", day: 1, month: 0, year: HOJE.getFullYear() + 1, isPaid: false, reminder: false, createdAt: "" };

  ok("detecta passado", eventoPessoalPassou(passado) === true);
  ok("não marca futuro como passado", eventoPessoalPassou(futuroProximo) === false);

  const ordenado = ordenarEventosPessoais([futuroDistante, passado, futuroProximo]);
  ok("futuro mais próximo primeiro", ordenado[0].id === 2, String(ordenado[0].id));
  ok("passado fica no fim", ordenado[ordenado.length - 1].id === 1, String(ordenado[ordenado.length - 1].id));
}

console.log("\n=== 5. Remover ===");
{
  const antes = tabela.length;
  const alvo = tabela.find((l) => l.owner_id === 20);
  const removido = await removerEventoPessoal(alvo.id, 20);

  ok("remover retorna true", removido === true);
  ok("saiu do banco", tabela.length === antes - 1, String(tabela.length));
  ok("não sobrou nada do João", (await listarEventosPessoais(20)).length === 0);
  ok("Maria intacta", (await listarEventosPessoais(10)).length === 1);
}

console.log("\n=== 6. Cabeçalho do Feed (regressão do mobile) ===");
{
  // Lê o código-fonte e garante que o bloco duplicado não voltou.
  const fonte = readFileSync("./src/components/Feed.tsx", "utf8");

  ok("não tem mais o botão de perfil no header do Feed",
    !/md:hidden flex items-center justify-center w-10 h-10 rounded-full/.test(fonte));
  ok("tem lupa no header", /aria-label=\{isSearchOpen \? "Fechar busca"/.test(fonte));
  ok("tem botão de compromisso pessoal", /Adicionar compromisso pessoal/.test(fonte));
  ok("usa PersonalEventModal", /PersonalEventModal/.test(fonte));
  ok("agenda pessoal separada do mural", /Minha agenda/.test(fonte));
  ok("não duplica o título 'Eventos' em duas barras",
    (fonte.match(/>\s*Eventos\s*</g) || []).length <= 1);
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
