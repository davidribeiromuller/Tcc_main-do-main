-- ============================================================================
-- Rodada 26 — informações editáveis das escolas
-- ============================================================================
-- Até aqui, os dados institucionais das 6 escolas de Araucária viviam só em
-- `src/lib/schoolsData.ts` (constantes do bundle). O painel mostrava a conta de
-- acesso da escola, mas não havia como VER o perfil da escola nem corrigir um
-- telefone, e-mail, endereço ou histórico desatualizado.
--
-- Esta tabela guarda só o que o Chefe Administrador editou. O app mescla:
--   base estática (sempre presente) + override desta tabela (campo vazio no
--   banco NÃO apaga o dado estático).
--
-- É idempotente: pode rodar quantas vezes for preciso.
-- ============================================================================

create table if not exists public.school_profiles (
  id bigserial primary key,
  slug text not null unique,
  name text,
  short_name text,
  type text,
  neighborhood text,
  city text,
  state text,
  address text,
  cep text,
  phone text,
  email text,
  website text,
  network text,
  nre text,
  modalities jsonb,
  historical_overview text,
  pedagogical_highlights jsonb,
  infrastructure jsonb,
  latitude double precision,
  longitude double precision,
  image text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists idx_school_profiles_slug on public.school_profiles (slug);

-- Colunas que podem faltar em bancos criados antes desta rodada.
alter table public.school_profiles add column if not exists website text;
alter table public.school_profiles add column if not exists updated_by text;
alter table public.school_profiles add column if not exists image text;

alter table public.school_profiles enable row level security;

-- Leitura aberta: o catálogo de escolas é público (o aluno vê as informações).
drop policy if exists allow_read_school_profiles on public.school_profiles;
create policy allow_read_school_profiles
  on public.school_profiles for select using (true);

drop policy if exists allow_insert_school_profiles on public.school_profiles;
create policy allow_insert_school_profiles
  on public.school_profiles for insert with check (true);

drop policy if exists allow_update_school_profiles on public.school_profiles;
create policy allow_update_school_profiles
  on public.school_profiles for update using (true) with check (true);

-- Observação de segurança: a escrita é feita só pela interface do painel
-- (Chefe Administrador). Como o app não usa Supabase Auth, a RLS é permissiva
-- aqui — mesma situação já registrada para `users` e `profile_change_requests`.
