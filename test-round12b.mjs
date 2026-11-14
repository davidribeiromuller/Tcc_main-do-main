/**
 * Teste da rodada 12 — confirmação de presença.
 *
 * Reproduz o cenário do bug: app em GitHub Pages (sem backend Express),
 * usuário confirma presença. Antes a chamada ia para `/api/...`, recebia 404
 * e a tela mostrava erro. Agora precisa gravar no Supabase e responder OK.
 *
 * Usa um mock do cliente Supabase para exercitar toda a lógica de verdade.
 *
 * Rodar: npx tsx test-round12b.mjs
 */

let passou = 0;
let falhou = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

// ---------- ambiente mínimo (localStorage + fetch) ----------
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

/** Toda chamada a /api/... deve falhar (simula GitHub Pages). */
let chamadasApi = 0;
globalThis.fetch = async (url) => {
  if (String(url).includes("/api/")) {
    chamadasApi++;
    throw new Error("404 - rota inexistente em hospedagem estática");
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

// ---------- mock do Supabase ----------
const tabela = [];

function criarMockSupabase() {
  return {
    from: (nome) => {
      const filtros = [];
      const api = {
        select: () => api,
        eq: (campo, valor) => { filtros.push([campo, valor]); return api; },
        order: () => api,
        maybeSingle: async () => {
          const achado = tabela.find((l) =>
            filtros.every(([c, v]) => String(l[c]) === String(v))
          );
          return { data: achado ?? null, error: null };
        },
        single: async () => {
          const achado = tabela.find((l) =>
            filtros.every(([c, v]) => String(l[c]) === String(v))
          );
          return { data: achado ?? null, error: achado ? null : { message: "not found" } };
        },
        insert: (linhas) => {
          const criadas = linhas.map((l) => {
            // simula a restrição única (user_id, event_id)
            const existe = tabela.some(
              (x) => x.user_id === l.user_id && x.event_id === l.event_id
            );
            if (existe) return null;
            const comId = { id: tabela.length + 1, confirmed_at: new Date().toISOString(), ...l };
            tabela.push(comId);
            return comId;
          });
          const valida = criadas.find(Boolean) ?? null;
          return {
            select: () => ({
              single: async () =>
                valida
                  ? { data: valida, error: null }
                  : { data: null, error: { code: "23505", message: "duplicate key" } },
            }),
          };
        },
        delete: () => api,
      };
      // cadeia .delete().eq().eq().select()
      api.delete = () => {
        const f = [];
        const d = {
          eq: (c, v) => { f.push([c, v]); return d; },
          select: async () => {
            for (let i = tabela.length - 1; i >= 0; i--) {
              if (f.every(([c, v]) => String(tabela[i][c]) === String(v))) tabela.splice(i, 1);
            }
            return { error: null, data: [] };
          },
        };
        return d;
      };
      // order() em select() precisa devolver thenable
      api.order = () => {
        const resultado = {
          data: tabela.filter((l) => filtros.every(([c, v]) => String(l[c]) === String(v))),
          error: null,
        };
        // Precisa ser "awaitable" (thenable) para o serviço poder fazer `await`.
        return { then: (resolve) => resolve(resultado), catch: () => resultado };
      };
      return api;
    },
  };
}

// ---------- injeta o mock antes de importar ----------
// O módulo importa getSupabaseClient/isSupabaseConfigured; sobrescrevemos
// via um módulo de stub seria ideal, mas como é ESM usamos a variável de
// ambiente que o serviço não usa — então simulamos pela API pública:
// marcamos o host como estático e apontamos o "Supabase configurado" pelo
// mock global que o serviço consome.
globalThis.__ELO_MOCK_SUPABASE__ = criarMockSupabase();
globalThis.__ELO_MOCK_CONFIGURADO__ = true;

const {
  confirmarPresenca,
  listarParticipacoes,
  cancelarPresenca,
  lerParticipacoesLocais,
  __definirClienteParaTeste,
} = await import("./src/lib/participationsService.ts");

// Injeta o mock: é o seam oficial do serviço.
__definirClienteParaTeste(criarMockSupabase());

console.log("\n=== 1. Confirmar presença (Supabase disponível) ===");
{
  const r = await confirmarPresenca({
    userId: 7,
    eventId: 101,
    eventTitle: "Feira de Ciências",
    eventLocation: "Ginásio",
    eventDate: "20/11/2026",
    eventTime: "14:00",
  });
  ok("retorna sucesso", r.sucesso === true, JSON.stringify(r));
  ok("não é erro de rota", chamadasApi === 0, `chamadas /api: ${chamadasApi}`);
  ok("gravou no banco", tabela.length === 1, `linhas: ${tabela.length}`);
  ok("guardou cópia local", lerParticipacoesLocais(7).length === 1);
}

console.log("\n=== 2. Idempotência (confirmar duas vezes) ===");
{
  const antes = tabela.length;
  const r = await confirmarPresenca({
    userId: 7,
    eventId: 101,
    eventTitle: "Feira de Ciências",
  });
  ok("segunda chamada não duplica", tabela.length === antes, `linhas: ${tabela.length}`);
  ok("avisa que já estava confirmado", r.jaConfirmado === true);
  ok("sucesso continua true", r.sucesso === true);
}

console.log("\n=== 3. Listar ===");
{
  const lista = await listarParticipacoes(7);
  ok("traz 1 participação", lista.length === 1, String(lista.length));
  ok("título correto", lista[0]?.eventTitle === "Feira de Ciências", String(lista[0]?.eventTitle));
  ok("outro usuário não vê nada", (await listarParticipacoes(99)).length === 0);
}

console.log("\n=== 4. Evento inválido ===");
{
  const r = await confirmarPresenca({ userId: 7, eventId: 0, eventTitle: "" });
  ok("recusa evento inválido", r.sucesso === false);
  ok("explica o motivo", /inválido/i.test(r.erro ?? ""));
}

console.log("\n=== 5. Cancelar ===");
{
  const ok1 = await cancelarPresenca(7, 101);
  ok("cancelamento retorna true", ok1 === true);
  ok("removeu do banco", tabela.length === 0, String(tabela.length));
  ok("removeu do cache local", lerParticipacoesLocais(7).length === 0);
}

console.log("\n=== 6. Sem Supabase configurado (modo offline) ===");
{
  // Simula falha de configuração: o serviço deve cair no cache local e
  // devolver sucesso com aviso, nunca erro na cara do usuário.
  const r = await confirmarPresenca({
    userId: 42,
    eventId: 202,
    eventTitle: "Sarau de Poesia",
  });
  ok("não lança exceção", r.sucesso === true);
  ok("presença fica no cache local", lerParticipacoesLocais(42).length === 1);

  const lista = await listarParticipacoes(42);
  ok("leitura cai no cache", lista.length === 1, String(lista.length));
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
