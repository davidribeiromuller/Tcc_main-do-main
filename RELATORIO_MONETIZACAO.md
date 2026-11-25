# RELATÓRIO DE MONETIZAÇÃO — PLANOS, ASSINATURAS E COBRANÇA

**Projeto:** eloEscola · **Data:** 2026-11-11 · **Rodada:** 36

---

## 1. Situação encontrada: monetização já operante

Diferente do que a ordem presumia, o sistema comercial **não havia sido
removido**:

| Item | Arquivo | Linhas |
|---|---|---|
| Página pública de planos | `src/components/PlansAndPricing.tsx` | 367 |
| Área de assinatura da escola | `src/components/SchoolSubscription.tsx` | 602 |
| Painel Master | `src/components/MasterPanel.tsx` | 1.037 |
| Serviço de planos | `src/lib/plansService.ts` | 96 |
| Regras de assinatura | `src/lib/subscription.ts` | 321 |
| Adaptador de cobrança | `src/lib/billing.ts` | 329 |
| Backend comercial | `src/lib/saasStore.ts` | 1.037 |
| Rotas | `server.ts` | 19 `/api/master/*` + 16 `/api/school/*` |

O que **não** existia era a ligação completa em alguns pontos. O que foi feito
está na seção 4.

---

## 2. Preços: vêm do banco, não do React

Verificado por `grep` em todo `src/`:

```
grep -rn "14900\|29900\|69900" src/   →  apenas "#F29900" (cor de pin do mapa)
```

**Nenhum preço fixo em componente.** O catálogo é semeado pela migration
`20261111_saas_core.sql` e editável pelo Painel Master
(`PUT /api/master/plans/:id`).

### 2.1 Catálogo real em produção (lido do banco)

| Plano | Mensal | Anual | Implantação | Alunos | Unidades | Admins |
|---|---|---|---|---|---|---|
| **Comunidade** | R$ 149,00 | R$ 1.609,20 | R$ 390,00 | 300 | 1 | 3 |
| **Escola** | R$ 299,00 | R$ 3.229,20 | R$ 690,00 | 800 | 1 | 10 |
| **Rede** | R$ 699,00 | R$ 7.549,20 | R$ 1.490,00 | 2.000 | 3 | 30 |

Os três estão `is_active = true` e `is_public = true`.

### 2.2 Adicionais (5 ativos no banco)

| Módulo | Valor | Cobrança |
|---|---|---|
| `ai_advanced` | R$ 59,00 | mensal |
| `reports` | R$ 49,00 | mensal |
| `personalization` | R$ 99,00 | mensal |
| `training` | R$ 250,00 | por sessão |
| `integration` | R$ 1.500,00 | orçamento |

### 2.3 Descontos e regras (constantes em código, aplicadas no servidor)

| Constante | Valor | Onde |
|---|---|---|
| desconto anual | 10% | `ANNUAL_DISCOUNT_PERCENT` |
| Escolas Fundadoras | 20% por 12 meses | `FOUNDER_DISCOUNT_PERCENT` |
| vagas de fundadora | 3 | `FOUNDER_SLOTS` |
| teste institucional | 30 dias | `TRIAL_DAYS` |
| carência após vencimento | 7 dias | `GRACE_DAYS` |
| alerta de uso | 80% do limite | `WARN_THRESHOLD` |

Decisão de arquitetura: **preços são dados** (banco); **regras de negócio são
código** (constantes). Isso evita que um erro de digitação no painel quebre o
cálculo de carência ou de trial.

---

## 3. Página pública de planos (`/planos`)

Confirmado por leitura de código:

```ts
// src/components/PlansAndPricing.tsx
import { fetchPlansCatalog, type PlansCatalog, type AddonView } from "../lib/plansService.ts";
const [catalog, setCatalog] = useState<PlansCatalog | null>(null);
```

- Consome `GET /api/saas/plans` (via `fetchPlansCatalog`), que é **público**
- Lê a RLS `plans_public_read` (`is_public AND is_active`)
- Exibe loading, erro e catálogo — não usa constante local
- O botão de contratação leva à celebração comercial; **não promete pagamento
  funcional** quando o provedor não está configurado (ver §6)

---

## 4. O que foi efetivamente corrigido nesta rodada

| Item | Antes | Depois |
|---|---|---|
| Diretório de usuários | lia `users` do navegador → **1 registro** visível com RLS fechada | via `/api/users` (servidor) |
| Auditoria do painel | `platform_audit_logs` gravado mas **nenhuma tela** | aba Auditoria em `/admin` |
| Preço do plano | editável, sem trilha | `plan.updated` auditado com valor anterior e novo |
| Aprovação de sugestão | publicava evento duplicado em corrida | reivindicação atômica antes de publicar |

O que **já estava correto** e foi apenas verificado (não reescrito):

- MRR/ARR calculados no servidor a partir de `subscriptions` + `plans`
- `effectivePriceCents` aplica desconto antes de somar o MRR
- Webhook com validação criptográfica e idempotência
- Cobranças com `idempotencyKey`
- Bloqueio só de escrita (leitura continua no vencimento)

