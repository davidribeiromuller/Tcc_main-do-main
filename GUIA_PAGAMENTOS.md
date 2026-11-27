# GUIA_PAGAMENTOS — provedor, webhooks e configuração

## 1. Provedor escolhido

**Mercado Pago**, pelo suporte nativo a PIX, boleto e cartão, e por atender
escolas brasileiras sem exigência de CNPJ para testes em sandbox.

O acesso é sempre pelo adaptador `supabase/functions/_shared/mercadopago.ts`.
Nenhum outro arquivo do projeto conhece a API do Mercado Pago. Trocar de
provedor significa reescrever um arquivo e ajustar a constante `provider` do
banco.

## 2. Estado real da integração

> **Este código não foi executado contra a API real do Mercado Pago.**

Motivo: não existe `MERCADOPAGO_ACCESS_TOKEN` neste ambiente e o sandbox de
desenvolvimento não tem saída de rede para `api.mercadopago.com`.

O que foi validado:

* estrutura das requisições conforme a documentação pública (`POST /v1/payments`,
  `GET /v1/payments/{id}`, `PUT /v1/payments/{id}`, webhook com `x-signature`);
* verificação HMAC da assinatura do webhook (testada com vetores próprios);
* idempotência por `(provider, event_id)` — confirmada no banco (erro 23505 ao
  inserir o mesmo evento duas vezes);
* ausência de caminho que marque `paid` sem passar pelo webhook.

O que **não** foi validado e depende de credencial:

* criação real de cobrança PIX/boleto;
* recebimento de webhook real com assinatura do Mercado Pago;
* fluxo de cartão (exige tokenização no navegador pelo SDK do MP).

## 3. Variáveis necessárias

Configurar em **Supabase → Edge Functions → Secrets** (nunca no `.env` do
frontend, nunca no bundle):

| Variável | Onde é usada | Obrigatória |
|---|---|---|
| `SUPABASE_URL` | todas as funções | injetada automaticamente |
| `SUPABASE_SERVICE_ROLE_KEY` | todas as funções | injetada automaticamente |
| `MERCADOPAGO_ACCESS_TOKEN` | adaptador | sim, para cobrar de verdade |
| `MERCADOPAGO_WEBHOOK_SECRET` | validação do webhook | **sim** — sem ela nenhum webhook é aceito |
| `MERCADOPAGO_ENV` | informativo | não (`sandbox` por padrão) |
| `APP_PUBLIC_URL` | `back_urls` e `notification_url` | sim para o Mercado Pago devolver |
| `PLATFORM_OWNER_EMAILS` | painel do proprietário | **sim** — lista vazia = ninguém entra |

`PLATFORM_OWNER_EMAILS` é uma lista separada por vírgula:
`dono@eloescola.com,financeiro@eloescola.com`.

## 4. Deploy das funções

```bash
supabase login
supabase link --project-ref jaoheenjltzzglfncgfq

supabase functions deploy billing-api     --no-verify-jwt
supabase functions deploy billing-webhook --no-verify-jwt
supabase functions deploy billing-lifecycle
```

`--no-verify-jwt` nas duas primeiras é intencional e está justificado no
cabeçalho de cada arquivo: o `billing-api` precisa responder à vitrine pública,
e o `billing-webhook` se autentica pela assinatura do provedor, não por JWT.
`billing-lifecycle` exige a chave de serviço no header.

## 5. Webhooks

Endpoint a cadastrar no painel do Mercado Pago:

```
https://<PROJECT_REF>.supabase.co/functions/v1/billing-webhook
```

Eventos: `payment`.

### Ordem de verificação (não alterar)

1. **Assinatura** — HMAC-SHA256 de
   `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` com
   `MERCADOPAGO_WEBHOOK_SECRET`, comparada em tempo constante.
   Sem segredo configurado, **todo webhook é recusado** e registrado como
   `signature_valid = false`.
2. **Idempotência** — índice único `(provider, event_id)` em `webhook_events`.
   Evento repetido é registrado e respondido com 200 sem reprocessar.
3. **Consulta ao provedor** — o corpo da notificação não é prova de nada; o
   status é lido de `GET /v1/payments/{id}`.
4. **Aplicação** — atualiza `payment_transactions`, `subscriptions`,
   `subscription_events` e `platform_audit_logs`.

O webhook sempre responde 200 quando o evento é inválido ou desconhecido (e
registra o motivo), para o provedor não reenviar indefinidamente.

## 6. O que nunca acontece

* O navegador não marca cobrança como paga. `POST /school/pay` só cria a
  cobrança e devolve o link.
* Nenhum número de cartão, CVV ou validade é armazenado — nem no banco, nem em
  log. A tokenização é feita pelo SDK do Mercado Pago no navegador.
