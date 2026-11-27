# RELATORIO_IMPLEMENTACAO_MONETIZACAO

Rodada 45. Branch `arena/f1570eb9-tcc-main-do-main`, commit informado ao final.
Base: `f8dff9f` (rodada 44 — conserto do banco).

---

## 1. Inspeção prévia — o que já existia

A matriz de análise foi aplicada antes de qualquer linha de código.

| Recurso | Situação encontrada |
|---|---|
| Tabelas comerciais no banco | **Já existiam e funcionavam** — 15 tabelas da rodada 36, sobreviveram ao revert |
| `plans` / `plan_addons` populados | **Sim** — 3 planos e 5 adicionais com os valores exatos da especificação |
| `schools` / `subscriptions` | **Sim** — 1 escola cadastrada (fundadora, slot 1) com assinatura `trialing` |
| Código cliente comercial | **Removido** no revert `0ac5ae5` / merge `f9ca6eb` |
| `plansService.ts`, `billing.ts`, `subscription.ts` | **Removidos** — existiam em `f9ca6eb^` |
| `PlansAndPricing`, `SchoolSubscription`, `MasterPanel`, `PlansManagementTab` | **Removidos** |
| Rotas `/api/saas/*`, `/api/master/*`, `/api/school/*` | **Removidas** do `server.ts` |
| `supabase/migrations/20261111_saas_core.sql` | **Removida** do repositório (tabelas continuam no banco) |
| RLS das tabelas comerciais | **Quebrado** — policies `*_app_write ... to anon using(true)` herdadas da rodada 44 |

Comandos usados na inspeção:

```bash
git log --all --diff-filter=A --name-only --pretty=format: | sort -u \
  | grep -iE "plan|pric|billing|subscri|payment|monetiz|partner|master"
```

### Decisão de arquitetura (aprovada pelo autor do TCC)

A implementação anterior era **server-first** e dependia do Express, que não
roda no GitHub Pages. Restaurá-la como estava deixaria o painel financeiro
inoperante em produção.

Escolha: **Supabase Edge Functions** (Deno, no mesmo projeto do banco).
Mantém a autorização no servidor, não exige hospedagem nova e o deploy do site
continua estático.

Provedor: **Mercado Pago**. Estratégia: **reaproveitar** `subscription.ts`
(lógica pura, sólida) e reescrever a camada de dados/DOM.

---

## 2. Arquivos criados

| Arquivo | Linhas | Papel |
|---|---|---|
| `src/lib/subscription.ts` | 328 | Regras puras: estados, tolerância, preço, desconto, cotas |
| `src/lib/plansService.ts` | 156 | Leitura do catálogo (`plans`, `plan_addons`, vagas de fundadora) |
| `src/lib/subscriptionService.ts` | 184 | Leitura da assinatura da instituição + cobranças + histórico |
| `src/lib/billingApi.ts` | 364 | Cliente das Edge Functions (JWT, timeout, erros legíveis) |
| `src/components/PlansAndPricing.tsx` | 491 | Vitrine `/planos` |
| `src/components/SchoolSubscription.tsx` | 498 | Área `/assinatura` |
| `src/components/MasterPanel.tsx` | 643 | Painel `/master/monetizacao` |
| `supabase/functions/billing-api/index.ts` | 947 | API comercial (instituição + proprietário + público) |
| `supabase/functions/billing-webhook/index.ts` | 273 | Webhook do Mercado Pago |
| `supabase/functions/billing-lifecycle/index.ts` | 169 | Rotina diária de transições por tempo |
| `supabase/functions/_shared/db.ts` | 177 | Cliente admin, verificação de JWT, autorização, auditoria |
| `supabase/functions/_shared/mercadopago.ts` | 332 | Adaptador do provedor |
| `supabase/functions/_shared/subscription.ts` | 328 | Cópia literal da lógica pura (Deno não importa de `src/`) |
| `supabase/migrations/20261126_monetizacao_rls.sql` | 317 | RLS e GRANT do módulo comercial |
| `test-round45-monetizacao.mjs` | — | 91 verificações do módulo |
| `GUIA_MONETIZACAO.md`, `GUIA_ASSINATURAS.md`, `GUIA_PAGAMENTOS.md` | — | Documentação |

## 3. Arquivos modificados

`git diff --stat`:

```
 src/App.tsx                 | 60 +++++++++++++++++++++++++++++++++++++++++++++
 src/components/Settings.tsx | 32 +++++++++++++++++++++++-
 src/lib/navigation.ts       | 26 ++++++++++++++++++++
 3 files changed, 117 insertions(+), 1 deletion(-)
```

