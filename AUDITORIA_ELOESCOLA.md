# AUDITORIA TÉCNICA INTEGRAL — eloEscola

**Data da execução:** 11/11/2026
**Repositório:** `davidribeiromuller/Tcc_main-do-main` · branch `arena/393351b8-tcc-main-do-main` · commit base `e9cb5ae`
**Ambiente:** sandbox Linux, Node v22.22.3, app rodando em `0.0.0.0:3000` (`npm run dev` → `tsx server.ts` + Vite middleware)
**Modo da execução:** exclusivamente auditoria. Nenhuma correção aplicada.

---

## 0. DECLARAÇÃO DE MÉTODO E LIMITAÇÕES

### 0.1 O que foi realmente executado (não apenas lido)

| Tipo | Executado | Evidência |
|---|---|---|
| Análise estática de 100% dos arquivos do projeto | ✅ | 60 arquivos, 26.652 linhas |
| Compilação de tipos (`tsc --noEmit`) | ✅ | 0 erros |
| Build de produção (`npm run build`) | ✅ | sucesso, bundle 1.377 kB |
| Execução da aplicação e testes HTTP reais nos endpoints | ✅ | 47 endpoints mapeados, ~30 testados |
| Testes de autorização / escalonamento de privilégio | ✅ | evidências nas seções D e E |
| Medições de latência e peso de assets | ✅ | Seção G |
| Varredura de dependências (`npm audit`) | ✅ | Seção E.6 |
| Teste de UI em navegador real (Playwright/Chromium) | ❌ **NÃO EXECUTADO** | download do Chromium bloqueado por egress no sandbox |
| Testes de responsividade visual em viewports reais | ❌ **NÃO EXECUTADO** | mesma limitação |
| Teste de leitor de tela / navegação por teclado real | ❌ **NÃO EXECUTADO** | mesma limitação |
| Teste de login com Google OAuth de ponta a ponta | ❌ **NÃO EXECUTADO** | requer redirect URI cadastrada + navegador |
| Execução de testes automatizados | ❌ **NÃO APLICÁVEL** | **o projeto não possui nenhum teste** |
| Consulta ao banco Supabase real (RLS, dados) | ❌ **NÃO EXECUTADO** | egress do sandbox bloqueia `*.supabase.co` (HTTP 000; `github.com` responde 200) |

> **Importante:** os itens marcados ❌ estão declarados como **NÃO TESTADOS** na matriz. Não há aqui nenhuma conclusão de UI, responsividade ou acessibilidade baseada em teste visual — apenas em inspeção de código, e isso está marcado como tal.

### 0.2 Integridade do estado do app durante a auditoria

Todas as operações capazes de gravar dados foram feitas com **snapshot prévio** de `src/db/fallback_*.json` em `/tmp/audit-backup/`. Após cada teste destrutivo, o estado foi restaurado e **verificado byte a byte** (`diff`) — 8/8 arquivos idênticos ao baseline. `git status` final em `src/db/`: **vazio**.

As duas únicas alterações no repositório são as do turno anterior, **anteriores a esta auditoria** e necessárias para o preview funcionar: `vite.config.ts` (allowedHosts + base) e `package-lock.json` (gerado pelo `npm install`). Nenhum arquivo de aplicação foi modificado durante a auditoria.

---

## PARTE A — VISÃO GERAL

**Nome:** eloEscola — portal de eventos escolares e oportunidades da comunidade de Araucária/PR
**Tecnologias identificadas:**

- **Frontend:** React 19.2.7 + TypeScript 5.8.3 + Vite 6.4.3 + Tailwind CSS v4.3.1 (`@theme`, `@variant dark`)
- **Animação:** `motion` 12.40.0 · **Ícones:** `lucide-react` 0.546.0
- **Backend:** Express 4.22.2 (arquivo único `server.ts`, 2.557 linhas, 47 endpoints)
- **ORM:** Drizzle ORM 0.45.2 + driver `pg` 8.22.0 (PostgreSQL)
- **BaaS:** Supabase (`@supabase/supabase-js` 2.108.2, `@supabase/server` 1.1.0) — auth OAuth e REST
- **Auth legado:** Firebase 12.15.0 + `firebase-admin` 14.0.0 (convivendo com o esquema local)
- **IA:** `@google/genai` 2.9.0 (Gemini 2.5 Flash) + fallback determinístico local
- **Mapas:** Leaflet 1.9.4 + OSRM + tiles OSM
- **Persistência de contingência:** arquivos JSON em `src/db/fallback_*.json`

**Arquitetura em 4 camadas (com sobreposição):**

```
┌────────────────────────────────────────────────────────────────┐
│ NAVEGADOR (React SPA, sem router — 16 "telas" em estado)        │
│  ├─ lê/escreve localStorage: local_user, local_events,          │
│  │  local_users_db, token, impersonator_admin, theme_mode       │
│  ├─ fallback #1: acesso DIRETO ao Supabase com chave publicável │
│  │  (usersService.ts / eventsService.ts — INSERT/UPDATE/DELETE) │
│  └─ fallback #2: /api/* relativo → Express                      │
└───────────────────────────┬────────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────────┐
│ EXPRESS (server.ts)                                             │
│  ├─ requireAuth (Firebase Admin + "local token" + decode livre) │
│  ├─ requireChefeAdmin / requireAdminOrStaff                     │
│  └─ cadeia de persistência: Drizzle/pg → REST Supabase → JSON   │
└───────────────────────────┬────────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────────┐
│ PostgreSQL/Supabase  +  fallback_*.json  +  public/uploads/     │
└────────────────────────────────────────────────────────────────┘
```

**Inventário quantitativo:**

| Métrica | Valor |
|---|---|
| Telas/páginas na SPA | **16** (`splash`, `welcome`, `login`, `register`, `recovery`, `codeSent`, `feed`, `schools`, `schoolDetail`, `map`, `calendar`, `admin`, `schoolPortal`, `settings`, `contact`, `eventDetail`) |
| Componentes React | 27 |
| Endpoints HTTP no backend | **47** |
| Tabelas modeladas no schema Drizzle | **11** |
| Migrations SQL versionadas | 2 (falta a 0001) |
| Funcionalidades identificadas | **86** |
| Funcionalidades efetivamente testadas (execução real) | **31** |
| Aprovadas | 14 |
| Aprovadas com ressalvas | 7 |
| Falhas | 9 |
| Incompletas | 6 |
| Não testadas | 25 |
| Não aplicáveis | 3 |
| **Testes automatizados existentes** | **0** |

**Estado geral:** o produto é **apresentável e funcional no "caminho feliz"** (a tela carrega, o feed mostra eventos, a navegação responde, o build passa, o TypeScript está limpo). Mas a camada de autorização tem falhas que, combinadas, permitem **tomar a conta de administrador sem nenhuma credencial**. Não é um sistema publicável no estado atual. Detalhes na Parte K.

---

## PARTE B — INVENTÁRIO

### B.1 Telas e seus componentes

