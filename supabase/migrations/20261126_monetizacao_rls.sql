-- =============================================================================
-- RODADA 45 — Monetização: RLS do módulo comercial
-- =============================================================================
--
-- CONTEXTO
-- --------
-- As tabelas comerciais (plans, subscriptions, payment_transactions, …) vieram
-- da rodada 36 e sobreviveram ao revert da rodada 42. O código cliente, porém,
-- foi removido — e o único acesso restante era RLS ABERTO herdado da rodada 44:
--
--   subscriptions        → anon podia LER e GRAVAR
--   payment_transactions → anon podia LER e GRAVAR
--   webhook_events       → anon podia LER e GRAVAR
--   platform_audit_logs  → anon podia LER e GRAVAR
--   usage_records        → anon podia LER e GRAVAR
--
-- Ou seja: qualquer visitante com a chave publicável (que está no bundle, por
-- definição) conseguia listar a cobrança de TODAS as instituições, ver o livro
-- caixa da plataforma e — pior — dar UPDATE em `subscriptions.status`,
-- promovendo a própria escola para `active` sem pagar. Nada disso passa por
-- autenticação.
--
-- O QUE ESTA MIGRATION FAZ
-- ------------------------
-- 1. Deixa PÚBLICO apenas o que é vitrine comercial: catálogo de planos,
--    adicionais e diretório de parceiros aprovados.
-- 2. Fecha leitura e escrita das tabelas financeiras para `anon`.
--    A leitura da PRÓPRIA instituição passa a exigir JWT (role `authenticated`),
--    filtrada por `school_id`; a escrita passa a ser exclusiva do backend com
--    chave de serviço (que ignora RLS por definição, então não precisa de policy).
-- 3. Mantém `sales_leads` com INSERT público — é o formulário "quero uma
--    demonstração", preenchido antes de existir conta. A leitura é fechada.
--
-- POR QUE `authenticated` E NÃO UM CARGO NOVO
-- -------------------------------------------
-- O pedido proíbe criar hierarquia de cargos. O JWT do Supabase resolve quem é
-- o usuário; QUEM ele é dentro da instituição (school_admin, staff…) é lido de
-- `memberships` pelo backend. O RLS aqui só precisa garantir que ninguém leia a
-- linha de outra escola.
--
-- REVERSÍVEL: o bloco final recria as policies abertas se alguém precisar voltar
-- ao estado anterior em ambiente de teste (comentado, para não rodar por acaso).
--
-- SEGURANÇA: nenhum DROP TABLE, nenhum DELETE, nenhum UPDATE de dado existente.
-- Apenas `create policy` / `drop policy` — todas idempotentes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Catálogo comercial — leitura pública (vitrine em /planos)
-- -----------------------------------------------------------------------------
alter table public.plans       enable row level security;
alter table public.plan_addons enable row level security;

drop policy if exists plans_public_read on public.plans;
create policy plans_public_read on public.plans
  for select to anon, authenticated
  using (is_public and is_active);

drop policy if exists plan_addons_public_read on public.plan_addons;
create policy plan_addons_public_read on public.plan_addons
  for select to anon, authenticated
  using (is_active);

-- O dono da plataforma edita preços pelo backend (service_role).
-- Nenhum cliente anônimo ou autenticado comum escreve no catálogo.
drop policy if exists plans_app_write on public.plans;
drop policy if exists plans_anon_write on public.plans;
drop policy if exists plan_addons_app_write on public.plan_addons;
drop policy if exists plan_addons_anon_write on public.plan_addons;

-- -----------------------------------------------------------------------------
-- 2. Inscrição da instituição — leitura só da PRÓPRIA escola, nunca anônima
-- -----------------------------------------------------------------------------
alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_app_read  on public.subscriptions;
drop policy if exists subscriptions_app_write on public.subscriptions;

