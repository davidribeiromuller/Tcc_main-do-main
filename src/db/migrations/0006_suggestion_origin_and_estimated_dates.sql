-- Migration: 0006_suggestion_origin_and_estimated_dates.sql
-- Habilita o modo híbrido de descoberta de eventos.
--
-- A partir daqui a aba "Sugestões" recebe candidatos de DUAS fontes:
--   1. local_engine → motor local, sem chave de IA, baseado em eventos
--                     recorrentes com regra de data conhecida.
--   2. ai           → IA externa (Gemini, Claude, OpenAI, OpenRouter, Groq).
--
-- Motivo das colunas:
--   * origin       → permite a interface mostrar de onde veio a sugestão e
--                    o admin calibrar a confiança que dá a cada fonte.
--   * is_estimated → marca datas CALCULADAS (não divulgadas oficialmente).
--                    A interface exibe "Data estimada — confirme na fonte".
--
-- Idempotente: pode ser reexecutada com segurança.

ALTER TABLE IF EXISTS event_suggestions
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS is_estimated BOOLEAN NOT NULL DEFAULT false;

-- Restringe origin aos valores conhecidos (sem quebrar linhas antigas).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_suggestions_origin_check'
      AND conrelid = 'event_suggestions'::regclass
  ) THEN
    ALTER TABLE event_suggestions
      ADD CONSTRAINT event_suggestions_origin_check
      CHECK (origin IN ('ai', 'local_engine'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_event_suggestions_origin
  ON event_suggestions (origin, status);

-- Consulta frequente: quantas sugestões pendentes por origem.
COMMENT ON COLUMN event_suggestions.origin IS
  'Fonte da sugestão: ai (IA externa) ou local_engine (motor local sem chave).';

COMMENT ON COLUMN event_suggestions.is_estimated IS
  'true quando a data foi calculada/estimada e precisa de confirmação na fonte oficial.';
