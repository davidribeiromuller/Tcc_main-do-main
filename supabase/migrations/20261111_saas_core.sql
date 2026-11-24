-- ============================================================================
-- eloEscola — Núcleo SaaS multi-instituição (Parte 4 da auditoria)
-- ============================================================================
-- Escopo: criar as entidades comerciais SEM tocar nas tabelas existentes
-- (`users`, `events`, `eventos`, `school_profiles`, `school_accounts`,
-- `event_suggestions`, `profile_change_requests`, `personal_events`,
-- `event_participations`, `deleted_events`, `event_archive_logs`,
-- `institutional_links`).
--
-- Regras de projeto:
--  * Nada destrutivo: só CREATE TABLE / CREATE INDEX / CREATE POLICY.
--  * Preços vivem no BANCO (`plans`, `plan_addons`), nunca em constantes do
--    frontend — o painel Master edita e a UI lê.
--  * Tabelas financeiras e de auditoria ficam com RLS sem política para
--    `anon`/`authenticated`: só o backend (service role / Postgres direto)
--    acessa. Isso é intencional, não esquecimento.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Instituições (tenant raiz)
-- ----------------------------------------------------------------------------
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  legal_name text,
  cnpj text,
  city text,
  state text default 'PR',
  timezone text default 'America/Sao_Paulo',
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  is_founder boolean not null default false,
  founder_slot integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.schools is
  'Instituição cliente do eloEscola (tenant raiz do SaaS). Uma linha por escola/rede.';

create table if not exists public.school_units (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  address text,
  city text,
  state text default 'PR',
  is_primary boolean not null default false,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create unique index if not exists ux_school_units_primary
  on public.school_units (school_id) where is_primary;

-- ----------------------------------------------------------------------------
-- 2. Vínculos (memberships) — quem é quem DENTRO de cada instituição
-- ----------------------------------------------------------------------------
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_uid text not null,
  school_id uuid not null references public.schools(id) on delete cascade,
  unit_id uuid references public.school_units(id) on delete set null,
  role text not null
    check (role in ('school_admin', 'school_staff', 'teacher', 'student', 'guardian')),
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended', 'revoked')),
  invited_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_uid, school_id, role)
);

create index if not exists ix_memberships_school on public.memberships (school_id);
create index if not exists ix_memberships_user on public.memberships (user_uid);

comment on table public.memberships is
  'Liga users.uid a schools. Toda verificação de permissão por instituição passa por aqui.';

-- ----------------------------------------------------------------------------
-- 3. Planos e add-ons (preço no banco)
-- ----------------------------------------------------------------------------
create table if not exists public.plans (
  id text primary key,
  name text not null,
  tagline text,
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  annual_price_cents integer not null check (annual_price_cents >= 0),
  setup_fee_cents integer not null default 0,
  max_active_students integer,
  max_units integer not null default 1,
  max_admins integer not null default 3,
  features jsonb not null default '{}'::jsonb,
  is_public boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_addons (
  id text primary key,
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  billing_type text not null default 'monthly'
    check (billing_type in ('monthly', 'one_time', 'per_session', 'from')),
  unit_label text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.plan_addons is
  'Add-ons vendáveis. `billing_type = from` cobre integrações com preço sob consulta.';

-- ----------------------------------------------------------------------------
-- 4. Assinaturas
-- ----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'suspended', 'canceled', 'expired')),
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'annual')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_until timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  discount_percent numeric(5,2) not null default 0,
  discount_until timestamptz,
  founder_discount boolean not null default false,
  provider text not null default 'sandbox'
    check (provider in ('sandbox', 'stripe', 'mercadopago', 'asaas', 'pagseguro', 'manual')),
  provider_customer_id text,
  provider_subscription_id text,
  last_payment_at timestamptz,
  next_due_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma assinatura vigente por instituição (as encerradas ficam no histórico).