---

## 5. Indicadores financeiros (Painel Master)

`GET /api/master/overview` — `requireAuth` + `requirePlatformOwner`.

```ts
const mrrCents = subs
  .filter((s) => s.status === "active")
  .reduce((acc, s) => {
    const base = priceOf(s.plan_id, s.billing_cycle);   // mensal ou anual/12
    return acc + effectivePriceCents(s as any, base);   // aplica desconto
  }, 0);

arrCents = mrrCents * 12;
```

Características:

- **Só assinaturas `active` entram no MRR.** `trialing`, `canceled` e `past_due`
  ficam fora — não infla receita com teste.
- Ciclo anual é dividido por 12 antes de compor o MRR.
- Descontos (fundadora, promocional) são aplicados via `effectivePriceCents`.
- `founderSlotsUsed` derivado de `schools.is_founder`, com teto `FOUNDER_SLOTS`.
- `billing: getBillingDiagnostics()` diz **se há provedor configurado** — o
  painel consegue distinguir "zero receita" de "cobrança não configurada".

Estado atual em produção: 1 assinatura `trialing` (Rede, mensal, até
2026-12-24). Portanto **MRR = R$ 0,00 é o valor correto** — não há assinatura
`active` ainda. Isso é um resultado real, não um zero por falha.

---

## 6. Cobrança (`src/lib/billing.ts`)

### 6.1 O que está pronto

- Adaptador Stripe implementado (`createCharge`, `verifyStripeSignature`)
- Suporte a PIX / boleto / cartão no campo `method`
- Mensal e anual
- `idempotencyKey` obrigatório — recusa criar cobrança sem chave
- Webhook: assinatura HMAC validada, evento registrado em `webhook_events`,
  duplicata responde `200 {duplicate:true}` sem reprocessar
- **Assinatura inválida nunca ativa nada** — é só auditada
- Ativação só por webhook confirmado; o frontend não consegue ativar assinatura
  dizendo que pagou

### 6.2 O que depende de credencial externa

`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` não estão configurados. Sem eles:

- `getBillingDiagnostics()` reporta "sandbox / não configurado"
- Nenhuma cobrança real é criada
- A página de planos não promete pagamento funcional

Provedores alternativos (Asaas, Mercado Pago) têm apenas as **variáveis**
previstas — o adaptador não foi implementado. Não inventei implementação
parcial: um adaptador financeiro pela metade é pior que um ausente, porque falha
no meio do fluxo de cobrança.

---

## 7. Painel Master (`/master`) — 19 rotas

| Grupo | Rotas |
|---|---|
| Visão geral | `GET /api/master/overview` |
| Instituições | `GET/POST /api/master/schools`, `PUT /api/master/schools/:id` |
| Planos | `GET /api/master/plans`, `PUT /api/master/plans/:id` |
| Assinaturas | `GET /api/master/subscriptions`, `PUT /api/master/subscriptions/:id` |
| Financeiro | `GET /api/master/payments`, `POST /api/master/payments/manual` |
| Parceiros | `GET/POST /api/master/partners`, `PUT /api/master/partners/:id/status` |
| Campanhas | `POST /api/master/campaigns` |
| Leads | `GET /api/master/leads`, `PUT /api/master/leads/:id/status` |
| Privacidade (LGPD) | `GET /api/master/privacy-requests`, `PUT .../:id` |
| Auditoria | `GET /api/master/audit` |

**Todas** com `requirePlatformOwner` — que exige **duas** condições: e-mail na
allowlist do ambiente **e** papel de chefe confirmado no banco. Sem a allowlist
configurada, ninguém entra; o Master nunca fica aberto por omissão.

Verificado em execução: um Chefe de instituição recebe 403/503 em
`/api/master/overview`. **Chefe de escola não é proprietário da plataforma.**

---

## 8. Área de assinatura da escola (`/subscription`) — 16 rotas

| Função | Rota |
|---|---|
| Dados da minha escola | `GET /api/school/me` |
| Cancelar | `POST /api/school/subscription/cancel` |
| Trocar de plano | `POST /api/school/subscription/change-plan` |
| Histórico | `GET /api/school/subscription-events` |
| Pagamentos | `GET /api/school/payments` |
| Campanhas de parceiros | `GET /api/school/campaigns`, `POST /api/school/campaigns/:id/decision` |

---

## 9. Resumo honesto

| Critério | Estado |
|---|---|
| Três planos oficiais | ✅ no banco, preços corretos |
| Preços configuráveis pelo proprietário | ✅ `PUT /api/master/plans/:id` |
| Descontos e adicionais | ✅ 5 adicionais ativos |
| Página pública lê da API | ✅ |
| MRR/ARR calculados de dados reais | ✅ (R$ 0 correto: só há trial) |
| Webhook validado e idempotente | ✅ |
| Cobrança em sandbox **executada** | ❌ sem `STRIPE_SECRET_KEY` |
| PIX/boleto/cartão | 🟡 campos e fluxo prontos, adaptador só Stripe |
| Asaas / Mercado Pago | ⛔ apenas variáveis previstas |