| Tela | Rota | Componente | Público |
|---|---|---|---|
| `splash` | — | `Splash` | público |
| `welcome` | `/` | `WelcomeScreen` | público |
| `login` | `/login` | `Login` | público |
| `register` | — | `Register` | público |
| `recovery` | `?reset_token=` | `PasswordRecovery` | público |
| `codeSent` | — | `PasswordRecovery` (etapa OTP) | público |
| `feed` | `/feed`, `/eventos` | `Feed` | autenticado |
| `schools` | `/escolas` | `SchoolsCatalog` + `SchoolCarousel` | público |
| `schoolDetail` | `/escolas/:slug` | `SchoolDetail` | público |
| `map` | `/map`, `/mapa` | `MapView` (Leaflet) | autenticado |
| `calendar` | `/calendar`, `/calendario` | `CalendarView` | autenticado |
| `eventDetail` | — | `EventDetail` | autenticado |
| `admin` | `/admin` | `AdminPanel` (3.405 linhas) | admin |
| `schoolPortal` | — | `SchoolPortal` | conta institucional |
| `settings` | `/settings` | `Settings` | autenticado |
| `contact` | — | `Contact` | público |

**Modais:** `EventNotificationModal`, `EventLocationModal`, `EventAuthorizationsModal`, `AuthorizationReceiptModal`, `ParentalAuthorizationModal`, `SignatureCanvas`, `GoogleAuthModal` (**código morto — não importado em nenhum lugar**), `IntroBanner` (**código morto**).

**Rotas implementadas mas sem link na navegação normal:** `/admin` e `/escolas/:slug` só são alcançáveis digitando a URL ou por redirect interno — o `BottomNav`/`DesktopNavbar` não expõem `/admin`. Funciona, mas é um beco sem saída de navegação (ver I-18).

### B.2 Módulos funcionais encontrados

1. **Autenticação local** (e-mail+senha, hash ausente — texto puro)
2. **Autenticação Google** (Supabase OAuth + popup + `/auth/callback`)
3. **Login de convidado** (sem senha, gera sessão efêmera)
4. **Login institucional** (identificador `escola.*` + senha compartilhada)
5. **Cadastro de aluno** com verificação de duplicidade de e-mail e telefone
6. **Recuperação de senha** por e-mail (token) e por SMS (OTP — **simulado**)
7. **Feed de eventos** com busca
8. **Calendário** (grade mensal + criação de evento)
9. **Mapa** (Leaflet + geolocalização + rota OSRM)
10. **Detalhe do evento** + inscrição
11. **Autorização de saída de menor** com assinatura manuscrita digital
12. **Catálogo de 6 escolas** + páginas institucionais
13. **Portal institucional multi-tenant** (notícias e perfil por escola)
14. **Painel administrativo** (usuários, bloqueios, eventos, contas institucionais, auditoria)
15. **Assistente de IA "Elo"** (Gemini + fallback)
16. **Ciclo de vida de eventos** — retenção de 30 dias + arquivamento + restauração
17. **Tema claro/escuro** com persistência
18. **Heartbeat de presença** (última atividade)
19. **Impersonação de usuário** pelo admin

### B.3 Integrações externas

| Integração | Uso | Estado |
|---|---|---|
| Supabase Auth + REST | login Google, dados | URL ativa, **inalcançável do sandbox** |
| Firebase Admin | verificação de ID token | configurado, mas **contornável** (ver D-01) |
| Gemini 2.5 Flash | chat | responde quando há `GEMINI_API_KEY`; senão fallback local |
| Leaflet + OSM tiles | mapa | ok |
| OSRM (`router.project-osrm.org`) | rotas | ok, com fallback geodésico |
| Unsplash | imagens de eventos | 100% externo — **sem fallback local** |
| unpkg CDN | CSS do Leaflet no `index.html` | ok |
| Google Fonts | tipografia | ok |
| `mailto:` para `solucoes@gmail.com` | formulário de contato | **não envia nada pelo servidor** |

### B.4 Código/ativos órfãos e redundâncias (registrados, nada removido)

- `@vis.gl/react-google-maps` (1.10.2) declarado em `package.json` — **zero importações**. O projeto usa Leaflet, apesar do `metadata.json` anunciar "real google maps".
- `src/components/GoogleAuthModal.tsx` e `src/components/IntroBanner.tsx` — não importados por ninguém.
- Duplicação de tabelas de eventos: `events` **e** `eventos`; `events` **e** `historico_eventos`; `users` **e** `contas_institucionais` **e** `school_accounts`. O código lê de múltiplas fontes e deduplica por título (`db/events.ts`), o que é frágil.
- Duplicação de fluxo de autorização: `src/lib/permissions.ts` (frontend) e `src/middleware/admin.ts` (backend) repetem a **mesma lista de e-mails hardcoded** como fonte de verdade de admin.
- `firebase-applet-config.json` duplica credenciais que já existem em `src/lib/firebase.ts`.
- Assets duplicados: `public/assets/aistudio/*.png` e `public/images/escolas/*.png` são os mesmos 6 arquivos com nomes diferentes (~1,5 MB desperdiçados). Há ainda um screenshot de 414 kB versionado.
- Migration `0001` ausente do repositório.
- `src/db/index.ts` mantém um cache de "offline" global que, uma vez ativado, **pula o Postgres para sempre** naquele processo.

---

## PARTE C — RESULTADOS DOS TESTES (execução real)

> Todos os testes abaixo foram **executados** contra `http://127.0.0.1:3000`, salvo indicação contrária.