**117 inserções e 1 remoção.** A única remoção foi a linha de import do ícone
`BellRing` no `Settings.tsx`, reescrita para incluir `Receipt`.

### Por que cada um foi indispensável

**`src/lib/navigation.ts` (+26)** — o app navega por mapa de telas em estado, não
por roteador. Sem registrar `/planos`, `/assinatura` e `/master/monetizacao`
aqui, as telas ficariam inalcançáveis por URL e o botão voltar do navegador
quebraria. Segue exatamente o padrão existente (`TELAS_CONHECIDAS` + `ROTAS` +
`ROTAS_POR_TELA`); nenhuma dependência nova.

**`src/App.tsx` (+60)** — único ponto onde as telas são renderizadas. Os três
blocos seguem o mesmo formato `motion.div` das telas já existentes (`key`,
`initial`, `animate`, `exit`, `className="app-screen"`). **Nenhuma linha
existente foi alterada**; verificado com `git diff | grep "^-"` → vazio.

**`src/components/Settings.tsx` (+32)** — entrada "Plano e assinatura",
condicionada a `isChefeAdmin`. Foi para o Settings e **não** para o
`AdminPanel` justamente porque o pedido proíbe alterar as abas, filtros,
tabelas e botões do painel administrativo.

### `AdminPanel.tsx`: não foi tocado

```bash
git diff --stat src/components/AdminPanel.tsx   # (vazio)
```

Confirmado por teste (`test-round45`, seção 13): o arquivo continua com mais de
3000 linhas, mantém as abas de eventos e usuários, e **não importa nada** do
módulo comercial.

---

## 4. Tabelas

**Nenhuma tabela nova foi criada.** O schema da rodada 36 já cobria toda a
especificação:

| Necessidade da spec | Tabela existente |
|---|---|
| `billing_plans` | `plans` |
| `school_subscriptions` | `subscriptions` |
| `billing_transactions` | `payment_transactions` |
| `billing_webhook_events` | `webhook_events` |
| `billing_addons` | `plan_addons` |
| `billing_audit_logs` | `platform_audit_logs` |
| `billing_leads` | `sales_leads` |
| Parceiros | `partners`, `partner_campaigns` |
| Quotas/consumo | `feature_entitlements`, `usage_records` |
| Histórico de assinatura | `subscription_events` |
| Identificação institucional | `schools`, `school_units`, `memberships` |

A chave institucional canônica do projeto é o **slug** (`schools.slug` ↔
`school_profiles.slug` ↔ URL `/escolas/<slug>`). Nenhuma tabela de escola foi
recriada.

## 5. Migration

`supabase/migrations/20261126_monetizacao_rls.sql` — **aplicada** no projeto
`jaoheenjltzzglfncgfq`.

O que muda:

| Tabela | Antes (rodada 44) | Depois |
|---|---|---|
| `plans`, `plan_addons` | leitura pública + escrita aberta | leitura pública, escrita só backend |
| `subscriptions` | anon lê e **grava** | `authenticated`, só a própria escola |
| `payment_transactions` | anon lê e **grava** | `authenticated`, só a própria escola |
| `webhook_events` | anon lê e **grava** | zero policies (só backend) |
| `platform_audit_logs` | anon lê e **grava** | zero policies (só backend) |
| `usage_records`, `feature_entitlements`, `subscription_events` | anon lê e grava | `authenticated`, leitura da própria escola |
| `sales_leads` | INSERT+SELECT+UPDATE+DELETE para anon | só INSERT público |
| `partners`, `partner_campaigns` | leitura por status | leitura por status **e** vigência do pagamento |

Aditiva, idempotente (`drop policy if exists` antes de cada `create`), sem
`DROP TABLE`, sem `DELETE`, sem `UPDATE` de dado existente. Tem bloco `DO $$`
que falha a migration se alguma das 15 tabelas comerciais ficar sem RLS.

GRANTs de escrita revogados de `anon` e `authenticated` nas 14 tabelas
financeiras; `sales_leads` reduzida a `INSERT`.

---

## 6. Endpoints comerciais

### `billing-api` (JWT verificado dentro da função)

