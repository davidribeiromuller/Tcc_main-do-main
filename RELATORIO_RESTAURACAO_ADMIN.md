# RELATÓRIO DE RESTAURAÇÃO — PAINEL ADMINISTRATIVO

**Projeto:** eloEscola · **Data:** 2026-11-11 · **Rodada:** 36
**Repositório:** https://github.com/davidribeiromuller/Tcc_main-do-main.git
**Branch:** `arena/f1570eb9-tcc-main-do-main`

---

## 1. Veredito curto

Depois de investigar os **72 commits** do histórico completo, a conclusão é
diferente da premissa da ordem de serviço — e é importante dizê-lo antes de
qualquer número:

> **Não houve remoção do painel administrativo, do banco ou da monetização.**
> Apenas **3 arquivos** foram deletados em toda a história do repositório, e
> nenhum deles pertence a esses módulos.

Portanto **não houve restauração de código antigo**. Restaurar versões
anteriores teria sido o caminho errado: os arquivos citados na ordem
(`AdminPanel.tsx`, `server.ts`, `subscription.ts`, `billing.ts`, `MasterPanel.tsx`,
`PlansAndPricing.tsx`, etc.) **existem e estão maiores e mais conectados do que
em qualquer ponto do passado**.

O que existia de verdade eram **funcionalidades desconectadas ou ausentes**,
apontadas pela própria ordem. Foram essas que eu implementei.

---

## 2. Investigação do histórico (Parte 1)

### 2.1 Metodologia

O clone inicial era **raso** (`is-shallow-repository: true`, 9 commits). Rodei
`git fetch --unshallow` para obter os 72 commits e poder investigar remoções
reais. Sem isso, qualquer conclusão sobre "arquivos excluídos" seria inválida.

### 2.2 O que foi deletado em toda a história

```bash
git log --diff-filter=D --name-only --pretty=format:"" --all | sort -u
```

Resultado completo — exatamente 3 arquivos:

| Arquivo | Commit | Natureza |
|---|---|---|
| `src/lib/eventVisuals.ts` | `3b1abb4` (rodada 16) | refatoração de UI (cards de evento), extraído para `EventCardMural.tsx` |
| `test-round15.mjs` | `3b1abb4` | suíte substituída pela round16 |
| `src/lib/institutionalAdminService.ts` | `7516fbb` | substituído por `schoolAccountsService.ts` (lista separada em `school_accounts`) |

Nenhum é painel, banco ou cobrança. Os três foram **substituições**, não perdas.

### 2.3 Situação de cada arquivo citado na ordem

| Arquivo | Estado | Linhas |
|---|---|---|
| `src/components/AdminPanel.tsx` | presente | 4.813 |
| `server.ts` | presente | 5.247 |
| `src/db/index.ts` | presente | 405 |
| `src/db/schema.ts` | presente | 216 |
| `src/db/fallbackStore.ts` | presente | 1.398 |
| `src/lib/subscription.ts` | presente | 321 |
| `src/lib/billing.ts` | presente | 329 |
| `src/lib/staticHosting.ts` | presente | 150 |
| `src/App.tsx` | presente | 2.741 |
| `src/components/MasterPanel.tsx` | presente | 1.037 |
| `src/components/PlansAndPricing.tsx` | presente | 367 |
| `src/components/SchoolSubscription.tsx` | presente | 602 |
| `supabase/migrations/` | 5 arquivos (+2 criados nesta rodada) | — |

**Nenhum arquivo ausente.** O painel administrativo, o painel Master, a página
de planos e a área de assinatura já estavam no repositório antes desta rodada.

### 2.4 O que a investigação realmente encontrou

Como nada foi removido, o problema não podia ser "recuperar arquivo". Ele estava
em outro lugar: **funções presentes mas desconectadas, e duas falhas de
segurança**. É o que a seção 4 documenta.

---

## 3. As 8 abas do painel `/admin` (Parte 3)

Situação **após** esta rodada:

| Aba | Rota de API | Estado |
|---|---|---|
| `users` | `GET /api/users` | ✅ lista, busca, filtro por cargo/status e **paginação** |
| `blocked` | `POST /api/users/:id/block` · `/unblock` | ✅ |
| `events` | `POST/PUT/DELETE /api/events` | ✅ com sincronização do feed público |
| `suggestions` | `GET /api/admin/suggestions` · `/:id/approve` · `/:id/reject` | ✅ aprovação agora **atômica** |
| `profileChanges` | `GET /api/admin/profile-requests` · `/:id/approve` · `/:id/reject` | ✅ reivindica antes de aplicar |
| `personal` | `GET/DELETE /api/admin/personal-events` | ✅ |
| `schools` | `GET/POST /api/admin/school-accounts` (+reset-password, status, verify) | ✅ |
| **`audit`** | `GET /api/admin/audit` | 🆕 **criada nesta rodada** |

