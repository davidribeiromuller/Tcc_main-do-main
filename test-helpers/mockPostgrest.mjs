import http from "node:http";

/**
 * PostgREST simulado para as suítes de teste — e a razão de existir.
 *
 * O sandbox onde o agente trabalha não tem saída de rede para
 * `*.supabase.co` (`curl` devolve 000). Sem isso, TODA suíte que exercita o
 * login contra o banco falhava — e falhava de formas confusas, porque até a
 * rodada 38 o app caía no JSON de demonstração e o teste "passava" sem nunca
 * ter tocado no banco.
 *
 * A partir da rodada 39 o servidor consulta o Supabase de verdade, então as
 * suítes precisam de um banco também de verdade na forma. Este módulo sobe um
 * servidor HTTP que responde o subconjunto da API REST usado pelo app
 * (GET/PATCH em `users`, `school_accounts`, `events`), com as MESMAS linhas do
 * projeto jaoheenjltzzglfncgfq.
 *
 * O que ele NÃO prova: RLS, triggers, tipos do Postgres. Isso só o banco real
 * prova — e é por isso que o teste de integração da rodada 39 também verifica
 * o comportamento de falha (503), que é o único que dá para exercitar de
 * forma honesta sem rede.
 */

export const USUARIOS_REAIS = [
  {
    id: 2,
    uid: "fallback-admin-uid",
    nome: "Diretoria Helena Wysocki",
    email: "diretoria@helenawysocki.com",
    role: "Diretor",
    is_admin: true,
    ativo: false,
    password: "senha123",
    provider: "local",
    institution: "Escola estadual Helena Wysocki",
    created_at: "2026-06-23T21:53:16.872Z",
    last_login: "2026-09-08T01:40:31.145Z",
  },
  {
    id: 3,
    uid: "fallback-func-uid",
    nome: "Funcionário Helena Wysocki",
    email: "funcionario@helenawysocki.com",
    role: "Funcionário",
    is_admin: false,
    ativo: false,
    password: "senha123",
    provider: "local",
    created_at: "2026-06-23T21:53:16.872Z",
  },
  {
    id: 117,
    uid: "u-117",
    nome: "davidribeiromuller",
    email: "davidribeiromuller@gmail.com",
    // No banco real é "Aluno". A suíte da rodada 37 usa esta linha para
    // exercitar o cargo Funcionário — por isso ela é promovida AQUI, no
    // simulador, e não no código do app.
    role: "Funcionário",
    is_admin: false,
    ativo: true,
    password: "123456",
    provider: "local",
    created_at: "2026-07-01T10:00:00.000Z",
  },
  {
    id: 200,
    uid: "u-200",
    nome: "David Ribeiro Muller",
    email: "davidribeiromuller2009@gmail.com",
    role: "Diretor",
    is_admin: true,
    ativo: true,
    password: "senha123",
    provider: "local",
    created_at: "2026-07-30T11:53:17.252Z",
  },
  {
    id: 759,
    uid: "u-759",
    nome: "professor",
    email: "professor@gmail.com",
    role: "Diretor",
    is_admin: true,
    ativo: true,
    password: "1234",
    provider: "local",
    created_at: "2026-09-18T00:31:23.819Z",
  },
  {
    id: 819,
    uid: "u-819",
    nome: "JOAO FELIPE LIMA DOS SANTOS",
    email: "joao.lima.santos12@escola.pr.gov.br",
    role: "Diretor",
    is_admin: true,
    ativo: true,
    password: null,
    provider: "local",
    created_at: "2026-10-07T11:16:24.920Z",
  },
];

export const CONTAS_ESCOLARES_REAIS = [
  {
    id: 1,
    school_id: 1,
    school_slug: "helena-wysocki",
    school_name: "Colégio Estadual Professora Helena Wysocki",
    login_identifier: "helena.wysocki",
    institutional_email: "helena.wysocki@escola.pr.gov.br",
    password: "helenawysocki",
    must_change_password: false,
    responsible_name: "Elder",
    responsible_role: "Diretor(a)",
    institutional_contact: null,
    account_status: "active",
    verification_status: "verified",
    created_at: "2026-06-20T00:00:00.000Z",
  },
];

