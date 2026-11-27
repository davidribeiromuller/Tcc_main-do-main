-- ---------------------------------------------------------------------------
-- Autoria de eventos: quem criou e quem autorizou.
--
-- O pedido: "adicione o nome do funcionário quando autorizar um evento ou
-- adicionar, o nome dele deve aparecer para o adm do topo da pirâmide".
--
-- Até aqui só existia `creator_id` (um número). O ADM via "Diretoria Escolar",
-- genérico, e não sabia qual pessoa criou ou liberou o evento. Sem nome, uma
-- auditoria não responde a pergunta que importa: quem foi.
--
-- Colunas aditivas; nada do que já existe é alterado.
-- ---------------------------------------------------------------------------

alter table public.events
  add column if not exists creator_name text,
  add column if not exists creator_email text,
  add column if not exists authorized_by_name text,
  add column if not exists authorized_by_email text,
  add column if not exists authorized_at timestamptz;

alter table public.eventos
  add column if not exists creator_name text,
  add column if not exists creator_email text,
  add column if not exists authorized_by_name text,
  add column if not exists authorized_by_email text,
  add column if not exists authorized_at timestamptz;

comment on column public.events.creator_name is
  'Nome de quem criou o evento. Exibido para o administrador no painel.';
comment on column public.events.authorized_by_name is
  'Nome de quem autorizou/publicou o evento. Vazio quando criado direto por um ADM.';

create index if not exists events_creator_email_idx on public.events (creator_email);
create index if not exists events_authorized_by_email_idx on public.events (authorized_by_email);

-- Validação: as cinco colunas precisam existir nas duas tabelas.
do $$
declare
  faltando text[] := '{}';
  col text;
  tab text;
begin
  foreach tab in array array['events', 'eventos'] loop
    foreach col in array array[
      'creator_name', 'creator_email',
      'authorized_by_name', 'authorized_by_email', 'authorized_at'
    ] loop
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = tab and column_name = col
      ) then
        faltando := array_append(faltando, tab || '.' || col);
      end if;
    end loop;
  end loop;

  if array_length(faltando, 1) > 0 then
    raise exception 'Migration incompleta: %', array_to_string(faltando, ', ');
  end if;
end $$;
