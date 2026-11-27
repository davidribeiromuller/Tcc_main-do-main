/**
 * Rodada 46 — cancelamento de eventos, comunicados persistidos, comunicados
 * gerais da rede e notificação direcionada.
 *
 * Roda com: npx tsx test-round46-comunicados-cancelamento.mjs
 */
import { readFileSync } from "node:fs";

let ok = 0;
const falhas = [];

function checar(nome, condicao, detalhe = "") {
  if (condicao) {
    ok++;
    console.log(`  ✅ ${nome}`);
  } else {
    falhas.push(nome + (detalhe ? ` — ${detalhe}` : ""));
    console.log(`  ❌ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

function ler(caminho) {
  try {
    return readFileSync(caminho, "utf8");
  } catch {
    return "";
  }
}

const migration = ler("supabase/migrations/20261127_comunicados.sql");
const anuncios = ler("src/lib/announcementsService.ts");
const eventos = ler("src/lib/eventsService.ts");
const detalhe = ler("src/components/EventDetail.tsx");
const portal = ler("src/components/SchoolPortal.tsx");
const catalogo = ler("src/components/SchoolsCatalog.tsx");
const app = ler("src/App.tsx");
const tipos = ler("src/types.ts");

// ---------------------------------------------------------------------------
console.log("\n1. Banco: comunicados existem e são persistidos");
// ---------------------------------------------------------------------------
checar("migration cria school_announcements", /create table if not exists public\.school_announcements/i.test(migration));
checar("migration cria announcement_notifications", /create table if not exists public\.announcement_notifications/i.test(migration));
checar(
  "school_id nulo = comunicado global",
  /school_id` nulo = comunicado global/i.test(migration) || /school_id is null/i.test(migration)
);
checar(
  "school_id é uuid (schools.id é uuid, não bigint)",
  /school_id\s+uuid references public\.schools\(id\)/.test(migration),
  "FK com tipo errado derruba a migration inteira"
);
checar("RLS ligada nas duas tabelas", /enable row level security/.test(migration));
checar(
  "anon lê mas NÃO escreve",
  /grant select on public\.school_announcements to anon/.test(migration) &&
    /revoke all on public\.school_announcements from anon/.test(migration)
);
checar("prazo configurável (expires_at)", /expires_at\s+timestamptz/.test(migration));
checar("expiração automática implementada", /expirar_comunicados/.test(migration));
checar(
  "expirado vira 'deleted', não é apagado fisicamente",
  /set status = 'deleted'/.test(migration) && !/delete from public\.school_announcements/i.test(migration)
);

// ---------------------------------------------------------------------------
console.log("\n2. Serviço de comunicados");
// ---------------------------------------------------------------------------
checar("busca comunicados da escola + globais", /incluirGlobais/.test(anuncios));
checar(
  "publica via Edge Function (não direto pelo cliente)",
  /announcements-api/.test(anuncios) && /\/publicar/.test(anuncios),
  "a tabela não dá escrita a anon: a chave publicável está no bundle"
);
checar(
  "não tenta INSERT direto na tabela",
  !/from\("school_announcements"\)[\s\S]{0,80}\.insert/.test(anuncios)
);
checar("401/403 não caem em rascunho local (são definitivos)", /res\.status === 401 \|\| res\.status === 403/.test(anuncios));
checar("prazo padrão de 2 dias", /DIAS_PADRAO_COMUNICADO = 2/.test(anuncios));
checar(
  "prazo conta a partir do FIM do evento, não da publicação",
  /const base = eventEndsAt \? new Date\(eventEndsAt\) : agora/.test(anuncios),
  "um aviso sobre a feira não pode sumir antes de a feira acontecer"
);
checar("filtra o que já venceu na leitura", /limite > agora/.test(anuncios));
checar(
  "falha no banco avisa que NÃO foi publicado",
  /salvoLocalmente: true/.test(anuncios) && /ninguém mais consegue vê-lo/.test(anuncios),
  "antes dizia 'publicado' mesmo quando só gravava no localStorage"
);
checar("notificação direcionada por público", /PublicoAlvo/.test(anuncios) && /ROTULOS_PUBLICO/.test(anuncios));
checar("públicos: todos, alunos, funcionários, famílias, direção", /families/.test(anuncios) && /staff/.test(anuncios));

// ---------------------------------------------------------------------------
console.log("\n3. Cancelamento de evento");
// ---------------------------------------------------------------------------
checar("cancelar existe no serviço de eventos", /export async function cancelEventDirectInSupabase/.test(eventos));
checar("reativar existe (cancelamento por engano)", /export async function reactivateEventDirectInSupabase/.test(eventos));
checar(
  "cancelar NÃO apaga: marca status",
  /status: "canceled"/.test(eventos) && !/cancelEventDirectInSupabase[\s\S]{0,900}\.delete\(\)/.test(eventos),
  "excluir apaga o registro e quem estava inscrito nunca descobre o motivo"
);
checar("guarda o motivo do cancelamento", /CANCELADO: \$\{motivoLimpo\}/.test(eventos));
checar("tenta as duas tabelas (events e eventos)", /cancelarEm\("events"\)/.test(eventos) && /cancelarEm\("eventos"\)/.test(eventos));
checar("isCanceled exposto no tipo Event", /isCanceled\?: boolean/.test(tipos));
checar("mapeadores leem status canceled", (eventos.match(/isCanceled: row\.status === "canceled"/g) || []).length >= 2);

// ---------------------------------------------------------------------------
console.log("\n4. UI do cancelamento");
// ---------------------------------------------------------------------------
checar("botão Cancelar no detalhe do evento", /onCancelEvent/.test(detalhe));
checar("modal pede o motivo", /motivoCancelamento/.test(detalhe));
checar("aviso visível para quem abre evento cancelado", /Este evento foi cancelado/.test(detalhe));
checar("oferece reativar", /Reativar evento/.test(detalhe));
checar("App liga os handlers", /handleCancelEvent/.test(app) && /handleReactivateEvent/.test(app));
checar(
  "AdminPanel não recebeu props que não existem nele",
  !/onCancelEvent=\{handleCancelEvent\}[\s\S]{0,200}onSelectEvent/.test(app)
);

// ---------------------------------------------------------------------------
console.log("\n5. Comunicado funcionando (erro da tela)");
// ---------------------------------------------------------------------------
checar(
  "não chama mais a rota inexistente /api/school-portal/:id/news",
  !/fetch\(`\/api\/school-portal\/\$\{schoolId\}\/news`/.test(portal),
  "essa rota não existe no GitHub Pages: o POST recebia o index.html com 200"
);
checar("publica via publicarComunicado (banco)", /publicarComunicado\(\{/.test(portal));
checar("lê comunicados do banco", /fetchComunicados\(\{/.test(portal));
checar("público-alvo selecionável no formulário", /setAudience\(e\.target\.value as PublicoAlvo\)/.test(portal));
checar(
  "toast de aviso quando só salvou localmente",
  /"warning"\)/.test(portal) && /salvoLocalmente/.test(portal)
);

// ---------------------------------------------------------------------------
console.log("\n6. Comunicados gerais na aba das escolas");
// ---------------------------------------------------------------------------
checar("aba 'Comunicados da rede' existe", /Comunicados da rede/.test(catalogo));
checar("busca com incluirGlobais", /fetchComunicados\(\{ incluirGlobais: true \}\)/.test(catalogo));
checar("filtro 'Só os gerais'", /Só os gerais/.test(catalogo));
checar("marca a origem (rede ou escola)", /Toda a rede/.test(catalogo));
checar("mostra data de expiração", /Expira em/.test(catalogo));
checar("estado vazio explicado", /Nenhum comunicado no ar/.test(catalogo));

// ---------------------------------------------------------------------------
console.log("\n6b. Edge Function de comunicados");
// ---------------------------------------------------------------------------
const fn = ler("supabase/functions/announcements-api/index.ts");
checar("function existe", fn.length > 1000);
checar("exige JWT para publicar", /resolverUsuario/.test(fn));
checar("confere papel na instituição", /instituicaoDoUsuario/.test(fn));
checar("global só para o proprietário", /exclusivo do proprietário da plataforma/.test(fn));
checar("valida público-alvo", /PUBLICOS_VALIDOS/.test(fn));
checar("expiração conta do fim do evento", /eventEndsAt \? new Date\(eventEndsAt\) : new Date\(\)/.test(fn));
checar("excluir é soft delete", /status: "deleted"/.test(fn) && !/\.delete\(\)/.test(fn));
checar("auditoria registrada", /auditar\(admin/.test(fn));
checar("rotina de expiração exige chave de serviço", /lifecycle\/expire/.test(fn));

// ---------------------------------------------------------------------------
console.log("\n7. Regressão: nada escolar foi reescrito");
// ---------------------------------------------------------------------------
checar("AdminPanel intocado", !/school_announcements/.test(ler("src/components/AdminPanel.tsx")));
checar("server.ts intocado", !/school_announcements/.test(ler("server.ts")));
checar(
  "comunicados não usam DELETE físico",
  !/school_announcements[\s\S]{0,300}\.delete\(\)/.test(anuncios)
);

// ---------------------------------------------------------------------------
console.log("\n" + "─".repeat(66));
if (falhas.length === 0) {
  console.log(`✅ ${ok} verificações OK, 0 falha(s)`);
  console.log("RODADA 46 OK\n");
  process.exit(0);
} else {
  console.log(`❌ ${falhas.length} falha(s) de ${ok + falhas.length}:`);
  for (const f of falhas) console.log(`   - ${f}`);
  console.log("");
  process.exit(1);
}