/** Filtro mínimo compatível com a sintaxe do PostgREST (`ilike.`, `eq.`, `is.`). */
function filtrar(linhas, url) {
  let out = linhas;
  for (const [chave, valorBruto] of url.searchParams) {
    if (["select", "order", "limit", "offset"].includes(chave)) continue;
    const valor = String(valorBruto);
    if (valor.startsWith("ilike.")) {
      const alvo = valor.replace("ilike.", "").replace(/\*/g, "").toLowerCase();
      out = out.filter((l) => String(l[chave] ?? "").toLowerCase() === alvo);
    } else if (valor.startsWith("eq.")) {
      const alvo = valor.slice(3);
      out = out.filter((l) => String(l[chave] ?? "") === alvo);
    } else if (valor === "is.null") {
      out = out.filter((l) => l[chave] === null || l[chave] === undefined);
    }
  }
  return out;
}

/**
 * Sobe o banco simulado.
 *
 * @param {number} porta
 * @param {object} opcoes
 * @param {object[]} opcoes.usuarios     linhas de `users` (default: as reais)
 * @param {object[]} opcoes.contasEscolares
 * @param {object}   opcoes.tabelasExtras mapa nome → linhas (events, etc.)
 */
export function subirBancoSimulado(porta, opcoes = {}) {
  const usuarios = JSON.parse(JSON.stringify(opcoes.usuarios || USUARIOS_REAIS));
  const contas = JSON.parse(JSON.stringify(opcoes.contasEscolares || CONTAS_ESCOLARES_REAIS));
  const extras = JSON.parse(JSON.stringify(opcoes.tabelasExtras || {}));

  const fontes = { users: usuarios, school_accounts: contas, ...extras };
  const escritas = [];

  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      // PostgREST: /rest/v1/<tabela>
      const partes = url.pathname.split("/").filter(Boolean);
      const tabela = partes[2];
      const responder = (status, corpo) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(corpo));
      };

      if (req.method === "GET" && partes[0] === "rest" && partes[1] === "v1") {
        const fonte = fontes[tabela];
        if (!fonte) return responder(404, { message: `relação ${tabela} não existe` });
        let linhas = filtrar(fonte, url).map((l) => ({ ...l }));
        const ordem = url.searchParams.get("order") || "";
        if (ordem) {
          const [campo, direcao] = ordem.split(".");
          linhas.sort((a, b) => {
            const va = a[campo], vb = b[campo];
            const cmp = va === vb ? 0 : va > vb ? 1 : -1;
            return direcao === "desc" ? -cmp : cmp;
          });
        }
        const limite = Number(url.searchParams.get("limit"));
        if (Number.isFinite(limite) && limite > 0) linhas = linhas.slice(0, limite);
        return responder(200, linhas);
      }

      if ((req.method === "PATCH" || req.method === "POST") && partes[0] === "rest") {
        let corpo = "";
        req.on("data", (c) => (corpo += c));
        req.on("end", () => {
          const dados = JSON.parse(corpo || "{}");
          const fonte = fontes[tabela];
          if (!fonte) return responder(404, { message: `relação ${tabela} não existe` });
          escritas.push({ tabela, metodo: req.method, dados, query: url.search });

          if (req.method === "POST") {
            const nova = { id: fonte.length + 1, ...dados };
            fonte.push(nova);
            return responder(201, [nova]);
          }
          const alvos = filtrar(fonte, url);
          alvos.forEach((l) => Object.assign(l, dados));
          return responder(200, alvos);
        });
        return;
      }

      responder(404, { message: "rota não simulada", path: url.pathname });
    });

    srv.listen(porta, "127.0.0.1", () => {
      resolve({
        porta,
        usuarios,
        contasEscolares: contas,
        escritas,
        fechar: () => new Promise((r) => srv.close(r)),
      });
    });
  });
}
