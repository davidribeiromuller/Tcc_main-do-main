-- Migration: 0007_school_student_linkage.sql
--
-- Cadastro de conta escolar ("Primeiro acesso").
--
-- Contexto do vínculo institucional:
--   * A INSTITUIÇÃO é dona do domínio de e-mail. Registra o domínio no
--     Registro.br e contrata a hospedagem (Google Workspace / Microsoft 365
--     são as opções usuais). O app não hospeda e-mail: apenas valida o domínio
--     e guarda o vínculo do usuário com a escola.
--   * ALUNO / PROFESSOR / FUNCIONÁRIO recebe o e-mail institucional da escola
--     e, no primeiro acesso, informa CPF, matrícula, data de nascimento e um
--     e-mail pessoal de recuperação, além de trocar a senha provisória.
--
-- A tabela `institutional_links` é a lista que a SECRETARIA carrega antes de
-- liberar os acessos. Sem ela, qualquer pessoa que soubesse um e-mail
-- @escola.pr.gov.br conseguiria entrar como aluno.

BEGIN;

-- ============================================================
-- 1. USERS: campos do vínculo escolar
-- ============================================================

ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS matricula TEXT,
  ADD COLUMN IF NOT EXISTS personal_email TEXT,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  -- Preenchido pela secretaria quando o vínculo é pré-carregado.
  ADD COLUMN IF NOT EXISTS link_verified_at TIMESTAMP WITH TIME ZONE;

-- Uma matrícula não pode estar associada a dois usuários da mesma escola.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_institution_matricula
  ON public.users (institution, matricula)
  WHERE matricula IS NOT NULL;

-- O CPF identifica a pessoa: não pode se repetir.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cpf
  ON public.users (cpf)
  WHERE cpf IS NOT NULL AND cpf <> '';

COMMENT ON COLUMN public.users.matricula IS
  'Matrícula/RA fornecida pela instituição de ensino (vínculo escolar).';
COMMENT ON COLUMN public.users.personal_email IS
  'E-mail pessoal de recuperação (não institucional).';
COMMENT ON COLUMN public.users.must_change_password IS
  'true quando a conta foi criada com senha provisória e exige troca no primeiro acesso.';
COMMENT ON COLUMN public.users.link_verified_at IS
  'Quando o vínculo CPF + matrícula foi confirmado contra institutional_links.';

-- ============================================================
-- 2. INSTITUTIONAL_LINKS (lista pré-carregada pela instituição)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.institutional_links (
  id SERIAL PRIMARY KEY,
  institution TEXT NOT NULL,
  -- Domínio institucional da escola (ex.: escola.pr.gov.br).
  email_domain TEXT NOT NULL,
  cpf TEXT NOT NULL,
  matricula TEXT NOT NULL,
  nome_completo TEXT,
  birthdate DATE,
  role TEXT NOT NULL DEFAULT 'Aluno',
  -- 'pending' = carregado pela escola, ainda não ativado pelo usuário.
  status TEXT NOT NULL DEFAULT 'pending',
  provisioned_password TEXT,
  activated_by_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  activated_at TIMESTAMP WITH TIME ZONE,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT institutional_links_status_check
    CHECK (status IN ('pending', 'active', 'revoked'))
);

-- Um vínculo é único por (escola, CPF) e por (escola, matrícula).
CREATE UNIQUE INDEX IF NOT EXISTS idx_institutional_links_school_cpf
  ON public.institutional_links (institution, cpf);

CREATE UNIQUE INDEX IF NOT EXISTS idx_institutional_links_school_matricula
  ON public.institutional_links (institution, matricula);

CREATE INDEX IF NOT EXISTS idx_institutional_links_status
  ON public.institutional_links (status);

CREATE INDEX IF NOT EXISTS idx_institutional_links_domain
  ON public.institutional_links (email_domain);

COMMENT ON TABLE public.institutional_links IS
  'Vínculos escolares (CPF + matrícula) carregados pela instituição antes do primeiro acesso.';

-- ============================================================
-- 3. RLS
-- ============================================================
--
-- O app autentica na tabela `users` (não no Supabase Auth), então não há
-- `auth.uid()` para usar aqui. O padrão vigente do projeto é liberar leitura e
-- escrita para a chave anon, com a autorização feita na camada de aplicação.
-- Mantemos o mesmo padrão para não quebrar o fluxo existente, mas SEM política
-- de DELETE aberta (que permitiria apagar a base inteira pelo console).

ALTER TABLE public.institutional_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'institutional_links' AND policyname = 'allow_read_institutional_links'
  ) THEN
    CREATE POLICY allow_read_institutional_links
      ON public.institutional_links FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'institutional_links' AND policyname = 'allow_insert_institutional_links'
  ) THEN
    CREATE POLICY allow_insert_institutional_links
      ON public.institutional_links FOR INSERT WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'institutional_links' AND policyname = 'allow_update_institutional_links'
  ) THEN
    CREATE POLICY allow_update_institutional_links
      ON public.institutional_links FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 4. Função de ativação do primeiro acesso
-- ============================================================
--
-- Confere CPF + matrícula + escola contra `institutional_links` antes de
-- permitir o cadastro. Retorna o vínculo quando confere; caso contrário, NULL.
--
-- SECURITY DEFINER para poder ler a tabela mesmo com RLS restritiva.

CREATE OR REPLACE FUNCTION public.verify_institutional_link(
  p_institution TEXT,
  p_cpf TEXT,
  p_matricula TEXT
)
RETURNS public.institutional_links
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.institutional_links
  WHERE institution = p_institution
    AND cpf = regexp_replace(p_cpf, '\D', '', 'g')
    AND matricula = p_matricula
    AND status IN ('pending', 'active')
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.verify_institutional_link(TEXT, TEXT, TEXT) IS
  'Valida CPF + matrícula + escola no primeiro acesso. NULL quando não há vínculo.';

REVOKE ALL ON FUNCTION public.verify_institutional_link(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_institutional_link(TEXT, TEXT, TEXT) TO anon, authenticated;

COMMIT;
