-- Migration: 0005_write_policies_lifecycle_and_suggestions.sql
-- Políticas de escrita para as tabelas criadas na 0004.
--
-- Motivo: a 0004 criou apenas políticas de LEITURA. Sem escrita, estas ações
-- falhariam em produção (o app usa a chave publishable, sujeita a RLS):
--   * Restaurar evento excluído  → UPDATE em deleted_events
--   * Excluir definitivamente    → DELETE em deleted_events
--   * Aprovar/descartar sugestão → UPDATE em event_suggestions
--   * IA inserir sugestão        → INSERT em event_suggestions
--
-- IMPORTANTE: estas políticas seguem o MESMO padrão permissivo que
-- `events` e `eventos` já usam neste projeto há tempos
-- ("Allow insert/update/delete ... USING (true)").
-- O endurecimento de RLS + hash de senhas segue PENDENTE e fora do escopo
-- desta rodada (ver AUDITORIA_ELOESCOLA.md, itens D-05 em diante).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='deleted_events' AND policyname='allow_update_deleted_events') THEN
    CREATE POLICY allow_update_deleted_events ON deleted_events FOR UPDATE USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='deleted_events' AND policyname='allow_delete_deleted_events') THEN
    CREATE POLICY allow_delete_deleted_events ON deleted_events FOR DELETE USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_suggestions' AND policyname='allow_update_suggestions') THEN
    CREATE POLICY allow_update_suggestions ON event_suggestions FOR UPDATE USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_suggestions' AND policyname='allow_insert_suggestions') THEN
    CREATE POLICY allow_insert_suggestions ON event_suggestions FOR INSERT WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_suggestions' AND policyname='allow_delete_suggestions') THEN
    CREATE POLICY allow_delete_suggestions ON event_suggestions FOR DELETE USING (true);
  END IF;
END $$;