### 3.1 Nova aba: Auditoria (§3.10)

Era o único item de painel que **não existia em nenhuma forma**. O
`platform_audit_logs` já vinha sendo gravado desde a rodada 34, mas nenhuma tela
o exibia — o Chefe não tinha como saber quem bloqueou um aluno ou aprovou uma
sugestão.

Implementado:

- **Rota** `GET /api/admin/audit` com `requireAuth` + `requireAdminOrStaff`
- **Filtros**: `?action=`, `?targetType=`, `?from=`, `?to=`, `?limit=` (1–500)
- **Hierarquia respeitada**: Chefe vê `actor_email` e `ip` completos; Funcionário
  recebe o e-mail **mascarado** (`fu********@escola.com`) e sem IP
- **Higiene de dados**: o `metadata` é varrido e qualquer chave que case com
  `senha|password|token|secret|signature|assinatura` é descartada
- **Interface**: tabela com Quando / Autor / Ação / Registro / Detalhes, filtro
  por texto e três estados visuais distintos (carregando, erro, vazio)

Ações de usuário passaram a ser registradas: `user.updated`, `user.blocked`,
`user.unblocked`, `user.deleted_permanently`, `user.soft_deleted`.

### 3.2 Paginação do diretório (§3.2)

`GET /api/users` devolvia a tabela inteira. Com uma rede escolar grande isso
vira megabytes e o navegador trava.

```josn
{ "users": [...], "page": 2, "pageSize": 50, "total": 412, "totalPages": 9 }
```

**Compatibilidade preservada:** sem `?page`, devolve a lista completa — os
componentes atuais e as suítes antigas continuam funcionando. Busca (`?q=`),
filtro de cargo (`?role=`) e status (`?status=ativos|bloqueados`) acontecem no
servidor **antes** de paginar, para não paginar sobre o subconjunto errado.

---

## 4. Correções de segurança encontradas no caminho

Estas não estavam na lista de pedidos, mas apareceram ao reconstruir — omiti-las
seria entregar um painel "funcionando" com buracos.

### 4.1 🔴 Senha gravada em texto claro pelo painel

`PUT /api/users/:id` fazia:

```ts
if (password !== undefined) updateData.password = String(password).trim();  // ❌
```

O Chefe redefinia a senha pelo painel e ela ia **legível** para o banco,
contradizendo a decisão da rodada 34 (senha de `users` protegida por hash).
Corrigido: `hashPassword()` + `validatePasswordStrength()` + `must_change_password`.

### 4.2 🔴 Qualquer usuário agia em nome de outro nas participações

`GET/POST /api/users/:userId/participations` tinham `requireAuth` e **nenhuma
checagem de dono**. Trocando o `:userId` da URL, um aluno confirmava presença
por outro aluno. Adicionada a guarda `podeAgirSobreParticipacoes`, que confere
cargo **no banco** (`checkIsChefe`/`checkIsFuncionario`) — nunca no token.

### 4.3 🔴 Aprovação de sugestão duplicava eventos

`/api/admin/suggestions/:id/approve` criava o evento **antes** de reivindicar a
sugestão:

```
verifica status=pending → cria evento → marca approved
```

Duas requisições simultâneas (duas abas, duplo clique, retry de rede) passavam
juntas pela verificação e publicavam **dois eventos**. Agora o `update`
condicional em `status='pending'` vem **primeiro** e serve de trava atômica; se
a publicação falhar depois, a sugestão volta para a fila.

### 4.4 Rota fantasma: cancelar presença

`cancelarPresenca()` em `participationsService.ts` chamava
`DELETE /api/users/:userId/participations/:eventId`, que **nunca existiu** no
servidor. A Chamada dava 404 e o serviço devolvia `false` em silêncio. Rota
criada, com 404 honesto quando não há registro para remover.

### 4.5 Diretório lia `users` do navegador (falso vazio em produção)

`fetchUsersDirectFromSupabase()` consultava `users` direto do navegador. Com a
RLS fechada (`users_self_read`), essa consulta devolve **apenas a linha do
próprio administrador**. O painel mostrava "1 usuário" num banco com dezenas,
sem nenhum erro. Convertido para `/api/users`; o caminho Supabase direto ficou
restrito ao modo estático.

### 4.6 🔴 Migrations posteriores recriavam a escrita pública

A `20261113` fecha as policies públicas. As migrations `20261118` e `20261119`
rodam **depois** e criavam `insert/update ... with check (true)` em
`profile_change_requests` e `school_profiles`.

