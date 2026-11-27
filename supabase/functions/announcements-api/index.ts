/**
 * Comunicados — escrita autorizada no servidor.
 *
 * POR QUE NÃO É O NAVEGADOR QUE GRAVA
 * -----------------------------------
 * `school_announcements` tem policy de leitura pública (comunicado publicado e
 * não vencido) e **nenhuma** permissão de escrita para `anon`. Isso é
 * proposital: a chave publicável está no bundle, então escrita liberada ali
 * significaria qualquer visitante publicando aviso em nome de uma escola.
 *
 * Antes desta função existir, publicar pelo app esbarrava na RLS e caía em
 * rascunho local — o comunicado aparecia só no aparelho de quem escreveu. Esta
 * função é o que faz o comunicado chegar a todo mundo.
 *
 * QUEM PODE PUBLICAR
 * ------------------
 * - `school_admin` (ou `school_staff`) da instituição → comunicado da escola;
 * - proprietário da plataforma (`PLATFORM_OWNER_EMAILS`) → comunicado global,
 *   com `school_id` nulo, que aparece em todas as escolas.
 *
 * O papel vem de `memberships` lido no servidor com a chave de serviço. O
 * navegador não escolhe o próprio papel.
 *
 * A ROTINA DE EXPIRAÇÃO
 * ---------------------
 * `POST /lifecycle/expire` (chave de serviço) marca vencidos como `deleted`.
 * Pode ser chamada por cron; a leitura já filtra vencidos de qualquer forma.
 */
import {
  clienteAdmin,
  resolverUsuario,
  instituicaoDoUsuario,
  ehProprietario,
  auditar,
  json,
  erro,
  lerAmbiente,
} from "../_shared/db.ts";

/** Dias padrão de vida de um comunicado. */
const DIAS_PADRAO = 2;

const PUBLICOS_VALIDOS = ["all", "students", "staff", "families", "admins"];

/**
 * Calcula quando o comunicado expira.
 *
 * Regra do produto: 2 dias. Quando há evento vinculado, o prazo conta do
 * ENCERRAMENTO do evento — um aviso sobre a feira de ciências não pode sumir
 * antes de a feira acontecer.
 */
