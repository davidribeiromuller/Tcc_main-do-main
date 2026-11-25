# PENDÊNCIAS DE CONFIGURAÇÃO

**Projeto:** eloEscola · **Data:** 2026-11-11 · **Rodada:** 36

Tudo o que depende de intervenção **externa** (credencial de terceiro, decisão
contratual ou revisão jurídica). Nada aqui é bug de código.

---

## 1. Legenda

- 🔴 **bloqueia operação real** — sem isso, o fluxo não funciona de verdade
- 🟡 **degrada funcionalidade** — funciona parcialmente ou em modo simulado
- 🟢 **recomendado** — não bloqueia, mas evita surpresa

---

## 2. Obrigatórias para subir em produção

### 🔴 2.1 `SESSION_SECRET`

| | |
|---|---|
| O que é | chave HMAC dos tokens de sessão (`elo1.<payload>.<hmac>`) |
| Sem ela | o servidor responde **503** e nenhum login funciona (fail-closed) |
| Formato | string aleatória com **≥ 32 caracteres** |
| Como gerar | `openssl rand -hex 32` |
| Onde | variável de ambiente do servidor — **nunca** no frontend |

### 🔴 2.2 `SUPABASE_URL` + `SUPABASE_SECRET_KEY`

| | |
|---|---|
| O que é | conexão do backend com o Supabase (service role) |
| Sem elas | todas as rotas do painel respondem `503 SAAS_NOT_CONFIGURED` |
| Status atual | **configuradas** (projeto `jaoheenjltzzglfncgfq`) |
| Regra | a `SECRET_KEY` fica **só no servidor**; o navegador usa a publishable |

### 🔴 2.3 `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD`

| | |
|---|---|
| O que é | cria o primeiro Chefe Administrador |
| Sem elas | banco novo fica **sem nenhum administrador** → painel inalcançável |
| Senha | mínimo 8 caracteres |
| Nota | vale nos dois modos (Postgres **e** fallback JSON) desde a rodada 35 |

---

## 3. Cobrança

### 🔴 3.1 `STRIPE_SECRET_KEY`

| | |
|---|---|
| O que faz falta | criação real de cobrança (PIX, boleto, cartão) |
| Sem ela | `getBillingDiagnostics()` reporta sandbox; nenhuma cobrança é criada |
| Impacto na UI | `/planos` **não promete** pagamento funcional quando ausente |

### 🔴 3.2 `STRIPE_WEBHOOK_SECRET`

| | |
|---|---|
| O que faz falta | validar criptograficamente o webhook |
| Sem ela | `/api/billing/webhook` recusa tudo com 400 (assinatura inválida) |
| Efeito colateral | nenhuma assinatura é ativada — **comportamento correto**, mas nada é cobrado |
| Configurar | endpoint público `POST /api/billing/webhook` no painel do Stripe |

### 🟡 3.3 Asaas / Mercado Pago

Apenas as **variáveis estão previstas**; o adaptador não foi implementado.
Escolher um provedor é decisão de negócio — **não implementei pela metade**, o
que faria a cobrança falhar no meio do fluxo.

---

## 4. Comunicação

### 🟡 4.1 `RESEND_API_KEY`

| | |
|---|---|
| O que faz falta | envio real de e-mail (recuperação de senha, convites) |
| Sem ela | o token é gerado e `deliveryPending: true` é retornado |
| Consequência | o usuário **não recebe** o código; o fluxo para no "enviado" |

### 🟡 4.2 `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER`

Mesma situação para SMS (recuperação por telefone e OTP).

---

## 5. Plataforma

### 🔴 5.1 `PLATFORM_OWNER_EMAILS` (e `VITE_PLATFORM_OWNER_EMAILS`)

| | |
|---|---|
| O que é | allowlist de quem acessa `/master` |
| Sem ela | **ninguém** entra no Master — fail-closed, por design |
| Regra | exige **duas** condições: estar na allowlist **e** ser chefe confirmado no banco |
| Note | um Chefe de escola **não** vira proprietário da plataforma só por ser chefe |

---

## 6. Recomendadas

### 🟢 6.1 `ALLOWED_ORIGINS`

Lista de origens permitidas por CORS. Sem ela o comportamento é restritivo.
Configurar com o domínio real de produção.

### 🟢 6.2 `TRUST_PROXY` / `TRUST_PROXY_HOPS`

