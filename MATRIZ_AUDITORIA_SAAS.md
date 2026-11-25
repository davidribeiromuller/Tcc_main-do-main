# Matriz de auditoria — eloEscola SaaS

Documento de rastreabilidade: cada item da auditoria de segurança/comercialização
com o **estado atual**, **onde está no código** e **como verificar**.

- Versão: **2026-11-11** (Rodadas 32, 33, 35 e 36)
- Suítes: `test-round32-security.mjs` (121 verificações) e
  `test-round33-saas.mjs` (135), `test-round35-admin.mjs` (90) e
  `test-round36-restauracao.mjs` (98) — executam as regras de verdade, não só
  procuram strings.
- Legenda: ✅ resolvido · 🟡 parcial / depende de configuração · ⛔ pendência conhecida

---

## Parte 1 — Vazamento de dados e credenciais

| # | Achado na auditoria | Estado | Onde foi corrigido | Verificação |
|---|---|---|---|---|
| 1.1 | Senhas gravadas em texto puro e exibidas no painel | ✅ | `src/lib/security.ts` (`scrypt$16384$8$1$…`), `AdminPanel.tsx` mostra "protegida por hash" | `round32` §2 |
| 1.2 | Senha padrão `senha123` no seed e nos dados demo | ✅ | `src/db/index.ts` (só via `BOOTSTRAP_ADMIN_PASSWORD`), `src/data/defaultData.ts` | `round32` §2 |
| 1.3 | Chave `service_role` no bundle do frontend | ✅ | só `SUPABASE_PUBLISHABLE_KEY` no cliente; segredo em `src/lib/saasStore.ts` | `round32` §2, `round33` §7 |
| 1.4 | Tabelas `users`/`school_accounts` legíveis por `anon` | ✅ | RLS + policies `users_self_read` / `users_self_update` (migração aplicada) | `round33` §7 |
| 1.5 | Assinaturas de responsáveis em `public/uploads` | ✅ | bucket **privado** `signatures` + URL assinada de 300 s (`src/lib/signatureStorage.ts`) | `round32` §7 |
| 1.6 | Endpoint de assinatura público | ✅ | `GET /api/authorizations/:id/signature` com `requireAuth` + permissão + regex de id | `round32` §7 |
| 1.7 | Rotas de autorização de menores abertas | ✅ | `POST/GET /api/events/:eventId/authorizations`, `/check`, `/api/users/:id/authorizations` fechadas | `round32` §7b |
| 1.8 | Rotas de arquivamento de eventos públicas | ✅ | `archived`, `restore`, `archive-logs`, `cleanup-expired` com `requireAdminOrStaff` | `round32` §7b |
| 1.9 | URL/chave do Supabase trocáveis via `localStorage` | ✅ | removido o override em `src/lib/supabase.ts` | `round32` §1 |
| 1.10 | Telas SaaS declaradas em bloco que nunca renderizava | ✅ | lista da casca em `App.tsx` + `ROTAS_POR_TELA` | `round32` §8b |
| 1.11 | Painel ADM operava tabelas fechadas direto do navegador (falhava em silêncio, "lista vazia") | ✅ | todas as rotas do painel em `server.ts` + serviços chamando a API; diagnóstico em `AdminPanel.tsx` | `round35` |
| 1.12 | Policies públicas de escrita ainda abertas em 9 tabelas | ✅ | `supabase/migrations/20261113_close_open_rls.sql` (aplicada em 2026-11-11); restam só SELECTs de mural/diretório | `round35` |
| 1.13 | Agenda pessoal sem policy de dono | ✅ | `personal_events_owner_select/insert/update/delete` (`owner_id` do JWT) + rotas `/api/personal-events` | `round35` |
| 1.14 | Sem administrador em modo fallback (painel inalcançável) | ✅ | `src/db/fallbackStore.ts` cria/promove com `BOOTSTRAP_ADMIN_*` | `round35` |
| 1.15 | Falha de rede confundida com "sem registros" | ✅ | `isRedeIndisponivel`/`responderIndisponivel` → `503 SAAS_UNREACHABLE` + `hint`; `mensagemDeErroDaApi` no cliente | `round35` |
| 1.16 | `PUT /api/users/:id` gravava senha em **texto claro** | ✅ | `hashPassword()` + `validatePasswordStrength()` + `must_change_password` | `round36` §2 |
| 1.17 | Participações sem checagem de dono (aluno agia por outro trocando a URL) | ✅ | `podeAgirSobreParticipacoes()` — cargo conferido no banco | `round36` §4 |
| 1.18 | Aprovação de sugestão duplicava evento em corrida | ✅ | reivindicação atômica `eq status='pending'` antes de publicar | `round36` §3 |
| 1.19 | Diretório lia `users` do navegador → 1 registro com RLS fechada | ✅ | `fetchUsersDirectFromSupabase` server-first via `/api/users` | `round36` §5 |
| 1.20 | Aba de auditoria inexistente (log gravado, nunca exibido) | ✅ | `GET /api/admin/audit` + aba no `AdminPanel` com mascaramento por cargo | `round36` §1 |
| 1.21 | Sem paginação: `/api/users` devolvia a tabela inteira | ✅ | `?page`/`?pageSize` + busca/filtros no servidor, com compatibilidade | `round36` §6 |
| 1.22 | `schema.ts` sem `must_change_password` (Drizzle descartava a troca obrigatória) | ✅ | 4 colunas sincronizadas com o Postgres | `round36` §7 |
| 1.23 | 2 tabelas usadas em produção sem migration versionada | ✅ | `20261118_profile_change_requests.sql`, `20261119_school_profiles.sql` | `round36` §12 |