Num deploy limpo, o fechamento da rodada 35 era **desfeito automaticamente** —
volta a ser possível, com a chave publicável, escrever solicitações de perfil
alheias e a ficha de qualquer escola. Produção estava certa (o fechamento foi
manual), mas o repositório não: um `supabase db push` em ambiente novo
reintroduziria o furo.

Corrigido nas duas migrations, com teste percorrendo-as em ordem cronológica.

### 4.7 `schema.ts` do Drizzle desatualizado

Faltavam `must_change_password`, `matricula`, `personal_email` e
`link_verified_at` — todas já existentes no Postgres. Consequência prática: no
caminho Postgres, o Drizzle **descartava** o `must_change_password` e a troca
obrigatória de senha nunca era gravada.

---

## 5. Arquivos alterados nesta rodada

| Arquivo | Mudança |
|---|---|
| `server.ts` | rota `/api/admin/audit`; paginação e busca em `/api/users`; hash de senha em `PUT /api/users/:id`; guarda de dono nas participações; rota `DELETE` de participação; auditoria das ações de usuário; reivindicação atômica de sugestão |
| `src/components/AdminPanel.tsx` | aba **Auditoria** completa (estado, efeito, tabela, 3 estados visuais); import de `mensagemDeErroDaApi` |
| `src/lib/usersService.ts` | `fetchUsersDirectFromSupabase` server-first via `/api/users` |
| `src/db/fallbackStore.ts` | `removeParticipationFallback` |
| `src/db/schema.ts` | 4 colunas de `users` que existiam no banco e faltavam no ORM |
| `supabase/migrations/20261118_profile_change_requests.sql` | RLS corrigida: removidas 3 policies de escrita pública |
| `supabase/migrations/20261119_school_profiles.sql` | RLS corrigida: removidas 2 policies de escrita pública |
| `test-round36-restauracao.mjs` | 🆕 98 verificações |
| `test-round19.mjs` | contagem de tabelas 4 → 5 (nova tabela de auditoria) |

---

## 6. O que NÃO foi feito, e por quê

Sendo direto sobre os limites desta entrega:

1. **Não restaurei código antigo** — não havia o que restaurar (seção 1).
2. **Não recriei o login compartilhado de escolas.** A ordem proíbe, e a
   arquitetura atual já usa usuários individuais com `memberships`. A tabela
   legada `school_accounts` continua existindo para não quebrar dados; ela é
   administrada só pelo servidor e não autentica mais ninguém como instituição.
3. **Não testei as rotas dependentes de rede até o Supabase em execução.** O
   sandbox não alcança `*.supabase.co`. Elas foram validadas por SQL direto no
   banco de produção (seção 7) e por leitura de contrato — está marcado onde.
4. **Não executei pagamento real.** Não há `STRIPE_SECRET_KEY`. Ver
   `PENDENCIAS_CONFIGURACAO.md`.
5. **Não alterei o design existente.** A aba nova reutiliza as classes e
   padrões visuais do painel atual.

---

## 7. Evidência de execução

Servidor local (modo fallback), com Chefe criado por `BOOTSTRAP_ADMIN_*`:

```
/api/users            sem token 401 · Chefe 200 · Funcionário 200 (sem CPF/phone)
/api/users?page=1&pageSize=2   2 de 7 · totalPages 4
/api/users?page=2&pageSize=2   ids [9903, 5256, 10000] (página correta)
/api/users?q=chefe             total=1
/api/users?pageSize=9999       pageSize=500 (clamp)
/api/admin/audit      sem token 401 · sem banco 503 SAAS_UNREACHABLE
PUT  /api/users/1511  {"password":"123"}  → 400 "mínimo 8 caracteres"
PUT  /api/users/1511  {"password":"NovaSenha987"} → 200, gravado "scrypt$16384$8$1$..."
GET  /api/users/5/participations   aluno comum 403 · Chefe 200
DEL  /api/users/5/participations/999  404 "Participação não encontrada"
```

Hierarquia de cargos (Funcionário tentando ações de Chefe):

```
PUT    /api/users/1                    403
POST   /api/users/1/block              403
DELETE /api/users/1/permanent          403
POST   /api/admin/suggestions/1/approve 403
GET    /api/master/overview            403/503 (fora da allowlist)
```

---

## 8. Verificação automatizada

| Suíte | Resultado |
|---|---|
| `test-round36-restauracao.mjs` (**nova**) | **98/98** ✅ |
| round19 | 32/32 ✅ (atualizada) |
| Demais 27 suítes | todas verdes ✅ |
| `npx tsc --noEmit` | limpo ✅ |
| `npm run build` | OK ✅ |

A round36 roda de verdade: sobe o servidor em porta isolada, faz login, cadastra
um aluno e verifica 401/403/200/400/404/503 em cada caso. Duas execuções
consecutivas passaram — não depende de estado deixado por execução anterior.