Atrás de load balancer/proxy, sem isso o rate limit e o IP na auditoria ficam
errados (todos os requests parecem vir do proxy).

### 🟢 6.3 Rate limits

Valores default: `RATE_LIMIT_PER_MINUTE=240`, `AUTH_RATE_LIMIT=20`,
`AI_RATE_LIMIT=12`, `PUBLIC_WRITE_RATE_LIMIT=30`. Ajustar conforme o porte da
rede.

### 🟢 6.4 `DATABASE_URL` (opcional)

O Postgres/Drizzle é **independente** do cliente Supabase. Sem ele, o Drizzle
fica em modo fallback, mas o painel continua funcionando via Supabase
(`saasConfigured`). Só configure se quiser usar o ORM.

---

## 7. Pendências não técnicas

| Item | Situação | Responsável |
|---|---|---|
| Revisão jurídica da política de privacidade | texto técnico derivado do código; versão `2026-11-11` | advogado |
| DPA (contrato de tratamento de dados) com as escolas | exigência LGPD para operador | jurídico |
| Verificação de assinatura de webhook **por provedor** | hoje o HMAC genérico é validado; Asaas/MP não implementados | junto com §3.3 |
| Backup automatizado do banco | não configurado neste repositório | infraestrutura |

---

## 8. Checklist mínimo para produção

```
[ ] SESSION_SECRET (>= 32 chars, aleatório)
[ ] SUPABASE_URL
[ ] SUPABASE_SECRET_KEY          (só no servidor)
[ ] SUPABASE_PUBLISHABLE_KEY     (só no frontend)
[ ] BOOTSTRAP_ADMIN_EMAIL
[ ] BOOTSTRAP_ADMIN_PASSWORD     (>= 8 chars)
[ ] PLATFORM_OWNER_EMAILS
[ ] ALLOWED_ORIGINS
[ ] TRUST_PROXY / TRUST_PROXY_HOPS
[ ] STRIPE_SECRET_KEY            (para cobrar de verdade)
[ ] STRIPE_WEBHOOK_SECRET
[ ] RESEND_API_KEY               (para e-mail real)
[ ] TWILIO_*                     (para SMS)
```

Depois de configurar, confirmar em:

```bash
GET /api/db-status     # saasConfigured: true, active: true
GET /api/health
```

`saasConfigured: false` significa que o painel **não** vai conseguir ler o banco
— e a UI mostrará isso como erro explícito, não como lista vazia.

---

## Contas administrativas bloqueadas no banco (rodada 39)

Encontrado ao testar o login contra o banco real (`jaoheenjltzzglfncgfq`):

| Conta | id | `role` | `is_admin` | `ativo` | senha |
|---|---|---|---|---|---|
| `diretoria@helenawysocki.com` | 2 | Diretor | true | **false** | `senha123` (texto, legado) |
| `funcionario@helenawysocki.com` | 3 | Funcionário | false | **false** | `senha123` (texto, legado) |
| `professor@gmail.com` | 759 | Diretor | true | **true** | `1234` (texto, legado) |
| `davidribeiromuller2009@gmail.com` | 200 | Diretor | true | **true** | `senha123` |
| `joao.lima.santos12@escola.pr.gov.br` | 819 | Diretor | true | **true** | *(sem senha)* |
| `gabrielamendesseben@gmail.com` | 998 | Diretor | true | **true** | *(sem senha)* |

Duas das cinco contas administrativas estão **desativadas**. O login delas
responde `403` com o motivo — comportamento correto, e o código não desbloqueia
ninguém sozinho.

**Para entrar com uma conta administrativa hoje**, use uma ativa
(`professor@gmail.com` / `1234`, id 759) e, no painel, desbloqueie a conta que
você realmente quer usar (aba Usuários → desbloquear).

Contas sem senha (819, 998) foram criadas por login Google; elas entram pelo
botão "Continuar com Google", não por senha.

### Ainda falta (inalterado desde §38)

```bash
SUPABASE_URL=https://jaoheenjltzzglfncgfq.supabase.co
SUPABASE_SECRET_KEY=<sb_secret_...>    # só no servidor
SESSION_SECRET=<openssl rand -hex 32>
```

Sem os três, o painel no endereço público responde `503 SAAS_NOT_CONFIGURED`
(mensagem na tela, não lista vazia). O passo a passo está em
`DEPLOY_SERVIDOR.md`.
