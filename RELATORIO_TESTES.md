# RELATÓRIO DE TESTES

**Projeto:** eloEscola · **Data:** 2026-11-11 · **Rodada:** 36
**Ambiente:** Node v22.22.3 · sandbox sem acesso de rede a `*.supabase.co`

---

## 1. Resumo

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ limpo (0 erros) |
| `npm run build` | ✅ OK |
| Suítes automatizadas | ✅ **29 de 29 verdes** |
| Verificações totais | **~1.100 asserções** |
| Suíte nova desta rodada | `test-round36-restauracao.mjs` — **104/104** |

---

## 2. Suítes executadas

| Suíte | Asserções | Resultado |
|---|---|---|
| round11 | 64 | ✅ |
| round12 | 32 | ✅ |
| round12b | 18 | ✅ |
| round12c | 21 | ✅ |
| round13 | 31 | ✅ |
| round14 | 36 | ✅ |
| round16 | 39 | ✅ |
| round17 | 49 | ✅ |
| round18 | 50 | ✅ |
| round18-mobile | 21 | ✅ |
| **round19** | **32** | ✅ *(atualizada: 4 → 5 tabelas)* |
| round20 | 35 | ✅ |
| round21 | 41 | ✅ |
| round22 | 27 | ✅ |
| round23 | 142 | ✅ |
| round24 | 40 | ✅ |
| round25 | 45 | ✅ |
| round25-render | 10 | ✅ |
| round26 | 90 | ✅ |
| round26-mural | — | ✅ |
| round26-render | — | ✅ |
| round27 / 27-render | — | ✅ |
| round28 | — | ✅ |
| round31 | — | ✅ |
| round32-security | 121 | ✅ |
| round33-saas | 135 | ✅ |
| round35-admin | 90 | ✅ |
| **round36-restauracao** | **104** | ✅ 🆕 |

---

## 3. A suíte nova: `test-round36-restauracao.mjs`

Diferente das anteriores (que leem strings do fonte), esta **executa** o
comportamento: sobe o servidor numa porta isolada (3999), faz login, cadastra um
aluno e bate nas rotas de verdade.

### 3.1 Blocos

| # | Bloco | Cobre |
|---|---|---|
| 1 | Auditoria do painel | rota existe, guardas, mascaramento de e-mail, higiene do metadata, aba na UI, erro ≠ vazio |
| 2 | Senha em texto claro | ausência de gravação crua, uso de `hashPassword`, validação de força |
| 3 | Corrida em sugestão | reivindicação **antes** da publicação, 409, devolução à fila |
| 4 | Participações | rota DELETE existe, 404 honesto, guarda de dono nos 3 verbos |
| 5 | Diretório no servidor | `/api/users` fora do modo estático, falha ≠ lista vazia |
| 6 | Paginação | `?page`, clamp de `pageSize`, `total`/`totalPages`, busca e filtros, compatibilidade |
| 7 | Schema Drizzle | 4 colunas que faltavam |
| 8 | Diagnóstico de banco | `saasConfigured`, `cachedOffline`, backoff, reconexão |
| 9 | Monetização | preços no banco (não no React), planos editáveis, só proprietário |
| 10 | Webhook | assinatura Stripe e HMAC, `registerWebhookEvent`, duplicata |
| 11 | Degrade honesto | `503` tipado com `hint` |
| 12 | Migrations | 5 arquivos presentes, nenhum `drop table/database`, RLS |
| 13 | **Execução real** | servidor sobe, login, permissões, hash em disco |

### 3.2 Evidência de execução real (bloco 13)

```
✓ servidor sobe
✓ login do Chefe funciona
✓ GET /api/users sem ?page mantém compatibilidade
✓ paginação devolve no máximo pageSize
✓ paginação informa total / totalPages
✓ auditoria sem banco responde 503 tipado (não [] silencioso)
✓ registro de aluno comum funciona
✓ aluno não lê participações de terceiro (403)
✓ aluno lê as próprias participações (200)
✓ aluno não cancela participação de terceiro (403)
✓ Chefe lê participações de terceiro (200)
✓ DELETE de participação devolve 404 quando não há registro
✓ PUT com senha forte é aceito
✓ PUT com senha fraca é recusado (400)
✓ senha gravada no banco é hash scrypt (não texto claro)
✓ Chefe da instituição não entra no /master sem allowlist
✓ /api/users | /api/admin/audit | /api/admin/school-accounts sem token → 401
✓ /api/saas/plans identifica falha de rede como 503 tipado
✓ /api/saas/plans usa código DATABASE_CONNECTION_ERROR no fallback
```

