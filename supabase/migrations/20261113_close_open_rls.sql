-- =============================================================================
-- Rodada 35 — fechamento das políticas RLS ainda abertas
-- =============================================================================
-- Contexto: a auditoria (Parte 2) fechou `users` e `school_accounts`, mas uma
-- varredura em `pg_policies` mostrou várias tabelas com política para `public`
-- (ou seja: `anon`, sem login nenhum) e `qual: true`. Em linguagem direta:
--
--   deleted_events            → qualquer visitante lia, restaurava e apagava
--   event_suggestions         → qualquer visitante aprovava sugestão e
--                               PUBLICAva um evento oficial da rede
--   profile_change_requests   → qualquer visitante aprovava mudança de
--                               nome/CPF/e-mail de um usuário
--   personal_events           → qualquer visitante lia a agenda pessoal de
--                               todos e podia inserir/apagar
--   school_profiles           → qualquer visitante reescrevia a ficha de uma
--                               escola no diretório
--   event_participations      → qualquer visitante lia e apagava presenças
--   events / eventos          → qualquer visitante criava/editava/apagava
--                               eventos do mural
--
-- Depois desta migração, o painel administrativo NÃO fala mais direto com
-- essas tabelas: tudo passa pelo servidor Express (que usa a chave de serviço
-- e confere o papel de quem pediu). O navegador fica só com leitura pública
-- daquilo que é realmente público.
--
-- Idempotente: pode ser reaplicada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper: o servidor (service_role) ignora RLS; o navegador nunca escreve.
--    Aqui só garantimos que `anon` perde a escrita e `authenticated` mantém
--    apenas o que faz sentido para o próprio usuário.
-- -----------------------------------------------------------------------------

-- 1.1 deleted_events — histórico de eventos excluídos: NINGUÉM no navegador.
drop policy if exists allow_read_deleted_events on public.deleted_events;
drop policy if exists allow_update_deleted_events on public.deleted_events;
drop policy if exists allow_delete_deleted_events on public.deleted_events;

-- 1.2 event_archive_logs — logs da rotina de retenção: somente servidor.
drop policy if exists allow_read_archive_logs on public.event_archive_logs;

-- 1.3 event_suggestions — sugestões da IA: leitura para administração via
--     servidor; nada de escrita pelo navegador.
drop policy if exists allow_read_suggestions on public.event_suggestions;
drop policy if exists allow_insert_suggestions on public.event_suggestions;
drop policy if exists allow_update_suggestions on public.event_suggestions;

-- 1.4 profile_change_requests — fila de aprovação: somente servidor.
drop policy if exists allow_read_profile_requests on public.profile_change_requests;
drop policy if exists allow_insert_profile_requests on public.profile_change_requests;
drop policy if exists allow_update_profile_requests on public.profile_change_requests;

-- 1.5 personal_events — agenda pessoal.
--     O dono continua podendo ler/escrever OS PRÓPRIOS compromissos; a visão
--     "de todos" (painel) passa a vir do servidor.
drop policy if exists personal_events_leitura on public.personal_events;
drop policy if exists personal_events_insercao on public.personal_events;
drop policy if exists personal_events_atualizacao on public.personal_events;
drop policy if exists personal_events_exclusao on public.personal_events;

create policy personal_events_owner_select on public.personal_events
  for select to authenticated
  using (owner_id::text = current_setting('request.jwt.claims', true)::jsonb ->> 'sub');

create policy personal_events_owner_insert on public.personal_events
  for insert to authenticated
  with check (owner_id::text = current_setting('request.jwt.claims', true)::jsonb ->> 'sub');

create policy personal_events_owner_update on public.personal_events
  for update to authenticated
  using (owner_id::text = current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
  with check (owner_id::text = current_setting('request.jwt.claims', true)::jsonb ->> 'sub');

create policy personal_events_owner_delete on public.personal_events
  for delete to authenticated
  using (owner_id::text = current_setting('request.jwt.claims', true)::jsonb ->> 'sub');

-- 1.6 school_profiles — leitura pública (é a ficha do diretório), escrita
--     apenas pelo servidor.
drop policy if exists allow_insert_school_profiles on public.school_profiles;
drop policy if exists allow_update_school_profiles on public.school_profiles;

-- 1.7 event_participations — presenças: leitura aberta não é necessária para
--     o app (o mural vem de `events`). Escrita e exclusão saem do navegador.
drop policy if exists participations_escrita_publica on public.event_participations;
drop policy if exists participations_delete_publico on public.event_participations;
drop policy if exists participations_leitura_publica on public.event_participations;

-- 1.8 events / eventos — o mural é público para LEITURA. Publicar, editar e
--     excluir agora é exclusivo do servidor (rota com requireChefeAdmin /
--     requireAdminOrStaff e auditoria de plataforma).
drop policy if exists "Allow insert events" on public.events;
drop policy if exists "Allow update events" on public.events;
drop policy if exists "Allow delete events" on public.events;
drop policy if exists "Allow insert eventos" on public.eventos;
drop policy if exists "Allow update eventos" on public.eventos;
drop policy if exists "Allow delete eventos" on public.eventos;

-- 1.9 sales_leads — mantém INSERT público (formulário da vitrine), mas garante
--     que a política vale só para INSERT.
drop policy if exists sales_leads_public_read on public.sales_leads;

-- -----------------------------------------------------------------------------
-- 2. Conferência rápida (execute e confira que não sobrou `public / true` em
--    tabela sensível).
-- -----------------------------------------------------------------------------
-- select tablename, policyname, cmd, roles::text
-- from pg_policies
-- where schemaname = 'public' and 'public' = any(roles)
-- order by tablename, cmd;

-- -----------------------------------------------------------------------------
-- 3. Observação operacional
-- -----------------------------------------------------------------------------
-- Sem estas políticas o navegador perde acesso direto; o app continua
-- funcionando porque o painel inteiro passou a usar as rotas do servidor:
--   /api/users, /api/admin/*, /api/events/deleted*, /api/school-profiles
-- Todas exigem sessão e verificam o papel em `users` a cada requisição.