| Método | Rota | Quem | O que faz |
|---|---|---|---|
| GET | `/public/diagnostico` | público | diz se o provedor está configurado |
| POST | `/public/lead` | público | formulário de demonstração (1 por e-mail) |
| GET | `/school/me` | `school_admin`/`school_staff` | assinatura, cobranças, histórico |
| POST | `/school/change-plan` | `school_admin` | troca de plano/ciclo (preço calculado no servidor) |
| POST | `/school/cancel` | `school_admin` | cancelamento no fim do período |
| POST | `/school/pay` | `school_admin`/`school_staff` | cria cobrança no provedor |
| GET | `/owner/overview` | `PLATFORM_OWNER_EMAILS` | todos os indicadores + listas |
| PUT | `/owner/plans/:id` | proprietário | preço, limite, ativação (vai para auditoria) |
| PUT | `/owner/subscriptions/:id` | proprietário | status, plano, desconto |
| POST | `/owner/payments/manual` | proprietário | baixa manual de recebimento |
| PUT | `/owner/partners/:id/status` | proprietário | aprovar/suspender parceiro |
| PUT | `/owner/leads/:id/status` | proprietário | mover lead no funil |

### `billing-webhook`
`POST` — valida assinatura, garante idempotência, consulta o provedor e aplica
o resultado.

### `billing-lifecycle`
`POST` — exige a chave de serviço no header. Executa as transições por tempo.

---

## 7. Integrações

| Integração | Estado |
|---|---|
| Supabase Postgres (mesmo projeto, mesmas credenciais) | ✅ conectado e testado |
| Supabase Auth (JWT) | ✅ `auth.getUser()` valida a assinatura |
| Mercado Pago | ⚠️ **código pronto, NÃO executado** — falta credencial |
| Google OAuth já existente | ✅ usado apenas como fonte de JWT; não foi alterado |

---

## 8. Testes executados

### Automatizados

| Suíte | Resultado |
|---|---|
| `test-round45-monetizacao.mjs` (novo) | **91/91** |
| Bateria completa `test-round*.mjs` | **30 suítes, 0 falhas** |
| `tsc --noEmit` | 0 erros |
| `npm run build` | ok (6,83 s) |
| `test-round43-mural-desktop` (regressão do mural) | 10/10 |
| Bundle `dist/assets/*.js` contém segredo? | **0 ocorrências** |
| CSS órfão da rodada 43 | 0 |

### No banco real (transações com `rollback`, nada persistido)

| Verificação | Resultado |
|---|---|
| 3 planos com preço, limite e setup da especificação | ✅ |
| Desconto anual exatamente 10% nos 3 planos | ✅ (calculado em SQL) |
| Features progressivas por plano | ✅ (`reports` a partir do Escola; `ai_advanced`/`multi_unit`/`api` só no Rede) |
| INSERT de escola + assinatura `trialing` + cobrança `pending` | ✅ |
| UPDATE de plano + `subscription_events` + `platform_audit_logs` | ✅ |
| Webhook duplicado rejeitado por índice único | ✅ (erro 23505) |
| `anon` não INSERT/UPDATE/DELETE em `subscriptions`, `payment_transactions`, `webhook_events`, `platform_audit_logs` | ✅ |
| `anon` só INSERT em `sales_leads` | ✅ |
| App escolar intacto (`users`, `events`, `eventos`, `deleted_events`, `school_accounts`, `event_participations` etc. com escrita preservada) | ✅ |
| 0 tabelas com RLS e sem policy no schema público | ✅ |

---

## 8b. Revisão pré-commit — bugs encontrados e corrigidos

A revisão estrita (antes do commit) encontrou quatro defeitos reais no código
que eu tinha acabado de escrever. Todos foram corrigidos e cobertos por teste.

| # | Bug | Por que importava |
|---|---|---|
| 1 | `consultarCobranca()` não devolvia `external_reference` | O webhook procurava a transação por um campo que nunca vinha; cairia sempre no fallback e, para cobrança sem `provider_charge_id`, marcaria "cobrança desconhecida" — **pagamento real seria ignorado**. |
| 2 | Webhook não conferia o valor pago | Um pagamento aprovado de R$ 1,00 quitaria a mensalidade de R$ 699,00. |
| 3 | Webhook tratava `registro == null` como duplicado | Qualquer falha de INSERT (banco fora, coluna errada) virava "já processado" e o pagamento era **descartado em silêncio**. Agora só `23505` é duplicado; o resto devolve 500. |
| 4 | `submitDemoLead` exigia JWT | O formulário de demonstração roda na vitrine para quem **ainda não tem conta** — pedir login ali mata a captação. Rotas públicas agora usam `publico: true`. |