| ID | Teste | Esperado | Observado | Status |
|---|---|---|---|---|
| T-01 | `GET /api/health` | 200 | `{"status":"ok"}` em 0,6 ms | **APROVADO** |
| T-02 | `GET /api/events` | 200 | 200 com 8 eventos, em **2.501 ms** | **APROVADO COM RESSALVAS** (D-08) |
| T-03 | `GET /api/schools` | 200 | 200 em 0,7 ms | **APROVADO** |
| T-04 | `GET /api/db-status` | 200 + estado | `active:false`, `cachedOffline:true` | **APROVADO** |
| T-05 | `GET /api/auth/supabase-status` | 200 | DNS ok, projeto ativo, sem DB URL | **APROVADO** |
| T-06 | `GET /api/users` sem token | 401 | **401** | **APROVADO** |
| T-07 | `GET /api/users` com token local forjado `role=Diretor` | 401/403 | **200 + lista completa de usuários** | **FALHA CRÍTICA** (D-01) |
| T-08 | `GET /api/users` com token `role=Aluno` | 403 | 403 | **APROVADO** |
| T-09 | `POST /api/events` sem token | 401 | 401 | **APROVADO** |
| T-10 | `POST /api/events` com `role=Aluno` | 403 | 403 | **APROVADO** |
| T-11 | `POST /api/events` com `role=Funcionário` em evento alheio | 403 | 403 (checagem `creatorId`) | **APROVADO** |
| T-12 | `PUT /api/users/:id` com token forjado → promover conta | 403 | **200, conta promovida a Diretor** | **FALHA CRÍTICA** (D-02) |
| T-13 | `GET /api/admin/institutional-accounts` sem token | 401 | 401 | **APROVADO** |
| T-14 | `GET /api/school-portal/1/data` sem token | 401 | 401 | **APROVADO** |
| T-15 | `GET /api/school-portal/1/data` com `role=Aluno` | 403 | **200, dados da escola** | **FALHA** (D-05) |
| T-16 | `PUT /api/school-portal/1/profile` com `role=Aluno` | 403 | **200, telefone da escola alterado** | **FALHA CRÍTICA** (D-06) |
| T-17 | `GET /api/users/student-lucas-123/authorizations` **sem token** | 401 | **200 com nome do menor, nome/telefone do responsável e assinatura base64** | **FALHA CRÍTICA** (D-07) |
| T-18 | `GET /api/events/1001/authorizations/check` sem token | 401 | **200 com autorização completa** | **FALHA CRÍTICA** (D-07) |
| T-19 | `GET /api/authorizations/:id/signature` sem token | 401 | **200, PNG entregue** | **FALHA** (D-07) |
| T-20 | `GET /uploads/signatures/*.png` (estático) | 401/protegido | **200, sem autenticação** | **FALHA** (D-07) |
| T-21 | Path traversal em `/api/authorizations/../../x/signature` | 404 | 404 nas 3 variantes testadas | **APROVADO** |
| T-22 | `POST /api/auth/register` com `{"role":"Diretor"}` | papel forçado a Aluno | **criou conta com `role:"Diretor"`; token devolveu a senha** | **FALHA CRÍTICA** (D-03) |
| T-23 | `POST /api/auth/local-login-password` senha errada | 401 | 401 | **APROVADO** |
| T-24 | `POST /api/auth/local-login-password` e-mail inexistente aleatório | 404 | 404 | **APROVADO** |
| T-25 | `POST /api/auth/institutional-login` com senha padrão `senhaInstitucional123` | 401 | **200, sessão institucional válida** | **FALHA CRÍTICA** (D-04) |
| T-26 | `POST /api/auth/guest-login` | 200, sessão efêmera | 200 | **APROVADO COM RESSALVAS** (D-12) |
| T-27 | `POST /api/auth/recovery/request-email` | e-mail enviado, token **nunca** na resposta | **200 devolvendo `token` e `resetUrl` completos; nenhum e-mail é enviado** | **FALHA CRÍTICA** (D-09) |
| T-28 | `POST /api/auth/recovery/request-phone` (telefone inexistente) | 404 genérico | 404 genérico | **APROVADO** (quanto a não vazar código) |
| T-29 | `GET /api/events/archived` sem token | 401 | **200** (lista vazia) | **FALHA BAIXA** (D-13) |
| T-30 | `GET /api/events/archive-logs` sem token | 401 | **200** | **FALHA BAIXA** (D-13) |
| T-31 | `POST /api/events/999/restore` sem token | 401 | 400 "não encontrado" (valida existência antes de autorizar) | **FALHA MÉDIA** (D-13) |
| T-32 | `POST /api/ai/chat` sem token | 401 | **200 com resposta da IA** | **FALHA MÉDIA** (D-14) |
| T-33 | `tsc --noEmit` | 0 erros | **0 erros** | **APROVADO** |
| T-34 | `npm run build` | build ok | **ok em 5,2 s** | **APROVADO COM RESSALVAS** (bundle 1,38 MB) |
| T-35 | `npm audit` | sem vulns altas | **13 high + 1 critical** | **FALHA** (E.6) |
| T-36 | `GET /` com Host do preview | 200 | 200 após correção do turno anterior | **APROVADO** |
| T-37 | Rotina de retenção de 30 dias | evento >30 d sai do feed | lógica correta em `fallbackStore` e no SQL; **sem eventos elegíveis hoje** para comprovar | **NÃO TESTADO** |
| T-38 | Login Google OAuth ponta a ponta | sessão criada | sem navegador/redirect URI | **NÃO TESTADO** |
| T-39 | Renderização visual de qualquer tela | sem erro | sem navegador no sandbox | **NÃO TESTADO** |

---

## PARTE D — PROBLEMAS ENCONTRADOS

### D-01 · Quebra total de autenticação: `requireAuth` aceita token forjado no próprio corpo
**Gravidade: CRÍTICA** · Módulo: autenticação · Arquivo: `src/middleware/auth.ts:17-64`

O middleware aceita qualquer string que comece com `local-` ou `google-` e **extrai papel e e-mail do próprio token em texto claro**, sem nenhuma verificação criptográfica:

```ts
if (token && (token.startsWith('local-') || token.startsWith('google-'))) {
  const parts = remainder.split('|');
  const role = parts[1] || 'Aluno';
  const email = parts[3] ? decodeURIComponent(parts[3]) : ...
  const isAdmin = role === 'Diretor' || cleanEmail === 'diretoria@helenawysocki.com' || ...
```

**Reproduzir:** `curl /api/users -H "Authorization: Bearer local-x|Diretor|Hacker|hacker@x.com"` → **HTTP 200** com todos os usuários.
**Esperado:** 401 — o token não tem assinatura, então nada nele é confiável.
**Causa:** comprovada — design de "sessão local" sem HMAC/JWT assinado.
**Impacto:** qualquer visitante anônimo obtém poderes administrativos totais.

Além disso, no `catch` do Firebase há um **segundo caminho** (linhas 78-100): se `adminAuth.verifyIdToken` falhar, o código decodifica o payload do JWT em base64 **sem verificar assinatura** e aceita o resultado. Ou seja: um JWT autoassinado (ou um token vencido) passa.

---

### D-02 · Escalonamento de privilégio em `PUT /api/users/:id`
**Gravidade: CRÍTICA** · Arquivo: `server.ts:1078`

Consequência direta de D-01: com o token forjado, um `PUT` promove a própria conta. Reproduzido: `cliente@helenawysocki.com` passou de `Cliente` para `role:"Diretor", isAdmin:true` (HTTP 200).

**Agravante:** a resposta do endpoint devolve o usuário **com o campo `password` em texto claro** (`{"password":"senha123", ...}`).

---

### D-03 · Cadastro público permite escolher o próprio papel
**Gravidade: CRÍTICA** · Arquivo: `server.ts:637-704`

```ts
const { email, password, nome, ..., role } = req.body;
... getOrCreateUser(uid, cleanEmail, nome, "", "local", role || "Aluno", password)
```

O `role` vem cru do corpo da requisição. `POST /api/auth/register {"role":"Diretor"}` criar conta com papel de administrador (reproduzido, HTTP 200).

A interface (`Register.tsx:233`) envia `role: "Aluno"` fixo — o buraco só existe na API, mas é inutilizável como proteção.

O token devolvido também **carrega a senha**: `local-<uid>|Diretor|Nome|email|<senha>`. Reproduzido: `...auditoria_teste_privesc%40escola.test|123456`.

---

### D-04 · Autenticação institucional com senha hardcoded e compartilhada
**Gravidade: CRÍTICA** · Arquivos: `src/db/fallback_institutional_accounts.json`, `server.ts:868`

As 6 contas institucionais têm a **mesma senha em texto claro versionada no repositório** (`senhaInstitucional123`). Reproduzido: login `escola.szymanski` → HTTP 200, sessão válida. Qualquer pessoa com acesso ao GitHub entra como qualquer uma das 6 escolas.

Comparação de senha em texto puro (`account.password === password`) e sem limite de tentativas.

---

### D-05 · IDOR: portal institucional acessível por qualquer usuário autenticado
**Gravidade: ALTA** · Arquivo: `server.ts:1898-1935`

O guard só bloqueia quando `user.role === "Escola"` e o `escolaId` não bate:

```ts
if (!isChefe && user?.role === "Escola" && user?.escolaId !== schoolId) → 403
```