* Nenhuma chave secreta entra no bundle. `MERCADOPAGO_ACCESS_TOKEN` e
  `SUPABASE_SERVICE_ROLE_KEY` só existem no ambiente das funções.
* Com credencial ausente, `providerConfigurado = false` e a cobrança fica
  `pending` com o motivo exibido na tela. **Nada é simulado como aprovado.**

## 7. Sandbox

Com `MERCADOPAGO_ACCESS_TOKEN` de teste (`TEST-...`):

1. a instituição pede o pagamento em `/assinatura`;
2. o Mercado Pago devolve `ticket_url` (PIX/boleto);
3. pagando pelo ambiente de teste, o MP envia o webhook;
4. a transação vira `paid` e a assinatura vira `active`.

Para simular sem o MP, use o **registro manual** em
`/master/monetizacao` → aba Cobranças. Ele grava `provider = 'manual'`,
`status = 'paid'`, e o e-mail de quem registrou fica em `metadata` e na
auditoria. É o caminho honesto para ambiente sem credencial.

## 8. Produção

Checklist antes de cobrar de verdade:

- [ ] `MERCADOPAGO_ACCESS_TOKEN` de produção configurado
- [ ] `MERCADOPAGO_WEBHOOK_SECRET` configurado e igual ao do painel do MP
- [ ] endpoint de webhook cadastrado e respondendo 200
- [ ] `APP_PUBLIC_URL` apontando para o domínio real
- [ ] `PLATFORM_OWNER_EMAILS` com os e-mails do proprietário
- [ ] cron do `billing-lifecycle` agendado (ver §9)
- [ ] uma cobrança de R$ 1,00 testada de ponta a ponta
- [ ] estorno testado

## 9. Agendar a rotina de ciclo de vida

Sem isso, teste vencido não vira `past_due` e cancelamento não vira `canceled`.

```sql
select cron.schedule(
  'billing-lifecycle',
  '0 3 * * *',
  $$
    select net.http_post(
      url := 'https://jaoheenjltzzglfncgfq.supabase.co/functions/v1/billing-lifecycle',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);
```

## 10. Reembolso e cancelamento de cobrança

`cancelarCobranca()` no adaptador envia `PUT /v1/payments/{id}` com
`status: "cancelled"`. É usado apenas para cobrança ainda não paga. Cobrança já
paga exige estorno no painel do Mercado Pago — o sistema registra o evento mas
não realiza estorno financeiro por conta própria.

## 11. Estado do deploy (atualizado em 11/11/2026)

As três funções foram publicadas no projeto `jaoheenjltzzglfncgfq`:

| Função | Status | `verify_jwt` | Observação |
|---|---|---|---|
| `billing-api` | ACTIVE | `false` | a função valida o JWT por conta própria (`auth.getUser`); `verify_jwt=false` é necessário para as rotas `/public/*` |
| `billing-webhook` | ACTIVE | `false` | o provedor não manda JWT; a autenticação é o HMAC `x-signature` |
| `billing-lifecycle` | ACTIVE | `true` | exige `Authorization: Bearer <service_role>` |

Segredos configurados: `MERCADOPAGO_WEBHOOK_SECRET`, `APP_PUBLIC_URL`,
`PLATFORM_OWNER_EMAILS`, `MERCADOPAGO_ENV=sandbox`.

**Ainda falta `MERCADOPAGO_ACCESS_TOKEN`.** Sem ele o diagnóstico responde com
`configurado: false`, `aceitaPagamentoReal: false` e `faltando:
["MERCADOPAGO_ACCESS_TOKEN"]`; `/school/pay` registra a cobrança como `pending`
sem link de pagamento. Nada é marcado como pago — por desenho.

### Como as funções foram publicadas

Não há `supabase` CLI neste ambiente. O código TypeScript de
`supabase/functions/*` foi empacotado com `esbuild --bundle`, que inlina
`_shared/*` e mantém `jsr:@supabase/supabase-js@2` e `node:crypto` como imports
(resolvidos pelo runtime Deno). O resultado foi publicado pelo conector do
Supabase.

**Consequência a lembrar:** o que está no ar é o bundle, não o `.ts`. Se você
editar `supabase/functions/**/*.ts`, o deploy **não** se atualiza sozinho.
Republique pelo painel do Supabase (colando o arquivo) ou, melhor, com a CLI:

```bash
supabase functions deploy billing-api --no-verify-jwt
supabase functions deploy billing-webhook --no-verify-jwt
supabase functions deploy billing-lifecycle
```

Com a CLI, `_shared/` é resolvido nativamente e o passo de esbuild deixa de ser
necessário.
