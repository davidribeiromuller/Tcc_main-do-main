-- Migration: 0004_event_lifecycle_3days_and_ai_suggestions.sql
-- Description:
--   * Retenção de eventos: sai do app 3 dias após o término e vai para a lista
--     de eventos excluídos (recuperável).
--   * Tabela `deleted_events` como lista de excluídos (snapshot completo).
--   * Tabela `event_suggestions` para a IA propor eventos.
--   * Rotina diária agendada via pg_cron (funciona sem backend Express).
--
-- Idempotente: pode ser reexecutada com segurança.

-- ============================================================
-- 1. RETENTION POLICY (3 dias depois do término)
-- ============================================================

-- 1.1 Colunas de ciclo de vida em `events` (inglês)
ALTER TABLE IF EXISTS events
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- 1.2 Colunas de ciclo de vida em `eventos` (português)
ALTER TABLE IF EXISTS eventos
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- 1.3 Log de execução da rotina
CREATE TABLE IF NOT EXISTS event_archive_logs (
  id SERIAL PRIMARY KEY,
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  archived_count INTEGER NOT NULL DEFAULT 0,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'success'
);

-- 1.4 Lista de eventos excluídos (recuperável)
--     Guardamos o payload completo para permitir restauração fiel.
CREATE TABLE IF NOT EXISTS deleted_events (
  id SERIAL PRIMARY KEY,
  source_table TEXT NOT NULL,              -- 'events' | 'eventos'
  source_id INTEGER NOT NULL,              -- id original na tabela de origem
  title TEXT NOT NULL,
  payload JSONB NOT NULL,                  -- snapshot completo do evento
  event_ends_at TIMESTAMP WITH TIME ZONE,  -- quando o evento terminou
  deleted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deletion_reason TEXT NOT NULL DEFAULT 'auto_retention_3d',
  deleted_by TEXT DEFAULT 'system:retention_routine',
  restored_at TIMESTAMP WITH TIME ZONE,
  restored_event_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_deleted_events_deleted_at
  ON deleted_events (deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_events_source
  ON deleted_events (source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_deleted_events_active
  ON deleted_events (restored_at) WHERE restored_at IS NULL;

-- ============================================================
-- 2. AI EVENT SUGGESTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS event_suggestions (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  location TEXT,
  address TEXT,
  city TEXT,
  category TEXT,
  description TEXT,
  requirements TEXT,
  website TEXT,
  image TEXT,
  day INTEGER,
  month INTEGER,          -- 0-indexed, igual ao restante do app
  year INTEGER,
  time TEXT,
  is_paid BOOLEAN DEFAULT false,
  price TEXT,
  school_name TEXT,

  -- Rastreabilidade da sugestão
  source_name TEXT,       -- de onde a IA tirou a informação
  source_url TEXT,
  ai_confidence NUMERIC(4,3),  -- 0.000 a 1.000
  ai_reasoning TEXT,
  fingerprint TEXT,       -- deduplicação título+data+local

  status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by TEXT,
  approved_event_id INTEGER,
  approved_table TEXT,
  rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_suggestions_status
  ON event_suggestions (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_suggestions_fingerprint
  ON event_suggestions (fingerprint) WHERE fingerprint IS NOT NULL;

-- ============================================================
-- 3. ROTINA DE RETENÇÃO (3 DIAS)
-- ============================================================
-- Regra: evento sai do app 3 dias após o seu término.
--  * `events`: usa ends_at quando existir; senão monta o datetime a partir de
--    year/month(0-indexed)/day/time e considera 4h de duração (evita arquivar
--    um evento que ainda está acontecendo).
--  * `eventos`: usa data_fim; senão data_inicio.
-- Ambas preservam o payload integral em deleted_events.

CREATE OR REPLACE FUNCTION archive_expired_events_routine()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_retention_days CONSTANT INTEGER := 3;
  v_events_count INTEGER := 0;
  v_eventos_count INTEGER := 0;
  v_details TEXT;
BEGIN
  -- ---------- 1. Tabela `events` ----------
  WITH candidatos AS (
    SELECT
      e.id,
      e.title,
      to_jsonb(e) AS payload,
      COALESCE(
        e.ends_at,
        make_timestamp(e.year, e.month + 1, e.day,
                       COALESCE(NULLIF(split_part(e.time, ':', 1), '')::int, 18),
                       COALESCE(NULLIF(split_part(e.time, ':', 2), '')::int, 0),
                       0) + INTERVAL '4 hours'
      ) AS ends_at_calc
    FROM events e
    WHERE COALESCE(e.is_archived, false) = false
  ),
  vencidos AS (
    SELECT * FROM candidatos
    WHERE ends_at_calc IS NOT NULL
      AND ends_at_calc < (NOW() - (v_retention_days || ' days')::interval)
  ),
  inseridos AS (
    INSERT INTO deleted_events (
      source_table, source_id, title, payload, event_ends_at,
      deletion_reason, deleted_by
    )
    SELECT
      'events', id, COALESCE(title, 'Evento sem título'), payload, ends_at_calc,
      'auto_retention_3d', 'system:retention_routine'
    FROM vencidos
    RETURNING source_id
  ),
  marcados AS (
    UPDATE events
    SET is_archived = true,
        status = 'excluido',
        archived_at = NOW()
    WHERE id IN (SELECT source_id FROM inseridos)
    RETURNING id
  )
  SELECT count(*) INTO v_events_count FROM marcados;

  -- ---------- 2. Tabela `eventos` ----------
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'eventos'
  ) THEN
    WITH candidatos AS (
      SELECT
        ev.id,
        ev.titulo AS title,
        to_jsonb(ev) AS payload,
        COALESCE(ev.data_fim, ev.data_inicio) AS ends_at_calc
      FROM eventos ev
      WHERE COALESCE(ev.is_archived, false) = false
    ),
    vencidos AS (
      SELECT * FROM candidatos
      WHERE ends_at_calc IS NOT NULL
        AND ends_at_calc < (NOW() - (v_retention_days || ' days')::interval)
    ),
    inseridos AS (
      INSERT INTO deleted_events (
        source_table, source_id, title, payload, event_ends_at,
        deletion_reason, deleted_by
      )
      SELECT
        'eventos', id, COALESCE(title, 'Evento sem título'), payload, ends_at_calc,
        'auto_retention_3d', 'system:retention_routine'
      FROM vencidos
      RETURNING source_id
    ),
    marcados AS (
      UPDATE eventos
      SET is_archived = true,
          status = 'excluido',
          archived_at = NOW()
      WHERE id IN (SELECT source_id FROM inseridos)
      RETURNING id
    )
    SELECT count(*) INTO v_eventos_count FROM marcados;
  END IF;

  v_details := format(
    'Retenção de %s dias: %s evento(s) de events e %s de eventos movidos para a lista de excluídos.',
    v_retention_days, v_events_count, v_eventos_count
  );

  INSERT INTO event_archive_logs (processed_at, archived_count, details, status)
  VALUES (NOW(), v_events_count + v_eventos_count, v_details, 'success');

  RETURN jsonb_build_object(
    'success', true,
    'retention_days', v_retention_days,
    'events_archived', v_events_count,
    'eventos_archived', v_eventos_count,
    'total', v_events_count + v_eventos_count,
    'message', v_details,
    'executed_at', NOW()
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO event_archive_logs (processed_at, archived_count, details, status)
  VALUES (NOW(), 0, SQLERRM, 'error');

  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- 4. AGENDAMENTO (pg_cron)
-- ============================================================
-- Roda todo dia às 03:15 UTC (00:15 em Brasília).
-- Necessário porque o servidor Express (que antes rodava o setInterval de
-- retenção) NÃO é publicado no GitHub Pages — em produção ele nunca executava.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('event-retention-3d')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'event-retention-3d');

SELECT cron.schedule(
  'event-retention-3d',
  '15 3 * * *',
  $$SELECT archive_expired_events_routine();$$
);

-- ============================================================
-- 5. RLS das novas tabelas
-- ============================================================
ALTER TABLE deleted_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_archive_logs ENABLE ROW LEVEL SECURITY;

-- Leitura pública dos logs e sugestões (qualquer nível hierárquico pode ver).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_archive_logs' AND policyname='allow_read_archive_logs') THEN
    CREATE POLICY allow_read_archive_logs ON event_archive_logs FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_suggestions' AND policyname='allow_read_suggestions') THEN
    CREATE POLICY allow_read_suggestions ON event_suggestions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='deleted_events' AND policyname='allow_read_deleted_events') THEN
    CREATE POLICY allow_read_deleted_events ON deleted_events FOR SELECT USING (true);
  END IF;
END $$;