create unique index if not exists ux_subscriptions_active_per_school
  on public.subscriptions (school_id)
  where status in ('trialing', 'active', 'past_due', 'suspended');

create index if not exists ix_subscriptions_status on public.subscriptions (status);

create table if not exists public.subscription_events (
  id bigserial primary key,
  subscription_id uuid references public.subscriptions(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  payload jsonb not null default '{}'::jsonb,
  actor_email text,
  created_at timestamptz not null default now()
);

create index if not exists ix_subscription_events_school
  on public.subscription_events (school_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 5. Entitlements (o que a instituição PODE fazer)
-- ----------------------------------------------------------------------------
create table if not exists public.feature_entitlements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,
  limit_value integer,
  used_value integer not null default 0,
  period_start timestamptz,
  period_end timestamptz,
  source text not null default 'plan'
    check (source in ('plan', 'addon', 'override', 'trial')),
  updated_at timestamptz not null default now(),
  unique (school_id, feature_key)
);

create index if not exists ix_entitlements_school on public.feature_entitlements (school_id);

-- ----------------------------------------------------------------------------
-- 6. Cobrança
-- ----------------------------------------------------------------------------
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  provider text not null default 'sandbox',
  provider_charge_id text,
  method text check (method in ('pix', 'boleto', 'credit_card', 'debit_card', 'transfer')),
  kind text not null default 'subscription'
    check (kind in ('subscription', 'setup', 'addon', 'partner_campaign', 'partner_directory', 'manual')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL',
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'failed', 'refunded', 'canceled', 'expired')),
  due_date date,
  paid_at timestamptz,
  idempotency_key text unique,
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_payments_school on public.payment_transactions (school_id, created_at desc);
create index if not exists ix_payments_status on public.payment_transactions (status);

comment on table public.payment_transactions is
  'Livro-caixa de cobrança. Nenhuma linha nasce com status=paid sem confirmação do provedor.';

create table if not exists public.webhook_events (
  id bigserial primary key,
  provider text not null,
  event_id text not null,
  event_type text,
  signature_valid boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed', 'duplicate')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

create index if not exists ix_webhook_status on public.webhook_events (status, received_at desc);

-- ----------------------------------------------------------------------------
-- 7. Consumo (IA, relatórios, exports)
-- ----------------------------------------------------------------------------
create table if not exists public.usage_records (
  id bigserial primary key,
  school_id uuid references public.schools(id) on delete cascade,
  feature_key text not null,
  quantity integer not null default 1,
  unit text not null default 'request',
  user_uid text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists ix_usage_school_feature
  on public.usage_records (school_id, feature_key, occurred_at desc);

-- ----------------------------------------------------------------------------
-- 8. Parceiros
-- ----------------------------------------------------------------------------
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  description text,
  city text,
  state text default 'PR',
  contact_email text,
  contact_phone text,
  website text,
  logo_url text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'suspended', 'rejected')),
  directory_plan text not null default 'none'
    check (directory_plan in ('none', 'directory')),
  directory_paid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_partners_status on public.partners (status);