## Parte 2 — Autenticação e sessão

| # | Achado | Estado | Onde | Verificação |
|---|---|---|---|---|
| 2.1 | Token montado no navegador (`local-<uid>\|<role>`) | ✅ | `src/middleware/auth.ts` aceita só `elo1.*`, JWT Supabase ou Firebase | `round32` §3 |
| 2.2 | JWT decodificado sem verificar assinatura | ✅ | `verifyProviderJwt` / `verifySessionToken` fail-closed | `round32` §3 |
| 2.3 | Papel vindo do token | ✅ | papel lido de `users` a cada requisição | `round32` §3 |
| 2.4 | Recuperação de senha devolvia token na resposta | ✅ | e-mail/SMS; `/verify-token` devolve só `{valid, email: maskEmail()}` | `round32` §5 |
| 2.5 | Código OTP em texto no banco | ✅ | `sha256(code:email)`, 5 tentativas, validade 10 min | `round32` §5 |
| 2.6 | Sem headers de segurança | ✅ | Helmet + CSP + HSTS + CORS allowlist + rate limits (`src/middleware/security.ts`) | `round32` §6 |
| 2.7 | Sessão sem expiração | ✅ | 12 h, revogável (`auth_sessions`) | `round32` §3 |

## Parte 3 — IA

| # | Achado | Estado | Onde | Verificação |
|---|---|---|---|---|
| 3.1 | `/api/ai/chat` aberto | ✅ | `requireAuth` + `aiLimiter` | `round32` §8 |
| 3.2 | `GEMINI_API_KEY` no cliente | ✅ | só no servidor | `round32` §8 |
| 3.3 | Sem limite de uso | ✅ | cota por instituição + `usage_records`; fallback local não consome | `round32` §8, `round33` §8 |
| 3.4 | Sem verificação de plano | ✅ | `FEATURE_NOT_ENTITLED` antes de chamar o modelo | `round33` §8 |

## Parte 4 a 13 — Núcleo SaaS