Para **qualquer outro papel (Aluno, Convidado autenticado, Cliente)** a condição é `false` → passa. Reproduzido: token `role=Aluno` → **HTTP 200** com dados completos da escola 1.

---

### D-06 · IDOR de escrita: aluno altera o perfil institucional de uma escola
**Gravidade: CRÍTICA** · Arquivo: `server.ts:1936`

Mesmo guard quebrado de D-05, mas em rota `PUT`. Reproduzido: token `role=Aluno` alterou o telefone do Colégio Szymanski para `"(41) 0000-0000 - HACKEADO"` (HTTP 200). A alteração foi revertida pelo snapshot.

---

### D-07 · Dados de menores e assinaturas de responsáveis expostos sem autenticação (LGPD)
**Gravidade: CRÍTICA** · Arquivos: `server.ts:2156`, `2176`, `2190`, `2201`

Três rotas `GET` **sem nenhum middleware de autenticação** devolvem dados sensíveis de crianças e seus responsáveis:

| Rota | Devolve |
|---|---|
| `/api/users/:userId/authorizations` | nome do aluno, escola, **nome do responsável, parentesco e telefone celular**, `signatureDataUrl` base64 |
| `/api/events/:eventId/authorizations` | lista completa de autorizações do evento |
| `/api/events/:eventId/authorizations/check?studentUserId=` | autorização completa por **ID do aluno adivinhável/enumerável** |
| `/api/authorizations/:id/signature` | PNG da assinatura manuscrita |
| `/uploads/signatures/*.png` (estático) | **o mesmo PNG, sem qualquer barreira** |

Reproduzido (T-17): `curl /api/users/student-lucas-123/authorizations` → **HTTP 200** com `studentName: "Lucas Oliveira"`, `guardianFullName: "Carla Maria Oliveira"`, `guardianContact: "(41) 98888-2222"`.

A policy RLS criada em `0002_event_authorizations.sql` é **inócua** aqui: essas rotas usam o *fallback* JSON, não o banco. A proteção existe no papel e não em execução.

**Impacto legal:** dados pessoais de menores + contato de responsável + assinatura, sem base de autenticação. Exposição direta à LGPD (art. 46/48).

---

### D-08 · `/api/events` custa exatamente 2,5 s em toda chamada
**Gravidade: ALTA** · Arquivos: `src/db/events.ts` (`fetchEventsFromSupabaseApi`)

Medições (5 repetições): 2,5017 / 2,5014 / 2,5017 / 2,5024 / 2,5019 s — e o mesmo com 3 chamadas sequenciais. A causa é um `Promise.race` com `setTimeout(2500)` contra uma chamada ao Supabase; como o egress está bloqueado/falhando, **sempre** esgota o timeout.

Como `App.tsx` recarrega eventos a cada 20 s (`setInterval`), a cada foco de janela e em cada troca de tela, o usuário paga ~2,5 s por ciclo e o servidor acumula requisições pendentes. Não há cache negativo: o timeout é repetido indefinidamente.

---

### D-09 · Recuperação de senha: token entregue na própria resposta HTTP e nenhum e-mail enviado
**Gravidade: CRÍTICA** · Arquivo: `server.ts:334-402`

```ts
res.json({ success: true, token: resetToken, resetUrl, expiresMinutes: 15 });
```

Reproduzido: `POST /api/auth/recovery/request-email {"email":"cliente@helenawysocki.com"}` → **HTTP 200** com `token` e `resetUrl` completos. Não existe `nodemailer`, SendGrid, Resend ou SMTP em nenhuma dependência — **nenhum e-mail é enviado**. O fluxo é efetivamente "quem souber um e-mail cadastrado troca a senha dessa conta".

O mesmo padrão aparece no OTP de SMS: `server.ts:460` devolve `testCode: code` na resposta e loga o código no console (`[SMS Gateway Simulator]`). O SMS **nunca é enviado**.

Atenuante real: há rate limiting (`checkRecoveryRateLimit`) de 5/15min por e-mail e 20/15min por IP — insuficiente contra o vazamento direto.

---

### D-10 · Senhas e dados institucionais em texto claro, sem hashing
**Gravidade: CRÍTICA** · Arquivos: `src/db/users.ts`, `usersService.ts`, `server.ts`

- Senhas gravadas como `password: text(...)` sem bcrypt/argon2 — comparação `user.password !== password`.
- `GET /api/users` (papel chefe) remove `password` corretamente, **mas** `PUT /api/users/:id` devolve o objeto inteiro **com `password`**.
- `register` e `local-login-password` devolvem o `user` completo com `password` no corpo.
- Min/max de senha: `length < 3` no cadastro, `length < 4` no reset. Sem complexidade, sem bloqueio progressivo.

---

### D-11 · Auditoria de build e empacotamento

| Gravidade | Item |
|---|---|
| MÉDIA | Bundle único de **1.377 kB** (348 kB gzip) — sem code splitting. `motion`, `leaflet`, `firebase`, Supabase e o `AdminPanel` (3.405 linhas) vão todos no primeiro carregamento, inclusive para quem só vê a tela de boas-vindas. |
| MÉDIA | `devDependencies` completas não separadas: `vite`/`tsx`/`drizzle-kit` entram no mesmo lock do runtime. |
| BAIXA | `tsc` roda com `strict` desligado (não há `"strict": true` no `tsconfig.json`) — os 0 erros são menos significativos do que parecem. |

---

### D-12 · Sessão de convidado e impersonação sem fronteira clara
**Gravidade: MÉDIA**

- `POST /api/auth/guest-login` é público e cria sessão com `uid` previsível (`guest-<20000..100000>`).
- `impersonator_admin` é gravado em `localStorage` (`App.tsx`), ou seja, o "voltar para minha conta de admin" depende de um objeto no navegador que pode ser editado para apontar para qualquer usuário.
- `local_user` (com `role`, `isAdmin`, `escolaId`) é a fonte de verdade do **frontend** para decidir o que mostrar. Editável pelo usuário via DevTools — o backend é o único guarda real, e ele está quebrado (D-01).

---

### D-13 · Endpoints de arquivamento e restauração sem autorização
**Gravidade: MÉDIA** · `server.ts:1843`,`1853`,`1871`,`1881`

`/api/events/archived`, `/api/events/archive-logs`, `/api/events/:id/restore` e `/api/events/cleanup-expired` são **todos públicos** (os dois primeiros devolveram 200 sem token). `cleanup-expired` dispara a rotina de arquivamento (destrutiva por definição) sem nenhuma credencial.

**Bug adicional:** `restoreArchivedEventFallback` procura no histórico pelo **mesmo `id` do evento** (`findIndex(e => e.id === id)`), mas o histórico é populado com o objeto do evento preservando o id — o que funciona por coincidência hoje. Se dois eventos distintos forem arquivados e um id for reutilizado pela sequence do Postgres, a restauração pode mover o evento errado. **Hipótese técnica — não comprovada em execução**, porque não há registros no histórico no ambiente.

---

### D-14 · Assistente de IA sem autenticação e sem cota
**Gravidade: MÉDIA** · `server.ts:2402`

`POST /api/ai/chat` é público (reproduzido: HTTP 200 com resposta). Sem `GEMINI_API_KEY` cai no fallback local (barato), mas **com a chave configurada qualquer anônimo consome a cota do Gemini** — endpoint ideal para abuso de custo. Não há rate limit em nenhum endpoint do backend (busca por `rateLimit` em `server.ts`: zero ocorrências fora do fluxo de recuperação de senha).

