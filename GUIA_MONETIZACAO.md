# GUIA_MONETIZACAO — modelo comercial do eloEscola

> Documento do módulo comercial. Nada aqui altera o funcionamento escolar
> descrito no `README.md`.

## 1. Modelo de negócio

O eloEscola é vendido em **SaaS para instituições de ensino**. Quem paga é a
escola; estudantes, professores e responsáveis usam de graça.

Receitas:

| Origem | Tipo | Entra no MRR? |
|---|---|---|
| Assinatura mensal/anual | recorrente | **sim** |
| Taxa de implantação | única | não |
| Adicionais mensais (IA, relatórios, personalização) | recorrente | sim, quando a assinatura está ativa |
| Treinamento e integrações | avulso | não |
| Parcerias (diretório / campanha) | recorrente ou pontual | não |

**MRR** é receita recorrente *contratada*: soma do valor mensal das assinaturas
`active`, com o ciclo anual convertido para equivalente mensal. **ARR = MRR × 12.**
Nenhum dos dois é lucro, e nenhum inclui taxa de implantação, treinamento ou
cobrança ainda não paga.

## 2. Planos

Valores gravados na tabela `plans` (nunca em constante de código). Para mudar,
use `/master/monetizacao` → aba Planos.

| Plano | Mensal | Anual (10% off) | Implantação | Usuários | Unidades |
|---|---|---|---|---|---|
| Comunidade | R$ 149,00 | R$ 1.609,20 | R$ 390,00 | 300 | 1 |
| Escola | R$ 299,00 | R$ 3.229,20 | R$ 690,00 | 800 | 1 |
| Rede | R$ 699,00 | R$ 7.549,20 | R$ 1.490,00 | 2.000 | 3 |

O anual é 10% menor que 12× o mensal, e essa diferença é recalculada a cada
edição de preço no painel (a tela mostra a economia antes de salvar).

### Recursos por plano

A coluna `plans.features` é um JSON com chaves booleanas:

| Recurso | Comunidade | Escola | Rede |
|---|---|---|---|
| `events`, `authorizations`, `school_profile`, `student_area`, `ai_assistant` | ✅ | ✅ | ✅ |
| `reports` (relatórios avançados) | ❌ | ✅ | ✅ |
| `ai_advanced` | ❌ | ❌ | ✅ |
| `multi_unit` | ❌ | ❌ | ✅ |
| `custom_domain` | ❌ | ❌ | ✅ |
| `api_integration` | ❌ | ❌ | ✅ |
| `partners_directory` | ✅ | ✅ | ✅ |

**Nenhum desses recursos é usado para bloquear o app hoje.** Ver §5.

## 3. Adicionais

Tabela `plan_addons`:

| Adicional | Preço | Cobrança |
|---|---|---|
| Elo IA avançado | R$ 59,00 | mensal |
| Relatórios avançados | R$ 49,00 | mensal |
| Personalização visual | R$ 99,00 | mensal |
| Treinamento remoto | R$ 250,00 | por sessão |
| Integrações personalizadas | a partir de R$ 1.500,00 | sob orçamento |

Os três primeiros são cobránça recorrente e não alteram o funcionamento do
assistente Elo existente: o módulo comercial apenas registra a cota contratada
em `feature_entitlements` / `usage_records`. Trocar prompt, provedor ou
comportamento do chat está fora do escopo.

## 4. Condições comerciais

### Pagamento anual
10% de desconto sobre o equivalente a 12 mensalidades. A taxa de implantação
**não** entra no desconto e é cobrada separadamente.

### Escolas Fundadoras
As **3 primeiras** instituições elegíveis recebem **20% por 12 meses**.
O registro fica em `schools.is_founder` / `founder_slot` e
`subscriptions.founder_discount` / `discount_until`. O desconto é aplicado pelo
servidor (`effectivePriceCents`), nunca aceito do navegador.

A contagem de vagas ocupadas é pública (só o número, nunca o nome de outras
escolas) para a vitrine poder mostrar "restam N vagas".

### Teste institucional
Até **30 dias**, sem cobrança. O estado fica em `subscriptions.status = 'trialing'`
com `trial_started_at` / `trial_ends_at`. A rotina `billing-lifecycle` encerra o
teste e abre 7 dias de tolerância — o teste nunca vira cobrança automática.

**Ativação duplicada é impedida no banco**: o índice
`ux_subscriptions_active_per_school` garante uma assinatura vigente por
instituição.

## 5. Compatibilidade com o app que já existe

Regra que vale acima de qualquer tela comercial:

> **Nada que já funcionava para de funcionar por causa da monetização.**

Na prática:

* Feed, mural, calendário, mapa, compromissos, autorizações, inscrições e dados
  históricos continuam acessíveis em qualquer estado de assinatura.
* O bloqueio de escrita (`canWrite = false`) só existe para estado
  `suspended`/`canceled`/`expired`, e mesmo assim a **leitura permanece**.
* Instituições que já usavam o app e ainda não têm linha em `schools` aparecem
  como "sem assinatura" na área `/assinatura` — e **não** são suspensas.
  Nenhuma rotina cria assinatura nem muda status de escola existente por conta
  própria.

## 6. Onde ficam as coisas

| Assunto | Arquivo |
|---|---|
| Regras puras (preço, desconto, estados) | `src/lib/subscription.ts` |
| Catálogo (leitura do banco) | `src/lib/plansService.ts` |
| Assinatura da instituição (leitura) | `src/lib/subscriptionService.ts` |
| Chamadas ao servidor | `src/lib/billingApi.ts` |
| Vitrine `/planos` | `src/components/PlansAndPricing.tsx` |
| Área `/assinatura` | `src/components/SchoolSubscription.tsx` |
| Painel `/master/monetizacao` | `src/components/MasterPanel.tsx` |
| API comercial | `supabase/functions/billing-api/index.ts` |
| Webhook de pagamento | `supabase/functions/billing-webhook/index.ts` |
| Rotina de ciclo de vida | `supabase/functions/billing-lifecycle/index.ts` |
| Permissões do banco | `supabase/migrations/20261126_monetizacao_rls.sql` |

## 7. Parceiros eloEscola

Módulo comercial separado, **desativado por padrão**: as tabelas
`partners`/`partner_campaigns` existem, o painel permite aprovar/suspender, mas
nada é exibido no feed de eventos. Publicar anúncio no mural exige uma
implementação específica e aprovação — e o pedido proíbe inserir anúncio
automaticamente.

Regras já garantidas no banco:

* só parceiro `approved` **e** com `directory_paid_until` vigente é legível
  publicamente;
* nenhum dado de aluno, responsável, telefone ou hábito de uso é exposto ao
  parceiro;
* campanha só aparece se `approved` e dentro da janela `starts_at`/`ends_at`.
