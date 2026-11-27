# GUIA_ASSINATURAS — ciclo de vida das assinaturas

## 1. Estados

| Estado | Significado | Lê dados | Escreve | Gera cobrança |
|---|---|---|---|---|
| `trialing` | teste de 30 dias | ✅ | ✅ | não |
| `active` | em dia | ✅ | ✅ | sim, na renovação |
| `past_due` | pagamento pendente, dentro da tolerância | ✅ | ✅ | sim |
| `suspended` | bloqueio administrativo/premium | ✅ | ❌ | sim |
| `canceled` | encerrado a pedido | ✅ | ❌ | não |
| `expired` | tolerância esgotada | ✅ | ❌ | não |

A tabela `subscriptions.status` tem `CHECK` com exatamente esses seis valores.

### Estado "de agora" vs estado gravado

O banco guarda o estado contratual. A tela mostra o **estado efetivo**,
calculado por `resolveEffectiveStatus()`: um `trialing` cujo `trial_ends_at`
passou aparece como `past_due` mesmo antes da rotina rodar. Isso evita que uma
rotina parada faça o app mostrar "em teste" indefinidamente.

Nenhuma das duas camadas bloqueia leitura. **Leitura nunca é bloqueada.**

## 2. Ciclo de vida

```
trialing ──(30 dias)──> past_due ──(7 dias)──> expired
   │                       │
   │                       └──(pagamento)──> active
   └──(pagamento)──────────> active

active ──(fim do período sem pagamento)──> past_due ──> expired
active/past_due/trialing ──(cancelar)──> cancel_at_period_end ──(fim do período)──> canceled
```

Quem executa as transições de tempo é `supabase/functions/billing-lifecycle`,
chamada por cron diário. **Se o cron não estiver agendado, os estados não
avançam** — está declarado como pendência de configuração, não como
funcionalidade pronta.

## 3. Renovação

Ao confirmar o pagamento de uma cobrança `kind = 'subscription'`, o webhook:

1. marca a transação como `paid` e grava `paid_at`;
2. coloca a assinatura em `active`;
3. define `current_period_start = agora` e `current_period_end = agora + 1 mês`
   (ou +1 ano, se `billing_cycle = 'annual'`);
4. zera `grace_until`;
5. grava `subscription_events` com `pagamento.confirmado`.

O novo período começa **agora**, não na data do vencimento antigo. Sem isso,
quem paga atrasado "ganharia" os dias de atraso.

## 4. Descontos

Ordem de aplicação, sempre no servidor:

```
valor_do_ciclo = plan.monthly_price_cents (ou annual_price_cents)
valor_final    = valor_do_ciclo × (1 − discount_percent/100)
```

* `discount_percent` só é gravado pela Edge Function — o navegador envia pedido
  de troca de plano, nunca um percentual.
* Desconto acima de 100% é recusado; o cálculo satura em zero.
* Desconto sem prazo (`discount_until`) recebe 12 meses automaticamente, para
  não virar desconto eterno por erro de digitação.
* Fundadora: `founder_discount = true` + `discount_until`. Ao passar a data, o
  desconto deixa de ser aplicado na próxima renovação (o histórico fica em
  `subscription_events`).

## 5. Cancelamento

`POST /school/cancel` **não** apaga nada e **não** corta o acesso:

* grava `cancel_at_period_end = true` e o motivo em `notes`;
* a instituição continua com `canWrite` até `current_period_end`;
* quando a data chega, `billing-lifecycle` muda para `canceled` e registra
  `assinatura.cancelada`.

Depois de `canceled`, o acesso é somente leitura e nenhum dado escolar é
removido. Reativar é uma nova assinatura (o histórico anterior permanece).

## 6. Inadimplência

1. Cobrança falha ou período vence sem pagamento → `past_due`;
2. `grace_until = vencimento + 7 dias`;
3. Durante a tolerância: aviso na tela, escrita liberada;
4. Tolerância esgotada → `expired`, escrita bloqueada, **leitura mantida**.

O que **nunca** acontece por inadimplência:

* apagar evento, usuário, autorização ou histórico;
* esconder o calendário ou o mural;
* suspender a conta de aluno ou responsável.

## 7. Tolerância configurável

`GRACE_DAYS = 7` em `src/lib/subscription.ts`. Mudar exige alterar o arquivo
**e** a cópia em `supabase/functions/_shared/subscription.ts` — o teste
`test-round45-monetizacao.mjs` compara os dois byte a byte e falha se
divergirem.

## 8. Limites de plano

`max_active_students` e `max_units` vêm de `plans`. O comportamento atual é
**avisar, não bloquear**:

* `evaluateQuota()` dispara aviso a partir de 80%;
* em 100%, o recurso que consome cota pode ser bloqueado — hoje isso **não**
  está ligado a nenhuma tela escolar, por decisão de escopo (o pedido proíbe
  transformar recurso existente em pago sem autorização comercial explícita).

O que já é bloqueado de fato: vender um plano cuja `max_units` é menor que as
unidades ativas da instituição. A troca é recusada com mensagem explicando o
motivo.

## 9. Acesso

A área `/assinatura` mostra dados financeiros somente para:

* pessoa com JWT válido do Supabase **e**
* vínculo `memberships.role = 'school_admin'` ativo **e**
* mesma instituição da assinatura (filtro no servidor e no RLS).

Funcionário Administrador (`school_staff`) vê as demais funções do painel, mas
não as financeiras. Aluno e responsável não têm acesso nenhum.