-- Só quem tem JWT. `memberships` amarra o `sub` do token à escola; o backend
-- reforça isso ao montar a área de assinatura, mas o RLS já impede a consulta
-- direta de outra instituição.
drop policy if exists subscriptions_own_school_read on public.subscriptions;
create policy subscriptions_own_school_read on public.subscriptions
  for select to authenticated
  using (
    exists (
      select 1
      from public.memberships m
      where m.school_id = subscriptions.school_id
        and m.user_uid = coalesce(
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
          ''
        )
        and m.status = 'active'
        and m.role in ('school_admin', 'school_staff')
    )
  );

-- Escrita de assinatura: SOMENTE backend. Sem policy de escrita para
-- authenticated/anon, o PostgREST devolve 403 e o app precisa passar pela
-- Edge Function (que confere o vínculo e registra auditoria).

-- -----------------------------------------------------------------------------
-- 3. Meios de pagamento — dinheiro: fechado para o navegador
-- -----------------------------------------------------------------------------
alter table public.payment_transactions enable row level security;

drop policy if exists payment_transactions_app_read  on public.payment_transactions;
drop policy if exists payment_transactions_app_write on public.payment_transactions;

-- A instituição vê as PRÓPRIAS cobranças. Comprovante/link só pelo backend.
drop policy if exists payment_transactions_own_school_read on public.payment_transactions;
create policy payment_transactions_own_school_read on public.payment_transactions
  for select to authenticated
  using (
    exists (
      select 1
      from public.memberships m
      where m.school_id = payment_transactions.school_id
        and m.user_uid = coalesce(
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
          ''
        )
        and m.status = 'active'
        and m.role in ('school_admin', 'school_staff')
    )
  );

-- -----------------------------------------------------------------------------
-- 4. Webhooks e auditoria — sem acesso de cliente nenhum
-- -----------------------------------------------------------------------------
alter table public.webhook_events       enable row level security;
alter table public.platform_audit_logs  enable row level security;

drop policy if exists webhook_events_app_read   on public.webhook_events;
drop policy if exists webhook_events_app_write  on public.webhook_events;
drop policy if exists platform_audit_logs_app_read  on public.platform_audit_logs;
drop policy if exists platform_audit_logs_app_write on public.platform_audit_logs;

-- Sem nenhuma policy: RLS ligado + zero policies = ninguém lê pelo PostgREST.
-- O backend usa a chave de serviço, que ignora RLS.

-- -----------------------------------------------------------------------------
-- 5. Consumo e histórico da assinatura
-- -----------------------------------------------------------------------------
alter table public.usage_records        enable row level security;
alter table public.subscription_events  enable row level security;
alter table public.feature_entitlements enable row level security;

drop policy if exists usage_records_app_read   on public.usage_records;
drop policy if exists usage_records_app_write  on public.usage_records;
drop policy if exists subscription_events_app_read  on public.subscription_events;
drop policy if exists subscription_events_app_write on public.subscription_events;
drop policy if exists feature_entitlements_app_read  on public.feature_entitlements;
drop policy if exists feature_entitlements_app_write on public.feature_entitlements;

-- Uso/entitlements da própria escola: leitura. Escrita só backend (é o que
-- impede alguém de inflar a própria cota de IA ou ligar um recurso premium).
drop policy if exists usage_records_own_school_read on public.usage_records;
create policy usage_records_own_school_read on public.usage_records
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.school_id = usage_records.school_id
        and m.user_uid = coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')
        and m.status = 'active'
    )
  );

drop policy if exists feature_entitlements_own_school_read on public.feature_entitlements;
create policy feature_entitlements_own_school_read on public.feature_entitlements
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.school_id = feature_entitlements.school_id
        and m.user_uid = coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')
        and m.status = 'active'
    )
  );

drop policy if exists subscription_events_own_school_read on public.subscription_events;
create policy subscription_events_own_school_read on public.subscription_events
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.school_id = subscription_events.school_id
        and m.user_uid = coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')
        and m.status = 'active'
        and m.role in ('school_admin', 'school_staff')
    )
  );

-- -----------------------------------------------------------------------------
-- 6. Parceiros — diretório aprovado é público, gestão é do dono
-- -----------------------------------------------------------------------------
alter table public.partners           enable row level security;
alter table public.partner_campaigns  enable row level security;

