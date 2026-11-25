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

-- ---------------------------------------------------------------------------
-- RLS — REVISADO NA RODADA 36
--
-- A versão original deste arquivo criava três policies PERMISSIVAS
-- (`select using (true)`, `insert with check (true)`, `update using (true)`).
-- Isso contrariava o fechamento feito na 20261113: como esta migração (18/11)
-- roda DEPOIS dela (13/11), um ambiente novo recriava o buraco que a rodada 35
-- havia fechado — qualquer visitante com a chave publicável voltaria a poder
-- ler e ESCREVER solicitações de perfil alheias.
--
-- A justificativa antiga ("o app não usa Supabase Auth") não se aplica: quem
-- lê e escreve nesta tabela é o backend Express com a service role, que ignora
-- RLS. O navegador não precisa de acesso nenhum aqui.
--
-- Portanto: nenhuma policy de leitura/escrita pública. As policies antigas são
-- removidas por nome (idempotente) para limpar bancos que já as tenham.
-- ---------------------------------------------------------------------------
drop policy if exists allow_read_profile_requests   on public.profile_change_requests;
drop policy if exists allow_insert_profile_requests on public.profile_change_requests;
drop policy if exists allow_update_profile_requests on public.profile_change_requests;

-- Sem policies + RLS ligada = acesso anon/authenticated negado por padrão.
-- Leitura e escrita acontecem em server.ts, com requireChefeAdmin.