Executada **duas vezes consecutivas**: verde nas duas. Não depende de estado
deixado por execução anterior (o e-mail do aluno de teste é único por execução).

---

## 4. Testes manuais em servidor real

### 4.1 Hierarquia de cargos (§3.3)

Autenticado como **Funcionário Administrador**:

| Ação | Esperado | Obtido |
|---|---|---|
| `GET /api/users` | 200, sem dados pessoais | ✅ 200, campos: `id, uid, nome, email, foto_perfil, role, ativo, institution, createdAt, isAdmin` — **sem** `cpf`, `phone`, `birthdate`, `gender`, `password` |
| `PUT /api/users/1` | 403 | ✅ 403 |
| `POST /api/users/1/block` | 403 | ✅ 403 |
| `DELETE /api/users/1/permanent` | 403 | ✅ 403 |
| `POST /api/admin/suggestions/1/approve` | 403 | ✅ 403 |
| `GET /api/master/overview` | 403/503 | ✅ 403/503 |
| `GET /api/admin/audit` | 200 (permitido, mascarado) | ✅ 503 (só rede) |

**Nenhum dado pessoal restrito vazou para o Funcionário.**

### 4.2 Escopo de dono nas participações

Autenticado como **aluno comum**:

| Ação | Esperado | Obtido |
|---|---|---|
| `GET /api/users/5/participations` | 403 | ✅ 403 |
| `POST /api/users/5/participations` | 403 | ✅ 403 |
| `DELETE /api/users/5/participations/1` | 403 | ✅ 403 |
| `GET /api/users/<próprio>/participations` | 200 | ✅ 200 |

### 4.3 Hash de senha pelo painel

```
PUT /api/users/1511 {"password":"123"}          → 400 "A senha deve ter no mínimo 8 caracteres."
PUT /api/users/1511 {"password":"NovaSenha987"} → 200
senha gravada no banco: scrypt$16384$8$1$a14abb7a98a29...
é texto claro? False
```

### 4.4 Paginação

```
sem ?page            → 7 usuários (compatibilidade)
page=1&pageSize=3    → 3 usuários, totalPages=3
page=2&pageSize=3    → ids [9903, 5256, 10000] (página correta)
page=3&pageSize=3    → 1 usuário
?q=chefe             → total=1
?pageSize=9999       → clamp para 500
```

---

## 5. Testes de banco (via SQL direto no Supabase de produção)

O sandbox não alcança `*.supabase.co` por HTTP, então os testes de banco foram
feitos pelo conector Supabase (SQL), que é o caminho correto — e mais rigoroso,
porque lê o schema de verdade em vez de confiar no ORM.

| Teste | Resultado |
|---|---|
| Listar tabelas de `public` | ✅ 31 tabelas |
| Contar registros por tabela | ✅ `users` 28, `event_suggestions` 46, `eventos` 14, `plans` 3, `plan_addons` 5 |
| Preços dos planos | ✅ Comunidade 149/1609,20 · Escola 299/3229,20 · Rede 699/7549,20 |
| Integridade `schools → subscriptions → plans` | ✅ join resolve: Rede / R$ 699 / trial até 2026-12-24 |
| Policies de RLS | ✅ 14 policies, **nenhuma escrita pública** fora `personal_events` (dono) e `sales_leads` (formulário) |
| Colunas de `users` no schema real | ✅ incluindo `must_change_password`, `matricula`, `personal_email`, `link_verified_at` |
| Migrations registradas | ✅ 6 no histórico do Supabase |
| Criar índices das migrations novas | ✅ 4 índices criados e verificados em `pg_indexes` |

**Não foi executado teste de INSERT/UPDATE/DELETE em tabela de produção com
dados fictícios.** A ordem pede "inserir registro de teste, atualizar, excluir" —
fazer isso nas tabelas reais de produção seria justamente poluir os dados que a
ordem manda preservar. O ciclo de escrita foi validado no ambiente local
(`fallbackStore`), onde é seguro, e nos testes que gravam e leem o hash.

---

## 6. O que NÃO pôde ser testado aqui (e por quê)

Sendo explícito para não haver falso positivo:

| Item | Motivo | Como validar |
|---|---|---|
| `/api/events/deleted` | rota precisa de rede até Supabase | ambiente com rede; retorna `{events, retentionDays}` |
| `/api/admin/suggestions` | idem | idem |
| `/api/admin/profile-requests` | idem | idem |
| `/api/admin/audit` (dados) | idem — respondeu 503 `SAAS_UNREACHABLE` | idem |
| `/api/master/overview` (dados) | idem | idem |
| `test-round25-integration.mjs` | idem (já era ignorado antes) | idem |
| Pagamento em sandbox | falta `STRIPE_SECRET_KEY` | ver `PENDENCIAS_CONFIGURACAO.md` |
| Webhook real | falta `STRIPE_WEBHOOK_SECRET` | idem |
| Envio de e-mail/SMS | falta `RESEND_API_KEY` / `TWILIO_*` | idem |

**Importante:** nesses casos a resposta foi `503 SAAS_UNREACHABLE` **com
código e hint** — não uma lista vazia. É exatamente o comportamento exigido pela
Parte 2.4 e pela Parte 9 da ordem.

---

## 7. Como reproduzir

```bash
npm install --no-save          # sem isso, `npx tsc` baixa o pacote falso tsc@2.0.4
npx tsc --noEmit
npm run build

# suíte nova
npx tsx test-round36-restauracao.mjs

# todas
for f in test-round*.mjs; do
  case "$f" in *integration*) continue;; esac
  echo "== $f"; npx tsx "$f"
done
```

A round36 sobe o próprio servidor na porta 3999. Se você tiver um servidor
rodando na 3000, não há conflito — mas se houver processo preso, mate antes
(o teste usa `detached` e mata o grupo inteiro no `finally`).

---

## 8. Testes manuais da bateria final (pré-push)

Executados contra o servidor local em modo fallback, com Chefe via
`BOOTSTRAP_ADMIN_*`.

### 8.1 Ciclo CRUD completo de usuário

| Passo | Esperado | Obtido |
|---|---|---|
| criar | 200 + id | ✅ id 2349 |
| aparece na listagem (`?q=email`) | 1 | ✅ 1 |
| editar nome | 200, nome novo | ✅ "CRUD Renomeado" |
| bloquear | 200, `ativo: false` | ✅ |
| listar só bloqueados | contém o novo | ✅ 1, contém |
| desbloquear | 200, `ativo: true` | ✅ |
| excluir definitivo | 200 | ✅ |
| confirmar que sumiu | 0 | ✅ 0 |

### 8.2 Ciclo completo de evento (painel ↔ feed público)

| Passo | Esperado | Obtido |
|---|---|---|
| criar | 201 + id | ✅ id 5865 |
| aparece no feed **sem token** | true | ✅ true |
| editar pelo painel | 200, título novo | ✅ "Evento Editado R36" |
| excluir | 200 | ✅ |
| **sumiu do feed público** | true | ✅ true |

A sincronização pedida na §3.4 está confirmada de fato: alteração no painel
reflete no feed respeitando o status.

### 8.3 Participações

| Passo | Esperado | Obtido |
|---|---|---|
| confirmar | 201 | ✅ |
| listar | 1 | ✅ 1 |
| cancelar | 200 | ✅ |
| cancelar de novo | 404 | ✅ 404 |

### 8.4 Telas

| Rota | Status |
|---|---|
| `/admin` | 200 |
| `/master` | 200 |
| `/planos` | 200 |
| `/subscription` | 200 |
| `/privacidade` | 200 |

O bundle servido contém a aba Auditoria (7 ocorrências de `Auditoria`/`auditLogs`).

### 8.5 Bug encontrado nesta bateria: `/api/saas/plans` devolvia 500 genérico

A rota que alimenta a **página pública `/planos`** respondia
`500 {"error":"TypeError: fetch failed"}` quando o banco estava inacessível —
expondo o erro cru do driver e sem dizer se era rede, configuração ou catálogo
vazio. Corrigido:

- falha de rede → `503 {code: "SAAS_UNREACHABLE", hint}`
- outros erros → `500 {code: "DATABASE_CONNECTION_ERROR"}` com mensagem de leitura

Verificado: `503 SAAS_UNREACHABLE | O banco não respondeu ao carregar o
catálogo de planos.` Travado por 2 asserções novas na round36.
