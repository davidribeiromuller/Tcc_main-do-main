-- ---------------------------------------------------------------------------
-- Solicitações de alteração de perfil (rodada 25)
-- ---------------------------------------------------------------------------
-- Regra de negócio:
--   · foto de perfil e telefone para contato → o usuário altera direto;
--   · nome, e-mail, CPF, data de nascimento, gênero, instituição e cargo
--     → só valem depois que um Funcionário ADM aprova no painel.
--
-- A tabela guarda o pedido com o diff (valor novo + valor anterior). O perfil
-- em `users` NÃO é tocado até a aprovação.
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
-- ---------------------------------------------------------------------------

create table if not exists public.profile_change_requests (
  id               bigserial primary key,
  user_id          integer     not null,
  user_uid         text,
  user_nome        text,
  requested_changes jsonb      not null,
  previous_values   jsonb,
  status           text        not null default 'pending',
  created_at       timestamptz not null default now(),
  reviewed_at      timestamptz,
  reviewed_by      text,
  rejection_reason text,
  constraint profile_change_requests_status_chk
    check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists idx_profile_change_requests_status
  on public.profile_change_requests (status, created_at desc);

create index if not exists idx_profile_change_requests_user
  on public.profile_change_requests (user_id, status);

alter table public.profile_change_requests enable row level security;

-- Mesma política permissiva já usada em `users` e `event_suggestions`:
-- o app não usa Supabase Auth, então a checagem de quem aprova acontece na
-- camada de aplicação (apenas administradores veem os botões).
drop policy if exists allow_read_profile_requests   on public.profile_change_requests;
drop policy if exists allow_insert_profile_requests on public.profile_change_requests;
drop policy if exists allow_update_profile_requests on public.profile_change_requests;

create policy allow_read_profile_requests
  on public.profile_change_requests for select using (true);

create policy allow_insert_profile_requests
  on public.profile_change_requests for insert with check (true);

create policy allow_update_profile_requests
  on public.profile_change_requests for update using (true) with check (true);
