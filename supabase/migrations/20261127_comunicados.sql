-- ---------------------------------------------------------------------------
-- Comunicados e notificações direcionadas
--
-- Por que uma tabela nova: até aqui o comunicado era gravado apenas em
-- `localStorage` (src/lib/schoolNewsStore.ts). Isso significava que um
-- comunicado publicado pela diretoria NÃO chegava a nenhum outro aparelho —
-- cada visitante via só os seus. Para "aparecer para todas as escolas" e
-- "notificar o público geral, funcionários etc." a fonte tem de ser o banco.
--
-- Nada escolar é alterado: são tabelas aditivas, com RLS fechada para escrita.
-- ---------------------------------------------------------------------------

-- 1. Comunicados -------------------------------------------------------------

create table if not exists public.school_announcements (
  id            uuid primary key default gen_random_uuid(),
  -- `school_id` nulo = comunicado global (aparece em todas as escolas).
  school_id     uuid references public.schools(id) on delete cascade,
  school_slug   text,
  title         text not null,
  body          text not null,
  category      text not null default 'Comunicado',
  -- Público-alvo da notificação. `all` inclui visitantes sem conta.
  audience      text not null default 'all',
  author_name   text,
  author_email  text,
  -- Prazo de vida. Regra do produto: some 2 dias depois do evento, ou no
  -- prazo configurado. `expires_at` nulo = não expira por tempo.
  expires_at    timestamptz,
  -- 2 dias após o evento vinculado, quando houver.
  event_id      integer,
  event_ends_at timestamptz,
  status        text not null default 'published',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.school_announcements drop constraint if exists school_announcements_status_check;
alter table public.school_announcements
  add constraint school_announcements_status_check
  check (status in ('published', 'hidden', 'deleted'));

alter table public.school_announcements drop constraint if exists school_announcements_audience_check;
alter table public.school_announcements
  add constraint school_announcements_audience_check
  check (audience in ('all', 'students', 'staff', 'families', 'admins'));

create index if not exists school_announcements_school_idx
  on public.school_announcements (school_id, created_at desc);
create index if not exists school_announcements_global_idx
  on public.school_announcements (created_at desc) where school_id is null;
create index if not exists school_announcements_expiry_idx
  on public.school_announcements (expires_at) where status = 'published';

-- 2. Notificações (uma linha por comunicado × público) -----------------------

create table if not exists public.announcement_notifications (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.school_announcements(id) on delete cascade,
  -- Destinatário nominal. Nulo = notificação de broadcast (por público).
  user_id         bigint references public.users(id) on delete cascade,
  audience        text not null default 'all',
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists announcement_notifications_user_idx
  on public.announcement_notifications (user_id, read_at);
create index if not exists announcement_notifications_ann_idx
  on public.announcement_notifications (announcement_id);

-- 3. RLS ---------------------------------------------------------------------
-- Leitura: comunicado publicado e não vencido é público (a vitrine de
-- comunicados gerais precisa abrir para quem não tem conta).
-- Escrita: apenas chave de serviço (Edge Function) — igual ao módulo comercial.

alter table public.school_announcements enable row level security;
alter table public.announcement_notifications enable row level security;

drop policy if exists "announcements_public_read" on public.school_announcements;
create policy "announcements_public_read"
  on public.school_announcements for select
  to anon, authenticated
  using (
    status = 'published'
    and (expires_at is null or expires_at > now())
  );

drop policy if exists "notifications_own_read" on public.announcement_notifications;
create policy "notifications_own_read"
  on public.announcement_notifications for select
  to authenticated
  using (false);  -- o painel usa a Edge Function; o navegador não lê direto

revoke all on public.school_announcements from anon, authenticated;
grant select on public.school_announcements to anon, authenticated;

revoke all on public.announcement_notifications from anon, authenticated;

-- 4. Limpeza automática ------------------------------------------------------
-- "até que sejam alterados, excluídos ou 2 dias depois do evento".
-- A função marca como `deleted` o que venceu; nada é apagado fisicamente,
-- preservando histórico/auditoria.

create or replace function public.expirar_comunicados()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  afetados integer;
begin
  update public.school_announcements
     set status = 'deleted', updated_at = now()
   where status = 'published'
     and expires_at is not null
     and expires_at <= now();
  get diagnostics afetados = row_count;
  return afetados;
end;
$$;

revoke all on function public.expirar_comunicados() from anon, authenticated;

-- 5. Bloco de validação ------------------------------------------------------
do $$
declare
  faltando text[] := '{}';
begin
  if to_regclass('public.school_announcements') is null then
    faltando := array_append(faltando, 'school_announcements');
  end if;
  if to_regclass('public.announcement_notifications') is null then
    faltando := array_append(faltando, 'announcement_notifications');
  end if;
  if to_regprocedure('public.expirar_comunicados()') is null then
    faltando := array_append(faltando, 'expirar_comunicados()');
  end if;
  if array_length(faltando, 1) > 0 then
    raise exception 'Migration incompleta: %', array_to_string(faltando, ', ');
  end if;
end $$;
