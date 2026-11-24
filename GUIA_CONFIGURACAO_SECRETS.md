# Guia de configuração de secrets

Passo a passo para tirar o eloEscola do modo "funciona, mas parcialmente
configurado" e colocá-lo em produção. Cada seção diz **o que quebra sem a
variável** — nada aqui é decorativo.

O arquivo de referência com todas as variáveis comentadas é o **`.env.example`**.

> Regra de ouro: variável que começa com `VITE_` **vai para o navegador**.
> Só coloque ali o que pode ser lido por qualquer visitante. Chaves de serviço,
> segredos de webhook e senhas ficam **sem** o prefixo.

---

## 1. Antes de tudo: chaves e segredos

### 1.1 `SESSION_SECRET` — obrigatório em produção

Sem ele o servidor **não emite nem aceita sessão** (responde 503). É a chave
HMAC dos tokens `elo1.<payload>.<hmac>`.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

- Mínimo 32 caracteres; o código recusa valores curtos.
- Trocar o segredo **invalida todas as sessões ativas** (todo mundo reloga).
  Isso é o comportamento desejado em caso de vazamento.
- Nunca reutilize o valor de desenvolvimento em produção.

### 1.2 `SUPABASE_SECRET_KEY` — obrigatório para o núcleo SaaS

Sem ela: painéis Master/escola, cobrança, entitlements, storage privado de
assinaturas e autenticação por hash **não funcionam**. As rotas respondem
"Backend SaaS não configurado."

- Pegue em Supabase → Project Settings → API → `service_role`.
- **Só no servidor.** Se essa chave aparecer no bundle, qualquer visitante lê
  o banco inteiro (a RLS não vale para `service_role`).

### 1.3 `PLATFORM_OWNER_EMAILS` — obrigatório para o painel Master

Lista separada por vírgula. Sem ela o painel responde **503
`MASTER_NOT_CONFIGURED`** — de propósito: é melhor o painel ficar fora do ar do
que aberto.

- O acesso exige **duas** condições: e-mail na lista **e** papel de Chefe
  confirmado no banco.
- `VITE_PLATFORM_OWNER_EMAILS` (com prefixo) só controla a **exibição** do
  botão. Ela não autoriza nada.

### 1.4 `ALLOWED_ORIGINS` — obrigatório se o frontend tem domínio próprio

Separado por vírgula, com protocolo. Sem valor, o CORS fica same-origin apenas e
o app servido em outro domínio não conversa com a API.

### 1.5 `BOOTSTRAP_ADMIN_*` — usar uma vez e remover

```bash
BOOTSTRAP_ADMIN_EMAIL=voce@escola.com.br
BOOTSTRAP_ADMIN_PASSWORD=<senha forte, 12+ caracteres>
BOOTSTRAP_ADMIN_INSTITUTION=eloEscola
```

Sem essas variáveis **nenhuma conta padrão é criada** (antes existiam três
contas com `senha123`). Depois do primeiro login, apague as três linhas e
reinicie. Se deixar, a cada partida o sistema tenta recriar o administrador.

---

## 2. O que cada ausência realmente faz

| Variável ausente | Efeito real (não é erro silencioso) |
|---|---|
| `SESSION_SECRET` | login não emite token → app inutilizável |
| `SUPABASE_SECRET_KEY` | painéis, cobrança e storage privado desligados |
| `PLATFORM_OWNER_EMAILS` | painel Master 503 com código `MASTER_NOT_CONFIGURED` |
| `RESEND_API_KEY` + `TRANSACTIONAL_EMAIL_FROM` | recuperação por e-mail grava o token mas devolve `deliveryPending: true` (não finge envio) |
| `TWILIO_*` | recuperação por SMS indisponível |
| `STRIPE_SECRET_KEY` | cobranças ficam **pendentes** em sandbox; nunca marcadas como pagas |
| `STRIPE_WEBHOOK_SECRET` | webhook recusa tudo (assinatura inválida → 400 + auditoria) |
| `GEMINI_API_KEY` | IA responde com fallback local e **não consome cota** |
| `SUPABASE_DB_URL` | backend legado usa o store JSON de fallback |

---

## 3. Banco de dados

### 3.1 Migrações (ordem obrigatória)

| Arquivo | Conteúdo | Estado |
|---|---|---|
| `supabase/migrations/20261111_saas_core.sql` | 15 tabelas SaaS, RLS, catálogo de planos, seed da escola piloto | **aplicada** |
| `supabase/migrations/20261112_auth_security_tokens.sql` | 4 tabelas de auth/LGPD (`password_reset_tokens`, `auth_sessions`, `consent_records`, `data_subject_requests`) | **aplicada** |

