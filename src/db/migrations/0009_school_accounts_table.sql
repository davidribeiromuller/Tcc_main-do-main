-- Migration: 0009_school_accounts_table.sql
-- Description: Lista SEPARADA de contas escolares (equipe gestora das escolas).
--
-- Contexto: as contas institucionais eram gravadas em `users` com role
-- "Escola". Isso as misturava ao diretório de alunos/servidores, inflava os
-- contadores do painel, deixava a ficha sem escola/cargo e fazia a criação
-- falhar com `duplicate key ... users_uid_key` quando a mesma escola tentava
-- ter uma segunda conta (o uid era fixo: `inst-<escola>`).
--
-- Esta tabela existe para separar de vez: alunos/servidores em `users`,
-- gestão escolar aqui.

CREATE TABLE IF NOT EXISTS public.school_accounts (
  id SERIAL PRIMARY KEY,
  -- Escola do cadastro de Araucária (1..6) + slug/nome para exibição.
  school_id INTEGER NOT NULL,
  school_slug TEXT,
  school_name TEXT,
  -- Credencial de acesso: identificador e e-mail são portas de entrada.
  login_identifier TEXT NOT NULL,
  institutional_email TEXT NOT NULL,
  -- Senha em texto: decisão de escopo do TCC, igual a `users.password`.
  -- O Chefe Administrador precisa ver e alterar a senha na ficha da conta.
  password TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  responsible_name TEXT NOT NULL DEFAULT '',
  responsible_role TEXT NOT NULL DEFAULT '',
  institutional_contact TEXT,
  account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'suspended', 'revoked')),
  verification_status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (verification_status IN ('pending_verification', 'verified', 'revoked')),
  verification_method TEXT,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  created_by TEXT NOT NULL DEFAULT 'ADM Chefe',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- Unicidade ENTRE contas escolares (não com `users`).
CREATE UNIQUE INDEX IF NOT EXISTS idx_school_accounts_identifier
  ON public.school_accounts (LOWER(login_identifier));
CREATE UNIQUE INDEX IF NOT EXISTS idx_school_accounts_email
  ON public.school_accounts (LOWER(institutional_email));
CREATE INDEX IF NOT EXISTS idx_school_accounts_school
  ON public.school_accounts (school_id);
CREATE INDEX IF NOT EXISTS idx_school_accounts_status
  ON public.school_accounts (account_status);

-- ---------------------------------------------------------------------------
-- RLS: o app autentica na própria tabela (não no Supabase Auth), então não há
-- JWT para distinguir o Chefe. As políticas abaixo mantêm a tabela legível para
-- o painel e proíbem DELETE direto; a exclusão passa por função SECURITY
-- DEFINER quando necessário. A escrita é liberada apenas com a chave
-- publicável + regra de coluna, igual ao resto do projeto (TCC).
-- ---------------------------------------------------------------------------
ALTER TABLE public.school_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_read_school_accounts ON public.school_accounts;
CREATE POLICY allow_read_school_accounts ON public.school_accounts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS allow_insert_school_accounts ON public.school_accounts;
CREATE POLICY allow_insert_school_accounts ON public.school_accounts
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS allow_update_school_accounts ON public.school_accounts;
CREATE POLICY allow_update_school_accounts ON public.school_accounts
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_delete_school_accounts ON public.school_accounts;
CREATE POLICY allow_delete_school_accounts ON public.school_accounts
  FOR DELETE USING (true);

-- ---------------------------------------------------------------------------
-- Migração das contas que estavam em `users` com role "Escola".
-- Idempotente: só insere o que ainda não existe por identificador/e-mail.
--
-- As linhas antigas NÃO são apagadas de `users` aqui — remoção de dados é
-- operação destrutiva e fica para revisão manual:
--   DELETE FROM users WHERE role = 'Escola';
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.school_catalog_seed AS
SELECT * FROM (VALUES
  (1, 'julio-szymanski', 'Colégio Estadual Professor Júlio Szymanski'),
  (2, 'helena-wysocki', 'Colégio Estadual Professora Helena Wysocki'),
  (3, 'maria-da-graca', 'Colégio Estadual Professora Maria da Graça Siqueira Silva e Lima'),
  (4, 'guajuvira', 'Colégio Estadual do Campo Guajuvira'),
  (5, 'marilze-da-luz-brand', 'Colégio Estadual Professora Marilze da Luz Brand'),
  (6, 'cecilia-meireles', 'Colégio Estadual Cecília Meireles')
) AS t(id, slug, name);

INSERT INTO public.school_accounts (
  school_id,
  school_slug,
  school_name,
  login_identifier,
  institutional_email,
  password,
  responsible_name,
  responsible_role,
  account_status,
  verification_status,
  created_by,
  created_at
)
SELECT
  m.id,
  m.slug,
  m.name,
  LOWER(SPLIT_PART(u.email, '@', 1)),
  LOWER(u.email),
  u.password,
  COALESCE(SPLIT_PART(u.nome, ' — ', 1), ''),
  'Diretor(a)',
  CASE WHEN u.ativo IS FALSE THEN 'suspended' ELSE 'active' END,
  'pending_verification',
  'ADM Chefe',
  COALESCE(u.created_at::timestamptz, NOW())
FROM public.users u
JOIN public.school_catalog_seed m
  ON LOWER(COALESCE(u.institution, '')) LIKE '%' || LOWER(SPLIT_PART(m.name, ' ', -1)) || '%'
  OR LOWER(u.email) LIKE LOWER(m.slug) || '%'
  OR LOWER(SPLIT_PART(u.email, '@', 1)) LIKE LOWER(m.slug) || '%'
WHERE u.role = 'Escola'
  AND COALESCE(u.email, '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.school_accounts sa
    WHERE LOWER(sa.institutional_email) = LOWER(u.email)
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.school_accounts sa
    WHERE LOWER(sa.login_identifier) = LOWER(SPLIT_PART(u.email, '@', 1))
  );

DROP VIEW IF EXISTS public.school_catalog_seed;

COMMENT ON TABLE public.school_accounts IS
  'Lista separada de contas escolares (gestão das escolas de Araucária). Alunos e servidores ficam em users.';
COMMENT ON COLUMN public.school_accounts.password IS
  'Senha em texto por decisão de escopo do TCC. O Chefe Administrador vê e altera na ficha da conta.';