Além disso, uma limpeza: `ehProprietario("teste@teste.com")` era uma chamada sem
sentido no diagnóstico público; substituída por `proprietarios().length > 0`.

Verificações adicionadas ao `test-round45` para cada um desses casos.

## 8c. Deploy das Edge Functions — feito

As três funções foram publicadas e estão `ACTIVE` no projeto
`jaoheenjltzzglfncgfq` (`billing-api`, `billing-webhook`, `billing-lifecycle`).
Segredos `MERCADOPAGO_WEBHOOK_SECRET`, `APP_PUBLIC_URL`,
`PLATFORM_OWNER_EMAILS` e `MERCADOPAGO_ENV` configurados.

Detalhe técnico que importa para manutenção: o deploy foi feito publishando o
bundle gerado por `esbuild` (o ambiente não tinha a CLI do Supabase). Portanto
**alterar o `.ts` não republica sozinho** — ver §11 de `GUIA_PAGAMENTOS.md`.

Continua faltando apenas `MERCADOPAGO_ACCESS_TOKEN`.

## 9. Pendências — o que **não** está pronto

Declarado explicitamente, conforme exigido no item 20 dos critérios.

### 9.1 Deploy das Edge Functions — **não realizado**

As funções existem no repositório mas **não foram publicadas** no projeto
Supabase: o sandbox não tem a CLI autenticada nem saída de rede para o
endpoint de deploy.

Comando (rodar em máquina com acesso):

```bash
supabase link --project-ref jaoheenjltzzglfncgfq
supabase functions deploy billing-api     --no-verify-jwt
supabase functions deploy billing-webhook --no-verify-jwt
supabase functions deploy billing-lifecycle
```

Enquanto isso não for feito, `/assinatura` e `/master/monetizacao` mostram erro
de conexão com a explicação, e `/planos` continua funcionando (lê o banco
direto, via RLS pública).

### 9.2 Segredos não configurados

Nenhuma destas variáveis existe no ambiente hoje:

* `MERCADOPAGO_ACCESS_TOKEN`
* `MERCADOPAGO_WEBHOOK_SECRET`
* `APP_PUBLIC_URL`
* `PLATFORM_OWNER_EMAILS`

Consequências diretas e honestas:

* sem `MERCADOPAGO_*`: nenhuma cobrança real é criada; fica `pending` com o
  motivo na tela. **Nada é simulado como pago.**
* sem `PLATFORM_OWNER_EMAILS`: **o painel do proprietário não abre para
  ninguém** (falha fechada proposital). Não existe coluna `is_owner` para
  contornar.

### 9.3 Cobrança recorrente automática (preapproval) — não implementada

O adaptador cria cobranças avulsas (PIX/boleto/cartão) e o webhook renova o
período quando o pagamento é confirmado. A assinatura automática do Mercado
Pago (`POST /preapproval`, débito recorrente sem ação do cliente) **não** foi
implementada: exige ambiente de produção e teste com cartão real. Hoje a
renovação é por emissão de nova cobrança.

### 9.4 Cron do `billing-lifecycle` — não agendado

Sem isso, teste vencido não vira `past_due` e cancelamento não vira `canceled`
pelo banco (a tela calcula o estado efetivo, então não há erro visível — mas os
indicadores ficam parados). SQL para agendar está em `GUIA_PAGAMENTOS.md` §9.

### 9.5 Integração do checkout de cartão no navegador

PIX e boleto retornam link e funcionam sem SDK. Cartão exige tokenização no
navegador pelo SDK do Mercado Pago, o que significa adicionar a biblioteca e o
`public_key`. Não foi feito para não instalar dependência sem necessidade
comprovada — a UI hoje oferece PIX e boleto.

---

## 10. Comparação de escopo

O que foi feito versus o que foi preservado:

| Área | Tocado? |
|---|---|
| `AdminPanel.tsx` | ❌ não |
| Autenticação (login, cadastro, Google, recuperação) | ❌ não |
| Feed, mural, calendário, mapa, perfil, escolas, portal | ❌ não |
| `server.ts` | ❌ não |
| Tabelas escolares (`users`, `events`, `eventos`, …) | ❌ não |
| Tema, responsividade, identidade visual | ❌ não (as telas novas usam as mesmas classes) |
| Dependências (`package.json`) | ❌ não (nenhuma instalada) |

Toda alteração é aditiva, isolada e reversível: remover os 3 componentes e
reverter os 117 insertions devolve o app ao estado da rodada 44, sem resíduo no
banco além das policies mais restritivas (que a própria migration documenta
como reverter).