Nenhuma das duas é destrutiva (sem `DROP TABLE` / `DROP COLUMN`) e são
idempotentes (`if not exists`), então podem ser reexecutadas.

### 3.2 Storage (buckets)

| Bucket | Visibilidade | Conteúdo | Limite |
|---|---|---|---|
| `signatures` | **privado** | assinaturas de responsáveis (`<authId>.png|jpg`) | 2 MB, png/jpeg |
| `school-assets` | público | logos e imagens institucionais | — |

Leitura de assinatura **só** por URL assinada de 300 s, emitida depois da
checagem de sessão + permissão.

### 3.3 Conferir a RLS depois de qualquer mudança

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by rowsecurity, tablename;
```

Tudo em `false` que guarde dado de pessoa é vazamento. As únicas tabelas com
leitura pública aceitável são `plans`, `plan_addons`, `schools` (ativas),
`partners` (aprovados) e o `INSERT` de `sales_leads`.

```sql
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename;
```

---

## 4. Pagamentos

1. Crie a conta no provedor e pegue a chave secreta.
2. `STRIPE_SECRET_KEY` → habilita a criação de cobrança.
3. Cadastre o endpoint de webhook: `https://SEU_DOMINIO/api/billing/webhook`.
4. Copie o segredo de assinatura para `STRIPE_WEBHOOK_SECRET`.
5. Confirme no painel Master → aba **Financeiro** que o diagnóstico indica
   `configured: true`.

O webhook é **idempotente** (`unique(provider, event_id)`) e recusa replay com
timestamp antigo. Evento duplicado responde `200 {duplicate: true}` **sem**
reprocessar. Assinatura inválida → `400` + registro em auditoria.

> Asaas e Mercado Pago ainda **não** têm adaptador: as variáveis existem no
> `.env.example` como preparação. Enquanto não houver adaptador, o sistema fica
> em sandbox — e diz isso na tela.

---

## 5. E-mail e SMS

### E-mail (Resend)

```bash
RESEND_API_KEY=re_...
TRANSACTIONAL_EMAIL_FROM=eloEscola <nao-responda@eloescola.com.br>
```

O domínio precisa estar verificado no Resend. Sem as duas variáveis a rota de
recuperação **não mente**: devolve a mesma mensagem neutra ao usuário
(anti-enumeração) e sinaliza `deliveryPending: true` no log de auditoria.

### SMS (Twilio)

```bash
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+55...
```

O código de 6 dígitos é gravado como `sha256(code:email)` — nunca em texto.
Validade 10 min, máximo 5 tentativas.

---

## 6. Publicação

### 6.1 GitHub Pages (estático)

O app detecta hospedagem estática (`src/lib/staticHosting.ts`) e **não chama**
`/api/*` — cai no Supabase direto. Nesse cenário, tudo que depende do Express
fica indisponível (é esperado):

- painel Master, painel da escola, cobrança, webhooks
- IA, recuperação de senha por e-mail/SMS
- assinaturas de responsáveis

Só publique o Pages para demonstração visual.

### 6.2 Servidor Node (Express)

```bash
NODE_ENV=production
PORT=3000
PUBLIC_APP_URL=https://app.eloescola.com.br
```

Coloque atrás de um proxy com TLS. Se você usa proxy reverso, ajuste
`TRUST_PROXY` / `TRUST_PROXY_HOPS` — sem isso o rate limit enxerga todos os
usuários com o IP do proxy.

---

## 7. Checklist antes de liberar para uma escola real

- [ ] `SESSION_SECRET` com 48 bytes aleatórios, só no servidor
- [ ] `SUPABASE_SECRET_KEY` no servidor, ausente do bundle (`grep -r "service_role" dist/`)
- [ ] `PLATFORM_OWNER_EMAILS` com o e-mail correto (testar o painel Master **e** o 403 com outro e-mail)
- [ ] `ALLOWED_ORIGINS` com o domínio real
- [ ] `BOOTSTRAP_ADMIN_*` **removido** após o primeiro acesso
- [ ] Bucket `signatures` privado; teste de URL direta retornando 400/403
- [ ] `RESEND_API_KEY` válido; recuperação de senha chegando na caixa de entrada
- [ ] Webhook respondendo `200` e duplicata respondendo `200 {duplicate:true}`
- [ ] `STRIPE_SECRET_KEY` ou decisão explícita de operar em sandbox (e avisar as escolas)
- [ ] Migrações aplicadas (as duas) e RLS conferida nas consultas da seção 3.3
- [ ] Política de privacidade revisada por advogado
- [ ] DPA assinado com a instituição contratante
