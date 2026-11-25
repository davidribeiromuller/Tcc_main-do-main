# RELATÓRIO DE CONEXÃO COM O BANCO DE DADOS

**Projeto:** eloEscola · **Data:** 2026-11-11 · **Rodada:** 36
**Projeto Supabase:** `jaoheenjltzzglfncgfq`

---

## 1. Arquitetura de dados (confirmada, não presumida)

```
    REACT (navegador)
          │  fetch com Bearer token
          ▼
    SERVIÇOS (src/lib/*Service.ts)
          │  /api/...
          ▼
    EXPRESS (server.ts)  ── requireAuth → requireAdminOrStaff / requireChefeAdmin
          │                chave SECRETA (SUPABASE_SECRET_KEY) só aqui
          ▼
    CAMADA DE ACESSO
      ├── src/lib/saasStore.ts    (Supabase service role — tabelas privadas)
      ├── src/db/index.ts         (Drizzle + PG, opcional)
      └── src/db/fallbackStore.ts (JSON local — só desenvolvimento)
          ▼
    SUPABASE (PostgreSQL)
```

**Regra que a arquitetura impõe:** nenhuma escrita em tabela privada sai do
navegador. Tudo passa pelo Express. A `SUPABASE_SECRET_KEY` nunca é enviada ao
cliente.

---

## 2. Estado real do banco de produção

Inventário obtido por SQL direto (`information_schema`), não por suposição:

**31 tabelas em `public`:**

```
auth_sessions            feature_entitlements    payment_transactions    school_profiles
consent_records          institutional_links     personal_events         school_units
data_subject_requests    memberships             plan_addons             schools
deleted_events           partner_campaigns       plans                   subscription_events
event_archive_logs       partners                platform_audit_logs     subscriptions
event_participations     password_reset_tokens   profile_change_requests usage_records
event_suggestions        webhook_events          sales_leads             users
eventos                  school_accounts         events
```

**Dados existentes (preservados, nada foi apagado):**

| Tabela | Registros |
|---|---|
| `users` | 28 |
| `event_suggestions` | 46 |
| `eventos` | 14 |
| `deleted_events` | 11 |
| `events` | 10 |
| `plan_addons` | 5 |
| `plans` | 3 |
| `schools` | 1 |
| `subscriptions` | 1 |
| `school_accounts` | 1 |
| `payment_transactions` | 0 |
| `partners` | 0 |
| `platform_audit_logs` | 0 |
| `profile_change_requests` | 0 |
| `school_profiles` | 0 |

**Nenhum `DROP`, `TRUNCATE` ou `RESET` foi executado.** Toda a atuação em
produção nesta rodada foi `create index if not exists` e leitura.

---

## 3. A conexão comercial está viva (prova por SQL)

Uma assinatura real existe e resolve corretamente pelos relacionamentos:

```sql
select s.status, s.billing_cycle, s.current_period_end, p.name, p.monthly_price_cents
from subscriptions s join plans p on p.id = s.plan_id join schools sc on sc.id = s.school_id;
```

Resultado:

| status | ciclo | período até | plano | mensal |
|---|---|---|---|---|
| `trialing` | `monthly` | 2026-12-24 | Rede | R$ 699,00 |

Ou seja: `schools → subscriptions → plans` está íntegro. O Painel Master tem de
onde calcular MRR.

---

## 4. Migrations

### 4.1 Estado versionado no repositório (5 arquivos)

| Arquivo | Conteúdo |
|---|---|
| `20261111_saas_core.sql` | 31 tabelas do núcleo SaaS + catálogo de planos e adicionais |
| `20261112_auth_security_tokens.sql` | tokens de sessão, recuperação de senha, OTP |
| `20261113_close_open_rls.sql` | fecha as policies públicas de escrita restantes |
| `20261118_profile_change_requests.sql` | ✏️ **RLS corrigida nesta rodada** |
| `20261119_school_profiles.sql` | ✏️ **RLS corrigida nesta rodada** |

### 4.2 ⚠️ Bug de ORDEM nas migrations (encontrado e corrigido)

As migrations 20261118 e 20261119 **já existiam** no repositório, mas criavam
policies **permissivas de escrita**:

```sql
-- 20261118 (original)
create policy allow_insert_profile_requests ... for insert with check (true);
create policy allow_update_profile_requests ... for update using (true) with check (true);

-- 20261119 (original)
create policy allow_insert_school_profiles  ... for insert with check (true);
create policy allow_update_school_profiles  ... for update using (true) with check (true);
```

**O problema é a ordem.** A `20261113_close_open_rls.sql` (13/11) remove as
policies públicas. As de 18/11 e 19/11 rodam **depois** e as recriavam.

Consequência num deploy limpo: o fechamento feito na rodada 35 seria **desfeito
automaticamente**, e qualquer portador da chave publicável voltaria a poder ler
e **escrever** solicitações de perfil alheias e a ficha de qualquer escola.

O banco de produção estava correto (verificado: só `allow_read_school_profiles`
e nenhuma policy em `profile_change_requests`) porque o fechamento foi aplicado
manualmente na rodada 35 — mas **o repositório mentia**. Um `supabase db push`
em ambiente novo reintroduziria o furo.

**Correção:** as duas migrations agora removem as policies antigas por nome
(`drop policy if exists`, idempotente) e **não criam nenhuma policy de escrita**.
A leitura pública da ficha da escola foi preservada de propósito (é conteúdo do
mural).

O teste `test-round36-restauracao.mjs` (§12) percorre as migrations em ordem
cronológica e falha se qualquer migration posterior à 20261113 criar escrita
pública — a regressão não volta sem alguém ver.

### 4.3 Índices criados nesta rodada (aplicados em produção)