| # | Item | Estado | Onde | Verificação |
|---|---|---|---|---|
| 4.1 | Multi-instituição (escolas, unidades, vínculos) | ✅ | `supabase/migrations/20261111_saas_core.sql` | `round33` §1 |
| 4.2 | Catálogo de planos e preços no banco | ✅ | tabelas `plans` / `plan_addons`; frontend sem preço hardcoded | `round33` §2 |
| 4.3 | Assinatura com teste, tolerância e bloqueio | ✅ | `src/lib/subscription.ts` (`TRIAL_DAYS=30`, `GRACE_DAYS=7`, bloqueia só escrita) | `round33` §3 |
| 4.4 | Cotas com aviso em 80% | ✅ | `evaluateQuota` | `round33` §4 |
| 4.5 | Cobrança desacoplada do provedor | ✅ | `src/lib/billing.ts`, modo sandbox explícito | `round33` §6 |
| 4.6 | Webhook idempotente e assinado | ✅ | `POST /api/billing/webhook` (corpo cru + HMAC) | `round33` §6 |
| 4.7 | Isolamento entre instituições | ✅ | `listAdministeredSchools`, `SCHOOL_FORBIDDEN`, `NO_SCHOOL_MEMBERSHIP` | `round33` §7 |
| 4.8 | Entitlements por plano | ✅ | `syncEntitlementsFromPlan` | `round33` §8 |
| 4.9 | Painel Master restrito ao proprietário | ✅ | `requirePlatformOwner` em todas as rotas `/api/master/*` + guarda de tela | `round33` §9 |
| 4.10 | Painel da escola (plano, cotas, finanças) | ✅ | `src/components/SchoolSubscription.tsx` | `round33` §10 |
| 4.11 | Vitrine pública com formulário de lead | ✅ | `src/components/PlansAndPricing.tsx`, link no rodapé e no herói da home | `round33` §10 |
| 4.12 | Parceiros e campanhas com aprovação da escola | ✅ | `/api/school/campaigns/:id/decision`, contato não exposto | `round33` §11 |

## Parte 14 — LGPD

| # | Item | Estado | Onde | Verificação |
|---|---|---|---|---|
| 14.1 | Canal do titular | ✅ | `POST /api/privacy/request` (3/h por e-mail, auditoria) | `round32` §9 |
| 14.2 | Consentimento registrado | ✅ | `recordConsent` → `consent_records` | `round32` §9 |
| 14.3 | Política com versão e contato | ✅ | `PrivacyPolicy.tsx` (`2026-11-11`), `privacidade@eloescola.com.br`, 15 dias | `round32` §9 |
| 14.4 | Fila de atendimento no painel Master | ✅ | `GET /api/master/privacy-requests`, `PUT /:id` | `round33` §9 |
| 14.5 | Dados de alunos não são vendidos | ✅ | nenhuma rota de comercialização; política declara | `round33` §11 |

## Pendências conhecidas (não bloqueiam uso, bloqueiam "pronto para venda")

| # | Pendência | Impacto | Próximo passo |
|---|---|---|---|
| ⛔ 1 | `test-round25-integration.mjs` exige rede para `*.supabase.co` | não roda no sandbox | executar em ambiente com rede |
| ⛔ 2 | Envio real de e-mail/SMS depende de `RESEND_API_KEY` / `TWILIO_*` | recuperação de senha fica `deliveryPending` | configurar antes de liberar usuários |
| ⛔ 3 | Cobrança real depende de `STRIPE_SECRET_KEY`; Asaas/Mercado Pago só têm as variáveis | sem provedor, tudo é sandbox | escolher o provedor e implementar o adaptador |
| ⛔ 4 | Política de privacidade precisa de revisão jurídica | texto é técnico, derivado do código | revisão por advogado |
| ⛔ 5 | Contrato de tratamento de dados (DPA) com as escolas | exigência LGPD para operador | modelo jurídico |
| ⛔ 6 | Verificação de assinatura de webhook por provedor | hoje o HMAC genérico é validado; Asaas/MP não implementados | junto com o item 3 |