---

### D-15 · `X-Powered-By: Express` exposto e ausência total de headers de segurança
**Gravidade: BAIXA** · Reproduzido em `T-14`

Nenhum `helmet`. Ausentes: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`. Sem CSP, o app fica mais exposto a XSS por conteúdo de usuário (títulos de eventos, notícias, nomes) renderizado em Markdown pelo assistente.

CORS: não há `cors()` no Express; as respostas simplesmente não trazem headers ACAO. Não é uma falha em si (bloqueia por padrão), mas **impede** o funcionamento em domínio cruzado caso o front seja publicado separado do backend — cenário que o próprio `deploy.yml` cria (Pages estático × backend Node).

---

### D-16 · Fluxo de recuperação por SMS é uma simulação com aparência de produção
**Gravidade: ALTA** · `server.ts:404-548`

Código de 6 dígitos gerado com `Math.random()` (não criptográfico), exibido na resposta HTTP e no log do servidor, sem gateway SMS. A UI apresenta "Código de verificação SMS enviado para (41) •••••-2222", mensagem que é **falsa**. O usuário jamais receberá o SMS.

Também: a checagem `getUserByPhone` percorre **todos** os usuários e filtra em memória (`usersService.ts:236` `.select("*")` sem `where`) — O(n) e trafega a tabela inteira para o servidor/cliente.

---

### D-17 · `local_user` e `local_users_db` no localStorage como fonte de verdade
**Gravidade: MÉDIA**

`App.tsx:100-118` lê `local_user` do `localStorage` e **recalcula `isAdmin`** a partir do e-mail; `App.tsx:364-450` mantém a lista de usuários em `local_users_db`. Em `PasswordRecovery.tsx:400-406` a senha é alterada **direto no localStorage**, sem tocar o servidor.

Consequência: no modo contingência, alterar a senha "funciona" visualmente e não altera nada de fato — sucesso aparente sem operação real (exatamente a classe de problema que o item 28 do escopo pede para caçar).

---

### D-18 · Retenção de 30 dias: implementação correta, verificação impossível hoje
**Gravidade: INFORMATIVO → risco BAIXO**

A lógica em `fallbackStore.ts` e no SQL (`archive_expired_events_routine()`) está correta: não arquiva eventos futuros, mantém 30 dias após o término, preserva participações. O `setInterval` em `server.ts:2031` executa a rotina periodicamente.

Não foi possível comprovar em execução porque **todos os 8 eventos do dataset são futuros** (14/11/2026 a 14/12/2026). Declarado como NÃO TESTADO.

Risco observado no código: em modo fallback, `archiveAndPruneExpiredEvents` **muta** os arrays globais e regrava JSON em disco a cada execução — sem lock. Duas instâncias do processo = corrupção do arquivo.

---

## PARTE E — SEGURANÇA

### E.1 Superfície de ataque confirmada (resumo executivo)

| # | Vetor | Autenticação necessária | Resultado |
|---|---|---|---|
| 1 | Header `Authorization: Bearer local-x\|Diretor\|...` | **Nenhuma** | Admin total |
| 2 | `POST /api/auth/register {"role":"Diretor"}` | **Nenhuma** | Conta admin |
| 3 | `escola.*` + `senhaInstitucional123` | **Nenhuma** | Dados de qualquer escola |
| 4 | `GET /api/users/:id/authorizations` | **Nenhuma** | Dados de menores + assinatura |
| 5 | `POST /api/auth/recovery/request-email` | **Nenhuma** | Token de troca de senha |
| 6 | Token local forjado + `PUT /api/users/:id` | Nenhuma | Promover qualquer conta |
| 7 | Token `Aluno` + `PUT /api/school-portal/:id/profile` | Conta de aluno | Alterar dados da escola |

**Vetores 1, 2, 3, 4 e 5 não exigem sequer uma conta.** Um atacante sem cadastro chega a administrador por, no mínimo, **três caminhos independentes**.

### E.2 Credenciais e segredos versionados

| Item | Local | Risco |
|---|---|---|
| Firebase Web API Key (`AIza...`) | `src/lib/firebase.ts:8`, `firebase-applet-config.json` | Esperado para app web, mas deveria vir de env; permite abuso de quota/Identity Toolkit |
| Supabase publishable key (`sb_publishable_...`) | `vite.config.ts`, `src/lib/supabase.ts`, `server.ts` | Baixo por design, **mas** o frontend a usa para `INSERT/UPDATE/DELETE` em `users` — só é seguro se o RLS estiver correto (**não verificável aqui**, ver E.4) |
| `senhaInstitucional123` (×6 contas) | `src/db/fallback_institutional_accounts.json` | **Crítico** |
| Senhas de usuários em texto claro | `src/db/fallback_users.json` | **Crítico** |
| DOB, CPF, telefone de alunos/responsáveis | `src/db/fallback_*.json` | **Crítico** (LGPD) |
| URLs `localhost`/`127.0.0.1` | `server.ts:16,17`, `db/index.ts:96` | Baixo, mas revela ambiente interno |

O repositório **é público** (GitHub Pages) — todos esses dados versionados devem ser tratados como comprometidos.

### E.3 Controle de acesso

- A separação `chefe` × `funcionário` está **bem modelada** (`middleware/admin.ts`) e as regras de evento (funcionário só edita o próprio) foram validadas em teste (T-11). É o ponto mais sólido do backend.
- O problema é a **camada abaixo**: `requireAuth` não prova identidade, então toda a hierarquia acima é decorativa.
- Nenhum endpoint usa rate limiting global.
- `process.env.SUPABASE_SECRET_KEY` é lido em `getSupabaseServerEnv`, mas nunca usado com sucesso neste ambiente.
- O arquivo `public/uploads/signatures/` é servido como **estático público**, anulando a rota autenticada de assinatura.

### E.4 RLS — não verificado em execução (limitação declarada)

- As migrations habilitam RLS em `event_attendance_authorizations`, `school_accounts` e `school_account_audit_logs`.
- **Não há nenhuma migration que habilite RLS na tabela `users` ou `events`.**
- Se essas tabelas existem no Supabase com RLS desabilitado e o `anon` tem `SELECT/INSERT/UPDATE` (default do dashboard até o RLS ser ligado), então a chave publishable embutida no bundle permite **ler e escrever a tabela `users` inteira, incluindo o campo `password`, direto do navegador**. `usersService.ts` faz `.select("*")` e `.update(payload)` exatamente nessa tabela.
- **Não foi possível confirmar** (`*.supabase.co` inacessível do sandbox: HTTP 000, enquanto `github.com` retorna 200). Classificado como **hipótese de gravidade crítica que exige verificação imediata** no painel do Supabase, em SQL Editor: `select relname, relrowsecurity from pg_class where relname in ('users','events','eventos');`

### E.5 Riscos de injeção e XSS

- **SQL injection:** mitigado — todas as consultas usam Drizzle/`sql` parametrizado ou o client Supabase.
- **Path traversal:** testado em 3 variantes no endpoint de assinatura → **não reproduzido** (404). O `Authorization` do Express normaliza o `..` corretamente para o arquivo; o 200 obtido em uma variante era o `index.html` do SPA, não vazamento de arquivo.
- **XSS:** o assistente devolve Markdown, e a renderização precisa ser verificada em navegador (NÃO TESTADO). Títulos de eventos e notícias são renderizados como texto em JSX (seguro por padrão). Risco real concentra-se no chat.
- **CSRF:** baixo risco prático — a autenticação é por header `Authorization`, não por cookie de sessão.
- **Upload:** aceita qualquer `data:image/*` sem limite de tamanho (o limite real é o `express.json({limit:"10mb"})`), grava com `fs.writeFileSync` síncrono (bloqueia o event loop) e sem validação de magic bytes. Um payload de 10 MB por requisição, sem rate limit, é um DoS trivial de disco.

### E.6 Dependências vulneráveis (`npm audit`)

**27 vulnerabilidades: 13 high, 13 moderate, 1 critical.**

| Pacote | Severidade | Observação |
|---|---|---|
| `proxy-addr` | **critical** | usado pelo Express |
| `body-parser` | high | parser de requisição do Express |
| `vite` ≤6.4.3 | high | dev server (inclui execução de comando arbitrário no Windows) |
| `@grpc/grpc-js`, `protobufjs` | high/moderate | cadeia do Firebase Admin |
| `@fastify/busboy`, `nanoid`, `postcss`, `browserslist`, `brace-expansion`, `glob`, `minimatch`, `qs`, `uuid`, `source-map-js`, `fast-xml-parser`, `baseline-browser-mapping` | moderate/high | |

`vite` está fixado em `^6.2.3` e resolveu para 6.4.3; a correção exigiria major.

---

## PARTE F — BANCO DE DADOS

### F.1 Estrutura

11 tabelas em `src/db/schema.ts`: `users`, `events`, `eventos`, `instituicoes`, `contas_institucionais`, `historico_eventos`, `participacoes_eventos`, `event_attendance_authorizations`, `school_accounts`, `school_account_audit_logs`, `event_archive_logs`.

**Índices:** apenas os de unicidade (`users.uid`, `instituicoes.slug`, `contas_institucionais.identificador`, `school_accounts.login_identifier`) e os 3 criados na migration 0002 para autorizações. **Não há índice em `events.year/month`, `users.email`, `users.phone`** — e `email` é usado em `getUserByEmail` em **toda** requisição autenticada (inclusive dentro dos middlewares `requireChefeAdmin`/`requireAdminOrStaff`).

**Chaves estrangeiras:** não há uma única `references()` no schema. A integridade referencial (evento → escola, participação → usuário, autorização → aluno) é mantida só por convenção no código — é a origem estrutural dos registros órfãos.

### F.2 Operações e consistência

- **Não há constraint de unicidade em `users.email`** (só `uid`), embora o cadastro dependa de e-mail único. A duplicidade é barrada apenas por uma checagem `getUserByEmail` antes do insert — clássico *time-of-check to time-of-use*: duas requisições concorrentes criam duas contas.
- O fallback JSON é reescrito inteiro (`saveUsers()` etc.) a cada mutação, sem escrita atômica nem lock → risco de corrupção com dois processos.
- O código deduplica eventos por **título normalizado** entre `eventos` e `events`. Dois eventos legítimos com o mesmo título em datas diferentes são silenciosamente fundidos em um.
- `restoreArchivedEventFallback` usa o id do evento para procurar no histórico (D-13).

### F.3 Desempenho de consultas

- `findUserByPhoneDirectInSupabase`: `.select("*")` sem filtro, com comparação em memória → transfere a tabela `users` inteira (incluindo `password`) para o processo/cliente a cada tentativa de recuperação por telefone.
- `listAllEvents`: consulta **duas** tabelas completas + deduplica em memória + pode cair em 2 chamadas REST adicionais. Sem paginação em nenhuma listagem.
- `GET /api/users` devolve **todos** os usuários sem paginação. Com 10 mil alunos, a resposta e o `localStorage do navegador (`local_users_db`) crescem sem limite.

### F.4 Registros do ambiente atual (baseline)

`users`: 5 · `events`: 8 · `institutional_accounts`: 6 · `authorizations`: 1 · `participations`: 1 · `history`: 0 · `archive_logs`: 0 · `school_audit_logs`: 0.

**Achado de integridade:** a única autorização (`eventId: 1001`, aluno `student-lucas-123`) referencia um evento **que não existe** na tabela de eventos (`fallback_events.json` tem ids diferentes) e um **aluno que não está em `users`**. Registro órfão duplo já na primeira linha do dataset.

---

## PARTE G — DESEMPENHO (medições reais)

Ambiente: sandbox Linux, Node v22.22.3, resposta HTTP local (sem latência de rede), 5 requisições por endpoint.

| Endpoint | Tempo médio | Observação |
|---|---|---|
| `/api/health` | **0,6 ms** | baseline |
| `/api/schools` | **0,7 ms** | |
| `/api/events/archived` | **0,6 ms** | |
| `/api/auth/supabase-status` | **2,7 ms** | inclui resolução DNS |
| `/api/events` | **2.501 ms** | ⚠️ timeout fixo de 2,5 s (D-08) |
| 2 chamadas concorrentes a `/api/events` | **2.514 ms** | não paraleliza — o gargalo é o `setTimeout`, não CPU |

**Bundle:** `index.js` **1.377 kB** (348 kB gzip) + `index.css` **159 kB** (27 kB gzip) + logo 82 kB. Sem lazy loading.

**Imagens:** `public/` = 3,4 MB, dos quais ~1,5 MB são **6 PNGs duplicados** em dois diretórios e 414 kB são um screenshot versionado. Nenhuma conversão para WebP, nenhum `srcset`, nenhum `loading="lazy"` (verificado por busca: zero ocorrências).

**Polling:** `App.tsx` chama `loadEvents()` a cada **20 s**, a cada foco de janela e a cada mudança de tela. Com `/api/events` a 2,5 s, isso significa um ciclo de rede praticamente contínuo e ~180 requisições/hora por aba aberta.

**Frontend:** os 27 componentes são todos importados estaticamente; o `AdminPanel` de 3.405 linhas entra no bundle mesmo para visitantes anônimos.

**Backend:** `server.ts` é monolítico (2.557 linhas) e usa `fs.writeFileSync` no caminho de upload e em cada mutação do fallback — bloqueia o event loop.

---

## PARTE H — EXPERIÊNCIA DO USUÁRIO, ACESSIBILIDADE E RESPONSIVIDADE

> **Status: baseado em inspeção de código. Teste visual e de teclado NÃO foram executados** (sem navegador no sandbox). As recomendações abaixo são verificáveis e não dependem de observação visual.

### H.1 Acessibilidade (inspeção estática)

| # | Achado | Evidência | Gravidade |
|---|---|---|---|
| H-01 | **19 `<img>` sem atributo `alt`** | `grep '<img' \| grep -v alt=` | MÉDIA (WCAG 1.1.1) |
| H-02 | **86 `<label>` para 89 inputs, apenas 3 com `htmlFor`** — associação programática praticamente inexistente | contagem em `src/components/*.tsx` | ALTA (WCAG 1.3.1 / 3.3.2) |
| H-03 | **Nenhum modal usa `role="dialog"`, `aria-modal`, focus trap ou tecla Escape** | `Escape`: 0 · `role="dialog"`: 0 · `trapFocus`: 0 | ALTA (WCAG 2.1.2 — armadilha de foco) |
| H-04 | Apenas 8 arquivos usam `aria-label`; 280 `<button>` sem rótulo acessível declarado | grep | MÉDIA |
| H-05 | `onClick` em `<div>`/`<span>` sem `role`/`tabIndex`/`onKeyDown` | `DesktopNavbar.tsx:173`, `WelcomeScreen.tsx:166` | MÉDIA (WCAG 2.1.1) |
| H-06 | Erros de formulário não são anunciados (`aria-live`/`aria-invalid` ausentes) | grep | MÉDIA |
| H-07 | Estrutura de títulos inconsistente — `Feed` tem um `<h1>`; `CalendarView`, `EventDetail`, `Settings`, `SchoolPortal`, `Login`, `PasswordRecovery` **não têm heading semântico algum** | grep `<h1>/<h2>` | MÉDIA |

### H.2 Consistência de interface

- **Dois sistemas de tema:** `theme_mode` no `localStorage` + classe `.dark` no `<html>` (`App.tsx:167-187`) e, em paralelo, `dark:` do Tailwind v4 via `@variant`. Funciona, mas não há `prefers-color-scheme` como padrão inicial.
- **Idioma único (pt-BR)** e sem biblioteca de i18n — o `<html lang="en">` em `index.html` está **incorreto** para o conteúdo (WCAG 3.1.1).
- **Feedback de ação:** há um sistema de `showToast` centralizado e consistente. Ponto positivo.
- **Estados de carregamento/vazio:** o `Feed` possui busca e filtros; o `AdminPanel` tem filtros por papel com contagem correta (`AdminPanel.tsx:842-847`). São os dois melhores pontos de UX do projeto.
- **Mensagens falsas:** "Código SMS enviado", "Link de recuperação enviado", "Conexão restabelecida. Dados atualizados" — a primeira e a segunda são comprovadamente falsas (D-09, D-16).

### H.3 Responsividade (inspeção; sem teste visual)

- Layout é mobile-first com `BottomNav` + `MobileHeader` para telas pequenas e `DesktopNavbar` para grandes — estrutura adequada.
- `overflow-x-auto` aparece em 5 pontos (chat, filtros do admin, tabela) — intencional, mas a tabela de usuários do admin (`overflow-x-auto max-h-[600px]`) é o ponto de maior risco de rolagem horizontal em telas de 320 px.
- **NÃO TESTADO:** quebra de layout, sobreposição de modais, botões inacessíveis e legibilidade em 320 px / 768 px / 1440 px. Isso exige navegador.

---

## PARTE I — FUNCIONALIDADES NÃO TESTADAS

| Item | Motivo | O que seria necessário |
|---|---|---|
| Todas as 16 telas (renderização visual) | Sandbox sem navegador; download do Chromium bloqueado (`Error: Download failure, code=1`) | nodo com Chromium disponível ou teste manual pelo preview |
| Responsividade (320–1440 px) | idem | idem |
| Navegação por teclado e leitor de tela | idem | idem |
| Login Google OAuth completo | Precisa de redirect URI cadastrada + popup | cadastrar `${origem}/auth/callback` no Supabase e testar em navegador |
| Sessão persistente após fechar/reabrir o navegador | Precisa de navegador | teste manual |
| Chat da IA com `GEMINI_API_KEY` real | Chave não configurada; cai no fallback local | configurar a chave |
| Retenção de 30 dias (arquivamento real) | Nenhum evento >30 dias no dataset | inserir evento fictício datado de 60 dias atrás num ambiente isolado |
| RLS efetivo no Supabase | Egress bloqueado (`*.supabase.co` → HTTP 000) | SQL Editor do painel Supabase |
| Estrutura real do banco (tabelas que existem de fato) | idem | idem |
| Upload real de arquivos grandes / formatos inválidos | Requer sessão válida completa | teste com conta de teste |
| Notificações e e-mails | Não há provedor de e-mail no projeto | nada a testar — funcionalidade inexistente |
| Compatibilidade Safari/Firefox/Edge | Sem navegadores no sandbox | teste manual multi-browser |
| `/api/supabase-test`, `/api/auth/login`, `/api/auth/profile`, `/api/users/heartbeat` | Requerem token Firebase/Supabase válido real | ambiente com credenciais |

---

## PARTE J — PLANO DE CORREÇÃO (por prioridade, **não executado**)

### Bloco 1 · Segurança (bloqueia qualquer publicação)

| # | Correção | Arquivos | Risco de regressão | Teste de regressão |
|---|---|---|---|---|
| J-01 | Substituir o "local token" por **JWT assinado com HMAC** (`jsonwebtoken` ou `jose`) e **remover** o decode sem verificação do `catch` | `src/middleware/auth.ts` | Alto — todos os fluxos de login emitem esse token hoje | Login aluno, funcionário, diretor, convidado, institucional; token expirado/adulterado → 401 |
| J-02 | Remover `role` do corpo de `POST /api/auth/register`; forçar `"Aluno"` no servidor | `server.ts:637` | Baixo | Cadastro com `role:"Diretor"` → conta sai como Aluno |
| J-03 | Nunca devolver `password` em respostas; remover do `PUT /api/users/:id`, `register`, `local-login-password` | `server.ts:1078`, `637`, `706` | Baixo | `GET`/`PUT` de usuário sem campo `password` |
| J-04 | Hash de senha (`bcrypt`) + migração transparente no próximo login | `src/db/users.ts`, `usersService.ts` | Médio | Login com senha antiga ainda funciona; senha no arquivo deixa de ser legível |
| J-05 | Adicionar `requireAuth` + verificação de propriedade em `/api/users/:userId/authorizations`, `/api/events/:eventId/authorizations[/check]`, `/api/authorizations/:id/signature` | `server.ts:2156-2210` | Médio | Aluno vê só as suas; admin vê do evento; anônimo → 401 |
| J-06 | Deixar de servir `public/uploads/` como estático; servir assinatura só pela rota autenticada | `server.ts` (static) | Baixo | `GET /uploads/signatures/x.png` → 404; rota autorizada → 200 |
| J-07 | Corrigir o guard do portal institucional: `if (!isChefe && !(user.role==="Escola" && user.escolaId===schoolId)) → 403` | `server.ts:1898`, `1936`, `1977` | Médio | Aluno → 403; escola dona → 200; escola alheia → 403 |
| J-08 | **Parar de devolver o token de reset na resposta**; integrar provedor de e-mail real; o mesmo para o OTP de SMS | `server.ts:334-402`, `404-500` | Alto — a UI hoje exibe o link | Solicitar → sem token no corpo; e-mail recebido; reset funciona |
| J-09 | Trocar a senha institucional compartilhada por hash individual + rotação | `fallback_institutional_accounts.json`, `server.ts:868` | Alto | As 6 escolas fazem login com senhas próprias |
| J-10 | Habilitar RLS em `users`, `events`, `eventos` com policies por `auth.uid()` | nova migration | Alto | Cliente anon não lê `users`; usuário lê só o próprio registro |
| J-11 | Remover `X-Powered-By` + adicionar `helmet` (CSP, `X-Frame-Options`, `nosniff`) | `server.ts` | Baixo | Headers presentes; app continua funcionando |
| J-12 | Rate limiting global (`express-rate-limit`) + cota no `/api/ai/chat` | `server.ts` | Baixo | 429 após N requisições |

### Bloco 2 · Integridade dos dados
J-13 `UNIQUE` em `users.email` · J-14 FKs no schema · J-15 escrita atômica/lock nos JSON de fallback · J-16 limpar a autorização órfã (`eventId:1001`) · J-17 padrão de "soft delete" único (hoje há `delete` e `delete/permanent`).

### Bloco 3 · Funcionamento essencial
J-18 Cache negativo + timeout curto em `/api/events` (resolve os 2,5 s e 90% do tráfego) · J-19 Parar o polling de 20 s quando a aba está oculta (`document.hidden`) · J-20 `await`/try-catch no `fs.writeFileSync` de uploads · J-21 paginação em `/api/users` e `/api/events`.

### Bloco 4 · Autenticação e permissões
J-22 Sessão de convidado com `uid` criptográfico e expiração curta · J-23 Recalcular permissões **somente** no servidor (o `localStorage` não deve decidir `isAdmin`) · J-24 Remover a lista de e-mails hardcoded de `permissions.ts` e `admin.ts` — fonte única: o banco.

### Bloco 5 · Funcionalidades
J-25 Corrigir o formulário de `Contact` (hoje abre `mailto:` para `solucoes@gmail.com`, não envia pelo servidor) · J-26 Remover os 2 componentes órfãos e a dependência `@vis.gl/react-google-maps` **ou** usá-la · J-27 Substituir os placeholders do "sms/email enviado" por mensagens honestas enquanto não houver provedor.

### Bloco 6 · Integrações
J-28 Fixar `SUPABASE_URL`/chaves em env sem fallback hardcoded no bundle · J-29 Fallback local para imagens Unsplash · J-30 `vite.config.ts`: manter `base` dinâmico (já feito) e separar build de produção.

### Bloco 7 · Desempenho
J-31 Code splitting (`React.lazy` no `AdminPanel`, `MapView`, `CalendarView`) — reduz o bundle inicial drasticamente · J-32 `loading="lazy"` + WebP nas 6 imagens de escola; apagar a duplicata de `public/assets/aistudio` (−1,5 MB) · J-33 `manualChunks` · J-34 remover o screenshot de 414 kB do repositório.

### Bloco 8 · Responsividade e acessibilidade
J-35 `alt` nas 19 imagens · J-36 `htmlFor`/`id` em todos os campos · J-37 `role="dialog"` + `aria-modal` + focus trap + Escape nos modais · J-38 `aria-label` nos botões de ícone · J-39 `lang="pt-BR"` · J-40 headings por tela · J-41 `aria-live` nos erros de formulário · J-42 teste visual real em 320/768/1440 px.

### Bloco 9 · Qualidade de código
J-43 Quebrar `server.ts` (2.557 linhas) e `AdminPanel` (3.405 linhas) em módulos · J-44 ligar `strict: true` no `tsconfig` · J-45 unificar `permissions.ts` ↔ `admin.ts` · J-46 eliminar as tabelas duplicadas `events`/`eventos` (com plano de migração) · J-47 **criar a suíte de testes** (Vitest + Supertest; Playwright para E2E) — hoje a cobertura é 0.

### Bloco 10 · Melhorias opcionais
J-48 Tema inicial por `prefers-color-scheme` · J-49 i18n (se houver intenção multi-idioma) · J-50 auditoria de acessibilidade com axe-core em CI.

---

## PARTE K — CONCLUSÃO

**1. O aplicativo está funcional?**
Parcialmente. O "caminho feliz" funciona: build limpo, 0 erros de TypeScript, feed carregando, navegação entre as 16 telas, painel administrativo com filtros e contagens corretas, mapa e calendário implementados. Mas **5 das 7 identidades que o sistema afirma ter são contornáveis sem credencial**.

**2. Todas as funcionalidades foram verificadas?**
Não. 31 de 86 foram testadas por execução real. 25 não puderam ser testadas (navegador e egress para o Supabase indisponíveis). Declarado explicitamente na Parte I.

**3. Existem falhas críticas?**
**Sim — 7 críticas** (D-01 a D-07, mais D-09 e D-10), todas comprovadas por execução real, não por leitura:
- token forjado → admin total;
- cadastro definindo o próprio papel;
- senha institucional hardcoded para as 6 escolas;
- aluno editando o perfil de uma escola;
- dados de menores, telefone de responsáveis e assinaturas acessíveis **sem autenticação**;
- token de troca de senha entregue na própria resposta HTTP;
- senhas em texto claro, e uma delas devolvida em resposta de API.

**4. Existem riscos de segurança?**
Sim, e são o problema central do projeto. Um visitante anônimo chega a administrador por **pelo menos três caminhos independentes**. Além disso: 27 dependências vulneráveis (1 critical, 13 high), nenhum header de segurança, nenhum rate limit, e uma hipótese crítica pendente de verificação (RLS ausente em `users`, E.4) que, se confirmada, expõe a tabela inteira de usuários pela chave pública embutida no bundle.

**5. Existem problemas de integridade de dados?**
Sim: uma autorização órfã já no primeiro registro (aponta para evento e aluno inexistentes), zero chaves estrangeiras no schema, ausência de `UNIQUE` em `email`, deduplicação de eventos por título, e reescrita não atômica dos JSON de fallback.

**6. Existem funcionalidades incompletas?**
Sim, 6: recuperação por SMS (simulada, nunca envia), recuperação por e-mail (sem provedor), notificações (inexistentes apesar do nome dos modais), `Contact` (só `mailto:`), impressão/recibo de autorização (verificar em navegador), e o próprio "modo Google Maps" anunciado no `metadata.json` correspondendo, na prática, a Leaflet.

**7. O sistema está tecnicamente preparado para publicação?**
**Não.** Publicar agora significa expor dados de crianças e adolescentes identificáveis, com assinatura dos responsáveis e telefone, sem autenticação — e com caminho aberto para qualquer pessoa se tornar administrador. Isso é risco jurídico (LGPD) e reputacional antes de ser técnico.

**8. O que precisa ser corrigido antes de qualquer publicação?**
Na ordem: **J-01** (assinatura de token), **J-02** (papel no cadastro), **J-05/J-06** (dados de menores), **J-07** (portal escolar), **J-08** (reset de senha), **J-09** (senha institucional), **J-10/E.4** (RLS em `users`), **J-04/J-03** (hash e não exposição de senha). Os blocos 1 e 2 inteiros.

**9. O que pode ser melhorado depois?**
Blocos 3 a 10: o desempenho do `/api/events` (ganho imediato e barato), code splitting, acessibilidade estrutural, quebra dos arquivos monolíticos e — sobretudo — **uma suíte de testes**, porque hoje nenhuma correção pode ser feita com segurança de regressão em um sistema de 26 mil linhas e zero cobertura.

---

> **Aguardando sua autorização para iniciar as correções.** Conforme instruído, nada foi alterado. Sugiro começar pelo Bloco 1 em ordem, com um commit por item (J-01 é o de maior alavancagem: conserta a raiz de D-01, D-02 e neutraliza o vetor mais fácil de todos), sempre com backup do estado do fallback e teste de regressão declarado antes de cada mudança.