| Índice | Tabela | Uso |
|---|---|---|
| `profile_change_requests_status_idx` | `(status, created_at desc)` | listar pendentes primeiro no painel |
| `profile_change_requests_user_idx` | `(user_id)` | histórico por usuário |
| `school_profiles_slug_idx` | `(slug)` | `PUT /api/school-profiles/:slug` |
| `school_profiles_city_idx` | `(city)` | diretório por cidade |

Verificados em `pg_indexes` depois da criação.

---

## 5. RLS — estado real (verificado por `pg_policies`)

**Todas as policies de escrita pública foram removidas.** Restam 14 policies,
todas de leitura legítima ou escopo de dono:

| Tabela | Policy | Comando | Papel | Condição |
|---|---|---|---|---|
| `events` | Allow public read | SELECT | public | `true` |
| `eventos` | Allow public read | SELECT | public | `true` |
| `school_profiles` | allow_read_school_profiles | SELECT | public | `true` |
| `plans` | plans_public_read | SELECT | anon+auth | `is_public AND is_active` |
| `plan_addons` | plan_addons_public_read | SELECT | anon+auth | `is_active` |
| `schools` | schools_public_read | SELECT | anon+auth | `status='active'` |
| `partners` | partners_public_read | SELECT | anon+auth | `status='approved'` |
| `sales_leads` | sales_leads_public_insert | INSERT | anon+auth | `true` (formulário comercial) |
| `users` | users_self_read | SELECT | authenticated | `auth.uid() = uid` |
| `users` | users_self_update | UPDATE | authenticated | `auth.uid() = uid` |
| `personal_events` | owner_select/insert/update/delete | 4× | authenticated | `owner_id = jwt.sub` |

Consequências diretas:

- **Leitura pública do mural/diretório/planos continua funcionando** (é o que o
  app precisa).
- **Toda escrita administrativa depende do servidor.** Qualquer código que
  tentasse escrever do navegador **falha de verdade** agora — antes falhava em
  silêncio, o que é pior.
- Foi justamente por isso que `fetchUsersDirectFromSupabase` precisou ser
  convertido ([RELATORIO_RESTAURACAO_ADMIN.md §4.5](RELATORIO_RESTAURACAO_ADMIN.md)).

---

## 6. Diagnóstico `/api/db-status` (§2.4)

### 6.1 O que a rota informa

| Campo | Significado |
|---|---|
| `active` | Postgres/Drizzle respondeu ao `SELECT 1` |
| `cachedOffline` | conexão marcada offline, aguardando retry |
| `saasConfigured` | **existe `SUPABASE_SECRET_KEY`** — é o que o painel precisa |
| `health` | `getDbHealthStats()` (falhas consecutivas, última checagem) |
| `provider` / `host` | origem da conexão Postgres |

Ponto que confunde: `active: false` **não** significa que o painel está sem
banco. O painel usa o cliente Supabase (`saasConfigured`), que é independente do
Postgres/Drizzle opcional. Foi por isso que o diagnóstico do `AdminPanel.tsx`
passou a olhar `saasConfigured === false` (e não `active`).

### 6.2 "Banco marcado offline para sempre" — não acontece

O comportamento foi auditado em `src/db/index.ts`:

```ts
export function getOfflineRetryMs(): number {
  const factor = Math.min(consecutiveFailures, 6);
  return 15000 * Math.pow(2, factor);   // 15s → 16min, com teto
}
```

- `markDbOffline()` **não** é permanente: guarda `lastDbCheck`.
- `isDbCachedOffline()` devolve `true` só até `now - lastDbCheck < retryMs`.
- `markDbOnline()` zera `consecutiveFailures` e volta `isDbOffline = false`.
- O teto de 6 tentativas impede que o backoff cresça sem limite.

Ou seja: **a reconexão é automática** e o estado nunca fica travado.

### 6.3 Códigos padronizados

| Código | Quando | HTTP |
|---|---|---|
| `SAAS_NOT_CONFIGURED` | falta `SUPABASE_SECRET_KEY` | 503 |
| `SAAS_UNREACHABLE` | banco configurado, rede/DNS falhou | 503 |

Ambos vêm com `hint` acionável. Antes, uma falha de rede virava
`500 "Não foi possível consultar…"` — indistinguível de um bug.

### 6.4 Regra "falha ≠ lista vazia"

Implementada em três camadas:

1. **Servidor**: `isRedeIndisponivel()` + `responderIndisponivel()` nos `catch`
   das rotas do painel.
2. **Cliente**: `mensagemDeErroDaApi()` traduz os códigos em frase acionável.
3. **UI**: `AdminPanel` mostra o diagnóstico antes dos KPIs, e cada aba tem
   estado de erro separado do estado vazio.

---

## 7. Fallback local (`src/db/fallbackStore.ts`)

O modo JSON **não substitui dados reais em produção**:

- `isDbCachedOffline()` devolve `true` imediatamente quando
  `hasValidDbConfig()` é falso — ou seja, o fallback só entra quando **não há
  banco configurado**.
- Com banco configurado, ele só entra após falha registrada e dentro da janela
  de retry.

Risco conhecido e documentado: se `SUPABASE_SECRET_KEY` estiver ausente em
produção, o painel responde `SAAS_NOT_CONFIGURED` (honesto). Se `DATABASE_URL`
estiver ausente, o Drizzle cai em JSON local — por isso o diagnóstico mostra os
dois sinais separados.

---

## 8. O que falta de configuração

Ver `PENDENCIAS_CONFIGURACAO.md`. Resumo:

- Nada de banco está pendente: o Supabase está conectado, com schema, dados e
  RLS corretos.
- O que falta é externo ao banco: provedor de pagamento (`STRIPE_SECRET_KEY`),
  envio real de e-mail (`RESEND_API_KEY`) e SMS (`TWILIO_*`).
