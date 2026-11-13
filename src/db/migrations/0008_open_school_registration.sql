-- ============================================================
-- 0008 — Cadastro escolar aberto + proteção de dados do vínculo
-- ============================================================
--
-- Contexto (decisão do autor do TCC):
--   O cadastro de aluno passa a ser ABERTO: qualquer pessoa com e-mail
--   institucional válido e dados coerentes cria a própria conta. O vínculo
--   prévio em `institutional_links` deixa de ser obrigatório e passa a ser
--   OPCIONAL — quando a secretaria cadastra o vínculo, ele é usado para
--   conferir a matrícula e definir a `role` do aluno.
--
-- Dois problemas corrigidos aqui:
--
--   1. `verify_institutional_link` declarava `RETURNS public.institutional_links`.
--      Uma função SQL que retorna tipo composto devolve UMA linha de NULLs
--      quando não encontra nada, em vez de zero linhas. O cliente fazia
--      `row = data[0]` e concluía `found: true` com `role` indefinido —
--      ou seja, o vínculo era considerado encontrado mesmo sem existir.
--      A função agora devolve uma TABELA (zero linhas quando não há vínculo).
--
--   2. As policies de `institutional_links` eram `USING (true)` para SELECT,
--      INSERT e UPDATE, com a chave pública (anon) do app. Qualquer visitante
--      conseguia LER CPF, matrícula, nome completo, data de nascimento e a
--      SENHA PROVISÓRIA de todos os alunos, além de inserir ou alterar linhas.
--      Os acessos diretos são revogados; a conferência passa a acontecer
--      apenas dentro das funções SECURITY DEFINER.

-- ============================================================
-- 1. Conferência de vínculo: retorna linhas, nunca uma linha de NULLs
-- ============================================================

DROP FUNCTION IF EXISTS public.verify_institutional_link(TEXT, TEXT, TEXT);

CREATE FUNCTION public.verify_institutional_link(
  p_institution TEXT,
  p_cpf TEXT,
  p_matricula TEXT
)
RETURNS TABLE (institution TEXT, role TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT l.institution, l.role
  FROM public.institutional_links l
  WHERE l.institution = p_institution
    AND l.cpf = regexp_replace(p_cpf, '\D', '', 'g')
    AND l.matricula = p_matricula
    AND l.status IN ('pending', 'active')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_institutional_link(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_institutional_link(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ============================================================
-- 2. Ativação do vínculo, sem expor a tabela ao cliente
-- ============================================================

CREATE OR REPLACE FUNCTION public.activate_institutional_link(
  p_institution TEXT,
  p_cpf TEXT,
  p_matricula TEXT,
  p_user_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  linhas INTEGER;
BEGIN
  UPDATE public.institutional_links
     SET status = 'active',
         activated_by_user_id = p_user_id,
         activated_at = now(),
         updated_at = now()
   WHERE institution = p_institution
     AND cpf = regexp_replace(p_cpf, '\D', '', 'g')
     AND matricula = p_matricula;

  GET DIAGNOSTICS linhas = ROW_COUNT;
  RETURN linhas > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_institutional_link(TEXT, TEXT, TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_institutional_link(TEXT, TEXT, TEXT, BIGINT) TO anon, authenticated;

-- ============================================================
-- 3. Fecha o acesso direto à tabela
-- ============================================================
-- Sem isso, a chave pública do app lê CPF, matrícula e senha provisória
-- de todos os alunos. As funções acima continuam funcionando porque são
-- SECURITY DEFINER (executam com os privilégios do dono).

DROP POLICY IF EXISTS allow_read_institutional_links ON public.institutional_links;
DROP POLICY IF EXISTS allow_insert_institutional_links ON public.institutional_links;
DROP POLICY IF EXISTS allow_update_institutional_links ON public.institutional_links;

ALTER TABLE public.institutional_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.institutional_links FROM anon, authenticated;

-- A secretaria continua carregando os vínculos pelo painel do Supabase
-- (SQL Editor / Table Editor), que usa uma conexão administrativa.
