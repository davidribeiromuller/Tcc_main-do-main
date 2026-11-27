/**
 * billing-lifecycle — passa o tempo nas assinaturas.
 *
 * POR QUE ISSO PRECISA EXISTIR
 * ----------------------------
 * `resolveEffectiveStatus` calcula o estado "de agora" na leitura, mas o banco
 * ficaria com `trialing` para sempre. Sem esta rotina:
 *   · o painel do proprietário mostraria instituições em teste eternamente;
 *   · contrato cancelado nunca viraria `canceled`;
 *   · inadimplente nunca sairia de `past_due` para `expired`.
 *
 * É idempotente: rodar duas vezes no mesmo dia não muda nada na segunda vez.
 *
 * AGENDAMENTO (obrigatório — a função não se chama sozinha)
 * --------------------------------------------------------
 * Supabase → Database → Cron Jobs (pg_cron + pg_net), diariamente:
 *
 *   select cron.schedule(
 *     'billing-lifecycle',
 *     '0 3 * * *',
 *     $$
 *       select net.http_post(
 *         url := '<SUPABASE_URL>/functions/v1/billing-lifecycle',
 *         headers := jsonb_build_object(
 *           'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
 *           'Content-Type', 'application/json'
 *         ),
 *         body := '{}'::jsonb
 *       );
 *     $$
 *   );
 *
 * Sem esse agendamento, nada aqui roda — e está declarado como pendência no
 * relatório de implementação.
 */
import { clienteAdmin, json, erro, auditar } from "../_shared/db.ts";
import { resolveEffectiveStatus, graceEndFrom } from "../_shared/subscription.ts";

Deno.serve(async (req: Request) => {
  /*
    Proteção: a rotina muda status de contrato, então não pode ser disparada por
    qualquer visitante. Exige a chave de serviço no header — que só quem opera a
    plataforma tem.
  */
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const auth = req.headers.get("Authorization") || "";
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
    return erro("Rotina interna: requer a chave de serviço.", 401);
  }

  const admin = clienteAdmin();
  const agora = new Date();
  const resultado = {
    testesEncerrados: 0,
    atrasados: 0,
    expirados: 0,
    cancelados: 0,
    erros: [] as string[],
  };

  const { data: assinaturas, error } = await admin
    .from("subscriptions")
    .select("*")
    .in("status", ["trialing", "active", "past_due"]);

  if (error) return erro(`Não foi possível listar as assinaturas: ${error.message}`, 500);

  for (const sub of assinaturas ?? []) {
    try {
      // Cancelamento pedido: encerra quando o período contratado termina.
      if (sub.cancel_at_period_end) {
        const fim = sub.current_period_end ? new Date(sub.current_period_end) : null;
        if (fim && agora >= fim) {
          await admin
            .from("subscriptions")
            .update({ status: "canceled", canceled_at: agora.toISOString(), updated_at: agora.toISOString() })
            .eq("id", sub.id);

          await registrarEvento(admin, sub, "assinatura.cancelada", "canceled", {
            encerrada_em: agora.toISOString(),
          });
          resultado.cancelados++;
          continue;
        }
      }

      const efetivo = resolveEffectiveStatus(sub as any, agora);

      // Teste vencido: vira atraso com 7 dias de tolerância (não corta na hora).
      if (sub.status === "trialing" && efetivo === "past_due") {
        const tolerancia = sub.grace_until
          ? new Date(sub.grace_until)
          : graceEndFrom(sub.trial_ends_at ? new Date(sub.trial_ends_at) : agora);

        await admin
          .from("subscriptions")
          .update({ status: "past_due", grace_until: tolerancia.toISOString(), updated_at: agora.toISOString() })
          .eq("id", sub.id);

        await registrarEvento(admin, sub, "teste.encerrado", "past_due", {
          tolerancia_ate: tolerancia.toISOString(),
        });
        resultado.testesEncerrados++;
        continue;
      }

      // Active cujo período venceu sem pagamento confirmado → atraso.
      if (sub.status === "active" && efetivo === "past_due") {
        const venc = sub.current_period_end ? new Date(sub.current_period_end) : agora;
        const tolerancia = sub.grace_until ? new Date(sub.grace_until) : graceEndFrom(venc);

        await admin
          .from("subscriptions")
          .update({ status: "past_due", grace_until: tolerancia.toISOString(), updated_at: agora.toISOString() })
          .eq("id", sub.id);

        await registrarEvento(admin, sub, "pagamento.nao_identificado", "past_due", {
          tolerancia_ate: tolerancia.toISOString(),
        });
        resultado.atrasados++;
        continue;
      }

      // Tolerância esgotada → expired. Nenhum dado escolar é apagado.
      if (sub.status === "past_due" && efetivo === "expired") {
        await admin
          .from("subscriptions")
          .update({ status: "expired", updated_at: agora.toISOString() })
          .eq("id", sub.id);

        await registrarEvento(admin, sub, "assinatura.expirada", "expired", {
          dados_preservados: true,
        });
        resultado.expirados++;
      }
    } catch (e: any) {
      resultado.erros.push(`${sub.id}: ${e?.message || "erro"}`);
    }
  }

  await auditar(admin, {
    actor_email: null,
    actor_role: "rotina",
    action: "billing.lifecycle",
    metadata: resultado,
  });

  return json({ executado_em: agora.toISOString(), ...resultado });
});

async function registrarEvento(
  admin: any,
  sub: any,
  eventType: string,
  para: string,
  payload: Record<string, unknown>
) {
  await admin.from("subscription_events").insert([
    {
      subscription_id: sub.id,
      school_id: sub.school_id,
      event_type: eventType,
      from_status: sub.status,
      to_status: para,
      payload,
      actor_email: null,
    },
  ]);
}