drop policy if exists partners_public_read       on public.partners;
drop policy if exists partner_campaigns_app_read  on public.partner_campaigns;
drop policy if exists partner_campaigns_app_write on public.partner_campaigns;

-- Diretório: só parceiro aprovado e com assinatura de diretório vigente.
drop policy if exists partners_directory_public_read on public.partners;
create policy partners_directory_public_read on public.partners
  for select to anon, authenticated
  using (
    status = 'approved'
    and (
      directory_paid_until is null
      or directory_paid_until >= current_date
    )
  );

-- Campanhas institucionais aprovadas e vigentes podem ser lidas publicamente
-- (é conteúdo patrocinado institucional, não dado de aluno).
drop policy if exists partner_campaigns_public_read on public.partner_campaigns;
create policy partner_campaigns_public_read on public.partner_campaigns
  for select to anon, authenticated
  using (status = 'approved' and starts_at <= now() and (ends_at is null or ends_at >= now()));

-- -----------------------------------------------------------------------------
-- 7. Leads — formulário de demonstração é público; a lista NÃO
-- -----------------------------------------------------------------------------
alter table public.sales_leads enable row level security;

drop policy if exists sales_leads_public_insert on public.sales_leads;

-- Só INSERT, e só se o e-mail não estiver vazio. Não há policy de SELECT:
-- um lead traz nome, e-mail e telefone de uma pessoa — dado pessoal que
-- ninguém de fora precisa listar.
create policy sales_leads_public_insert on public.sales_leads
  for insert to anon, authenticated
  with check (email is not null and length(btrim(email)) > 3);

-- -----------------------------------------------------------------------------
-- 8. Vínculos e unidades — leitura da própria escola, escrita pelo backend
-- -----------------------------------------------------------------------------
alter table public.memberships   enable row level security;
alter table public.school_units  enable row level security;
alter table public.schools       enable row level security;

drop policy if exists memberships_app_read   on public.memberships;
drop policy if exists memberships_app_write  on public.memberships;
drop policy if exists school_units_app_read  on public.school_units;
drop policy if exists school_units_app_write on public.school_units;

drop policy if exists memberships_own_read on public.memberships;
create policy memberships_own_read on public.memberships
  for select to authenticated
  using (
    user_uid = coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')
  );

drop policy if exists school_units_own_read on public.school_units;
create policy school_units_own_read on public.school_units
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.school_id = school_units.school_id
        and m.user_uid = coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')
        and m.status = 'active'
    )
  );

drop policy if exists schools_public_read on public.schools;
create policy schools_public_read on public.schools
  for select to anon, authenticated
  using (status = 'active');

-- -----------------------------------------------------------------------------
-- 9. Conferência: nenhuma tabela comercial pode ficar sem RLS
-- -----------------------------------------------------------------------------
do $$
declare
  sem_rls text;
begin
  select string_agg(c.relname::text, ', ' order by c.relname)
    into sem_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in (
      'plans','plan_addons','schools','school_units','memberships','subscriptions',
      'subscription_events','feature_entitlements','payment_transactions',
      'webhook_events','usage_records','partners','partner_campaigns',
      'platform_audit_logs','sales_leads'
    )
    and not c.relrowsecurity;

  if sem_rls is not null then
    raise exception 'Tabela comercial sem RLS após a migration: %', sem_rls;
  end if;

  raise notice 'Rodada 45: RLS conferido nas 15 tabelas comerciais.';
end $$;

-- -----------------------------------------------------------------------------
-- REVERSÃO (não executar automaticamente)
-- -----------------------------------------------------------------------------
-- Para voltar ao estado aberto da rodada 44 em um ambiente de teste:
--
--   drop policy if exists subscriptions_own_school_read on public.subscriptions;
--   create policy subscriptions_app_read on public.subscriptions
--     for select to anon, authenticated using (true);
--   create policy subscriptions_app_write on public.subscriptions
--     for all to anon, authenticated using (true) with check (true);
--
-- Repita o mesmo par para payment_transactions, webhook_events,
-- platform_audit_logs, usage_records. NÃO faça isso em produção: é exatamente
-- a configuração que permite a qualquer visitante alterar o próprio status de
-- assinatura.