function calcularExpiracao(
  eventEndsAt: string | null,
  dias: number | null
): string | null {
  if (dias === null) return null;
  const base = eventEndsAt ? new Date(eventEndsAt) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + dias * 24 * 60 * 60 * 1000).toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      },
    });
  }

  if (!lerAmbiente().configurado) {
    return erro(
      "Módulo de comunicados não configurado: falta SUPABASE_SERVICE_ROLE_KEY.",
      503
    );
  }

  const admin = clienteAdmin();
  const caminho = new URL(req.url).pathname.replace(/^\/announcements-api/, "") || "/";

  // -------------------------------------------------------------------------
  // Rotina interna de expiração (chave de serviço)
  // -------------------------------------------------------------------------
  if (caminho === "/lifecycle/expire" && req.method === "POST") {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if ((req.headers.get("Authorization") || "") !== `Bearer ${serviceKey}`) {
      return erro("Rotina interna: requer a chave de serviço.", 401);
    }

    const agora = new Date().toISOString();
    const { data, error } = await admin
      .from("school_announcements")
      .update({ status: "deleted", updated_at: agora })
      .eq("status", "published")
      .lte("expires_at", agora)
      .select("id");

    if (error) {
      return erro(`Não foi possível expirar os comunicados: ${error.message}`, 500);
    }

    return json({ expirados: data?.length ?? 0, executado_em: agora });
  }

  // -------------------------------------------------------------------------
  // Leitura pública (não exige login)
  // -------------------------------------------------------------------------
  if (caminho === "/public" && req.method === "GET") {
    const url = new URL(req.url);
    const schoolSlug = url.searchParams.get("school");

    let query = admin
      .from("school_announcements")
      .select("id, school_id, school_slug, title, body, category, audience, author_name, expires_at, created_at")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100);

    // Sem filtro por escola: traz os globais + os de todas as escolas.
    if (schoolSlug) {
      query = query.or(`school_slug.eq.${schoolSlug},school_id.is.null`);
    }

    const { data, error } = await query;
    if (error) return erro(`Não foi possível listar os comunicados: ${error.message}`, 500);

    const agora = Date.now();
    const visiveis = (data ?? []).filter((c: any) => {
      if (!c.expires_at) return true;
      const limite = new Date(c.expires_at).getTime();
      return Number.isNaN(limite) || limite > agora;
    });

    return json({ comunicados: visiveis });
  }

  // -------------------------------------------------------------------------
  // Daqui para baixo, exige login
  // -------------------------------------------------------------------------
  const usuario = await resolverUsuario(admin, req.headers.get("Authorization"));
  if (!usuario) {
    return erro("Entre com a conta da instituição para publicar comunicados.", 401, {
      precisaLoginSupabase: true,
    });
  }

  // -------------------------------------------------------------------------
  // Publicar
  // -------------------------------------------------------------------------
  if (caminho === "/publicar" && req.method === "POST") {
    const corpo = await req.json().catch(() => null);
    if (!corpo) return erro("Dados do comunicado não foram recebidos.");

    const titulo = String(corpo.title || "").trim();
    const texto = String(corpo.body || "").trim();
    if (titulo.length < 2) return erro("Informe um título para o comunicado.");
    if (texto.length < 1) return erro("Escreva o conteúdo do comunicado.");

    const publico = String(corpo.audience || "all");
    if (!PUBLICOS_VALIDOS.includes(publico)) {
      return erro(`Público inválido. Use: ${PUBLICOS_VALIDOS.join(", ")}.`);
    }

    const dias = corpo.dias_para_expirar === null
      ? null
      : Number.isFinite(Number(corpo.dias_para_expirar))
        ? Number(corpo.dias_para_expirar)
        : DIAS_PADRAO;

    const dono = ehProprietario(usuario.email);

    // Comunicado global: só o proprietário da plataforma.
    const querGlobal = corpo.school_id === null || corpo.school_id === undefined || corpo.global === true;

    if (querGlobal && !dono) {
      return erro(
        "Comunicado para toda a rede é exclusivo do proprietário da plataforma.",
        403
      );
    }

    let schoolId: string | null = null;
    let schoolSlug: string | null = null;

    if (!querGlobal) {
      schoolId = String(corpo.school_id || "");
      if (!schoolId) return erro("Informe a instituição do comunicado.");

      const papel = await instituicaoDoUsuario(admin, usuario.id);
      const ehDessaEscola = papel && String(papel.school_id) === schoolId;
      const papelAqui = ehDessaEscola ? papel.role : null;

      if (!dono && papelAqui !== "school_admin" && papelAqui !== "school_staff") {
        return erro(
          "Apenas a direção da instituição pode publicar comunicados dela.",
          403
        );
      }

      const { data: escola } = await admin
        .from("schools")
        .select("id, slug, name")
        .eq("id", schoolId)
        .maybeSingle();
      if (!escola) return erro("Instituição não encontrada.", 404);
      schoolSlug = escola.slug;
    }

    const eventEndsAt = corpo.event_ends_at ? String(corpo.event_ends_at) : null;
    const expiresAt = calcularExpiracao(eventEndsAt, dias);

    const { data: criado, error: erroInsert } = await admin
      .from("school_announcements")
      .insert([
        {
          school_id: schoolId,
          school_slug: schoolSlug,
          title: titulo,
          body: texto,
          category: String(corpo.category || "Comunicado").slice(0, 40),
          audience: publico,
          author_name: String(corpo.author_name || usuario.email).slice(0, 120),
          author_email: usuario.email,
          expires_at: expiresAt,
          event_id: corpo.event_id ?? null,
          event_ends_at: eventEndsAt,
          status: "published",
        },
      ])
      .select("*")
      .single();

    if (erroInsert) {
      return erro(`Não foi possível publicar o comunicado: ${erroInsert.message}`, 500);
    }

    // Uma linha por público: é o que permite marcar "lido" por destinatário
    // mais tarde sem duplicar o comunicado.
    await admin.from("announcement_notifications").insert([
      { announcement_id: criado.id, audience: publico },
    ]);

    await auditar(admin, {
      actor_email: usuario.email,
      actor_role: dono && querGlobal ? "proprietario" : "school_admin",
      action: querGlobal ? "comunicado.global_publicado" : "comunicado.publicado",
      target_type: "school_announcement",
      target_id: String(criado.id),
      metadata: { publico, expira_em: expiresAt, escola: schoolId },
    });

    return json({ comunicado: criado });
  }

  // -------------------------------------------------------------------------
  // Editar (alterar o que já foi publicado mantém o comunicado no ar)
  // -------------------------------------------------------------------------
  const editar = caminho.match(/^\/([0-9a-fA-F-]{36})$/);
  if (editar && req.method === "PUT") {
    const id = editar[1];
    const corpo = await req.json().catch(() => null);
    if (!corpo) return erro("Dados do comunicado não foram recebidos.");

    const { data: atual } = await admin
      .from("school_announcements")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!atual) return erro("Comunicado não encontrado.", 404);

    const dono = ehProprietario(usuario.email);
    if (!dono) {
      const papel = atual.school_id
        ? await instituicaoDoUsuario(admin, usuario.id)
        : null;
      const pode = papel && String(papel.school_id) === String(atual.school_id) &&
        (papel.role === "school_admin" || papel.role === "school_staff");
      if (!pode) {
        return erro("Você só pode alterar comunicados da sua instituição.", 403);
      }
    }

    const mudancas: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (corpo.title !== undefined) mudancas.title = String(corpo.title).slice(0, 200);
    if (corpo.body !== undefined) mudancas.body = String(corpo.body);
    if (corpo.category !== undefined) mudancas.category = String(corpo.category).slice(0, 40);
    if (corpo.audience !== undefined) {
      const p = String(corpo.audience);
      if (!PUBLICOS_VALIDOS.includes(p)) return erro("Público inválido.");
      mudancas.audience = p;
    }
    if (corpo.dias_para_expirar !== undefined) {
      const dias = corpo.dias_para_expirar === null ? null : Number(corpo.dias_para_expirar);
      mudancas.expires_at = calcularExpiracao(atual.event_ends_at ?? null, dias);
    }

    const { data, error } = await admin
      .from("school_announcements")
      .update(mudancas)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return erro(`Não foi possível salvar: ${error.message}`, 500);

    await auditar(admin, {
      actor_email: usuario.email,
      actor_role: dono ? "proprietario" : "school_admin",
      action: "comunicado.alterado",
      target_type: "school_announcement",
      target_id: id,
      metadata: { antes: atual, depois: mudancas },
    });

    return json({ comunicado: data });
  }

  // -------------------------------------------------------------------------
  // Excluir (soft delete: histórico preservado)
  // -------------------------------------------------------------------------
  if (editar && req.method === "DELETE") {
    const id = editar[1];
    const { data: atual } = await admin
      .from("school_announcements")
      .select("id, school_id, title")
      .eq("id", id)
      .maybeSingle();
    if (!atual) return erro("Comunicado não encontrado.", 404);

    const dono = ehProprietario(usuario.email);
    if (!dono) {
      const papel = atual.school_id
        ? await instituicaoDoUsuario(admin, usuario.id)
        : null;
      const pode = papel && String(papel.school_id) === String(atual.school_id) &&
        (papel.role === "school_admin" || papel.role === "school_staff");
      if (!pode) {
        return erro("Você só pode excluir comunicados da sua instituição.", 403);
      }
    }

    const { error } = await admin
      .from("school_announcements")
      .update({ status: "deleted", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return erro(`Não foi possível excluir: ${error.message}`, 500);

    await auditar(admin, {
      actor_email: usuario.email,
      actor_role: dono ? "proprietario" : "school_admin",
      action: "comunicado.excluido",
      target_type: "school_announcement",
      target_id: id,
      metadata: { titulo: atual.title },
    });

    return json({ ok: true, mensagem: "Comunicado removido do ar. O histórico foi preservado." });
  }

  return erro(`Rota desconhecida: ${caminho}`, 404);
});