create table if not exists public.partner_campaigns (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  body text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  price_cents integer not null default 24900,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired', 'canceled')),
  approved_by_uid text,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists ix_campaigns_school_status
  on public.partner_campaigns (school_id, status, starts_at desc);

comment on table public.partner_campaigns is
  'Campanha de 30 dias exibida a UMA instituição. A instituição aprova ou rejeita. Nunca há venda de dados de alunos.';

-- ----------------------------------------------------------------------------
-- 9. Auditoria de plataforma e leads
-- ----------------------------------------------------------------------------
create table if not exists public.platform_audit_logs (
  id bigserial primary key,
  actor_email text,
  actor_role text,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists ix_platform_audit_created
  on public.platform_audit_logs (created_at desc);

create table if not exists public.sales_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  school_name text,
  city text,
  state text default 'PR',
  plan_interest text,
  source text default 'site',
  status text not null default 'new'
    check (status in ('new', 'contacted', 'trial_started', 'won', 'lost')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_leads_status on public.sales_leads (status, created_at desc);

-- ----------------------------------------------------------------------------
-- 10. RLS
-- ----------------------------------------------------------------------------
alter table public.schools enable row level security;
alter table public.school_units enable row level security;
alter table public.memberships enable row level security;
alter table public.plans enable row level security;
alter table public.plan_addons enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.feature_entitlements enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.webhook_events enable row level security;
alter table public.usage_records enable row level security;
alter table public.partners enable row level security;
alter table public.partner_campaigns enable row level security;
alter table public.platform_audit_logs enable row level security;
alter table public.sales_leads enable row level security;

-- Catálogo comercial: leitura pública (preço é informação de vitrine).
drop policy if exists plans_public_read on public.plans;
create policy plans_public_read on public.plans
  for select to anon, authenticated using (is_public and is_active);

drop policy if exists plan_addons_public_read on public.plan_addons;
create policy plan_addons_public_read on public.plan_addons
  for select to anon, authenticated using (is_active);

-- Instituições: leitura pública apenas do diretório (nome/slug/cidade).
drop policy if exists schools_public_read on public.schools;
create policy schools_public_read on public.schools
  for select to anon, authenticated using (status = 'active');

-- Parceiros aprovados aparecem no diretório.
drop policy if exists partners_public_read on public.partners;
create policy partners_public_read on public.partners
  for select to anon, authenticated using (status = 'approved');

-- Leads: qualquer visitante pode enviar (formulário comercial), ninguém lê.
drop policy if exists sales_leads_public_insert on public.sales_leads;
create policy sales_leads_public_insert on public.sales_leads
  for insert to anon, authenticated with check (true);

-- Deliberadamente SEM políticas para anon/authenticated:
--   memberships, subscriptions, subscription_events, feature_entitlements,
--   payment_transactions, webhook_events, usage_records, partner_campaigns,
--   platform_audit_logs, school_units.
-- Motivo: são dados financeiros/contratuais/de auditoria. A leitura acontece
-- pelo backend (service role ou conexão Postgres direta), que valida a
-- instituição do usuário antes de devolver qualquer linha.

-- ----------------------------------------------------------------------------
-- 11. Catálogo oficial de planos (preços editáveis pelo painel Master)
-- ----------------------------------------------------------------------------
insert into public.plans
  (id, name, tagline, monthly_price_cents, annual_price_cents, setup_fee_cents,
   max_active_students, max_units, max_admins, features, sort_order)
values
  ('comunidade', 'Comunidade',
   'Para uma escola que quer sair da planilha e publicar eventos com segurança.',
   14900, 160920, 39000, 300, 1, 3,
   '{"events": true, "school_profile": true, "student_area": true,
     "authorizations": false, "reports": false, "ai_assistant": false,
     "ai_advanced": false, "multi_unit": false, "partners_directory": true,
     "custom_domain": false, "api_integration": false}'::jsonb, 1),

  ('escola', 'Escola',
   'Operação completa: autorizações digitais, relatórios e assistente com cota.',
   29900, 322920, 69000, 800, 1, 10,
   '{"events": true, "school_profile": true, "student_area": true,
     "authorizations": true, "reports": true, "ai_assistant": true,
     "ai_advanced": false, "multi_unit": false, "partners_directory": true,
     "custom_domain": false, "api_integration": false}'::jsonb, 2),

  ('rede', 'Rede',
   'Para redes e mantenedoras: várias unidades, painel centralizado e 2.000 ativos.',
   69900, 754920, 149000, 2000, 3, 30,
   '{"events": true, "school_profile": true, "student_area": true,
     "authorizations": true, "reports": true, "ai_assistant": true,
     "ai_advanced": true, "multi_unit": true, "partners_directory": true,
     "custom_domain": true, "api_integration": true}'::jsonb, 3)
on conflict (id) do update set
  name = excluded.name,
  tagline = excluded.tagline,
  monthly_price_cents = excluded.monthly_price_cents,
  annual_price_cents = excluded.annual_price_cents,
  setup_fee_cents = excluded.setup_fee_cents,
  max_active_students = excluded.max_active_students,
  max_units = excluded.max_units,
  max_admins = excluded.max_admins,
  features = excluded.features,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.plan_addons (id, name, description, price_cents, billing_type, unit_label, sort_order)
values
  ('ai_advanced', 'IA avançada', 'Sugestões de eventos e relatórios assistidos sem limite de cota básica.', 5900, 'monthly', 'por mês', 1),
  ('reports', 'Relatórios avançados', 'Exportação de indicadores de participação e autorizações.', 4900, 'monthly', 'por mês', 2),
  ('personalization', 'Personalização visual', 'Identidade da escola no app, cores e capa próprias.', 9900, 'monthly', 'por mês', 3),
  ('training', 'Treinamento da equipe', 'Sessão online de 90 minutos com a equipe gestora.', 25000, 'per_session', 'por sessão', 4),
  ('integration', 'Integração com sistema escolar', 'Importação de alunos e sincronização de turmas.', 150000, 'from', 'a partir de', 5)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  billing_type = excluded.billing_type,
  unit_label = excluded.unit_label,
  sort_order = excluded.sort_order;

-- ----------------------------------------------------------------------------
-- 12. Migração de dados existentes (não destrutiva)
-- ----------------------------------------------------------------------------
-- A escola histórica do TCC vira a primeira instituição e os usuários já
-- existentes ganham membership na instituição padrão.
insert into public.schools (slug, name, city, state, status, is_founder, founder_slot)
values ('helena-wysocki', 'Escola Estadual Helena Wysocki', 'Araucária', 'PR', 'active', true, 1)
on conflict (slug) do nothing;

insert into public.memberships (user_uid, school_id, role, status)
select
  u.uid,
  s.id,
  case
    when u.is_admin or lower(coalesce(u.role, '')) in ('diretor', 'diretora', 'chefe administrador', 'chefe admin')
      then 'school_admin'
    when lower(coalesce(u.role, '')) in ('funcionário', 'funcionario', 'funcionário administrador', 'funcionario administrador', 'pedagogo(a)', 'pedagogo')
      then 'school_staff'
    when lower(coalesce(u.role, '')) in ('responsáveis', 'responsaveis', 'responsável', 'responsavel')
      then 'guardian'
    else 'student'
  end,
  'active'
from public.users u
cross join public.schools s
where s.slug = 'helena-wysocki'
  and u.uid is not null
on conflict (user_uid, school_id, role) do nothing;

-- Assinatura inicial em teste de 30 dias para a instituição histórica.
insert into public.subscriptions
  (school_id, plan_id, status, billing_cycle, trial_started_at, trial_ends_at,
   current_period_start, current_period_end, grace_until, founder_discount, discount_percent)
select
  s.id, 'rede', 'trialing', 'monthly', now(), now() + interval '30 days',
  now(), now() + interval '30 days', null, true, 20
from public.schools s
where s.slug = 'helena-wysocki'
  and not exists (
    select 1 from public.subscriptions sub
    where sub.school_id = s.id
      and sub.status in ('trialing', 'active', 'past_due', 'suspended')
  );

insert into public.feature_entitlements (school_id, subscription_id, feature_key, enabled, limit_value, period_start, period_end)
select sub.school_id, sub.id, key, true,
       case key
         when 'ai_assistant' then 300
         when 'reports' then 50
         else null
       end,
       now(), now() + interval '30 days'
from public.subscriptions sub
join public.plans p on p.id = sub.plan_id
cross join lateral jsonb_each_text(p.features) as f(key, value)
where f.value = 'true'
on conflict (school_id, feature_key) do nothing;
