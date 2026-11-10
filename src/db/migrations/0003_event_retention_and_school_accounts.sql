-- Migration: 0003_event_retention_and_school_accounts.sql
-- Description: Automatic 30-day event retention lifecycle, pg_cron routine, and multi-tenant School Accounts isolation

-- 1. EVENT LIFECYCLE & RETENTION (30 DAYS AFTER CONCLUSION)
ALTER TABLE IF EXISTS events 
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE IF EXISTS eventos 
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS data_fim TIMESTAMP WITH TIME ZONE;

-- Audit and execution log table for automated retention
CREATE TABLE IF NOT EXISTS event_archive_logs (
  id SERIAL PRIMARY KEY,
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  archived_count INTEGER NOT NULL DEFAULT 0,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'success'
);

-- Idempotent PostgreSQL stored function for 30-day event archiving
CREATE OR REPLACE FUNCTION archive_expired_events_routine()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_archived_count INTEGER := 0;
  v_log_details TEXT;
  v_result JSONB;
BEGIN
  -- Mark events whose conclusion date is older than 30 days as archived
  WITH archived_rows AS (
    UPDATE events
    SET 
      is_archived = true,
      status = 'arquivado',
      archived_at = NOW()
    WHERE 
      (is_archived IS FALSE OR is_archived IS NULL)
      AND (
        (ends_at IS NOT NULL AND ends_at < (NOW() - INTERVAL '30 days'))
        OR (
          ends_at IS NULL AND
          make_timestamp(year, month + 1, day, 18, 0, 0) < (NOW() - INTERVAL '30 days')
        )
      )
    RETURNING id
  )
  SELECT count(*) INTO v_archived_count FROM archived_rows;

  -- Also update Portuguese 'eventos' table if present
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'eventos') THEN
    UPDATE eventos
    SET 
      is_archived = true,
      status = 'arquivado',
      archived_at = NOW()
    WHERE 
      (is_archived IS FALSE OR is_archived IS NULL)
      AND data_fim IS NOT NULL 
      AND data_fim < (NOW() - INTERVAL '30 days');
  END IF;

  v_log_details := format('Rotina diária executada com sucesso: %s evento(s) ultrapassando 30 dias de retenção foram arquivados.', v_archived_count);

  -- Insert audit log
  INSERT INTO event_archive_logs (processed_at, archived_count, details, status)
  VALUES (NOW(), v_archived_count, v_log_details, 'success');

  v_result := jsonb_build_object(
    'success', true,
    'archived_count', v_archived_count,
    'message', v_log_details,
    'executed_at', NOW()
  );

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO event_archive_logs (processed_at, archived_count, details, status)
  VALUES (NOW(), 0, SQLERRM, 'error');

  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'executed_at', NOW()
  );
END;
$$;

-- Schedule Supabase pg_cron job if pg_cron extension is available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedue previous if exists to prevent duplicates
    BEGIN
      PERFORM cron.unschedule('daily_event_retention_archive');
    EXCEPTION WHEN OTHERS THEN
      -- No existing schedule
    END;

    -- Schedule daily execution at 03:00 UTC (00:00 Brasília time)
    PERFORM cron.schedule(
      'daily_event_retention_archive',
      '0 3 * * *',
      'SELECT archive_expired_events_routine();'
    );
  END IF;
END $$;

-- 2. SCHOOL ACCOUNTS (CONTAS ESCOLA) & INSTITUTIONAL ISOLATION
CREATE TABLE IF NOT EXISTS school_accounts (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES instituicoes(id) ON DELETE RESTRICT,
  school_name TEXT NOT NULL,
  school_slug TEXT,
  login_identifier TEXT NOT NULL UNIQUE,
  institutional_email TEXT NOT NULL,
  password_hash TEXT,
  representative_name TEXT NOT NULL,
  institutional_contact TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'verified', -- 'pending_verification', 'verified', 'rejected'
  verification_method TEXT NOT NULL DEFAULT 'Verificação oficial pela direção e portaria NRE',
  verified_by TEXT NOT NULL DEFAULT 'ADM Chefe',
  verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  account_status TEXT NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'revoked'
  created_by TEXT NOT NULL DEFAULT 'ADM Chefe',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT unique_active_school_account UNIQUE (school_id)
);

CREATE INDEX IF NOT EXISTS idx_school_accounts_school_id ON school_accounts(school_id);
CREATE INDEX IF NOT EXISTS idx_school_accounts_identifier ON school_accounts(login_identifier);
CREATE INDEX IF NOT EXISTS idx_school_accounts_status ON school_accounts(account_status);

-- Table for School Account Audit Logs
CREATE TABLE IF NOT EXISTS school_account_audit_logs (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL,
  account_id INTEGER,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  details TEXT,
  performed_by TEXT NOT NULL,
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_school_audit_school_id ON school_account_audit_logs(school_id);

-- Enable Row Level Security (RLS) for School Accounts & Strict Isolation
ALTER TABLE school_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_account_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Policy: Only ADM Chefe can create or manage school accounts
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'school_accounts' AND policyname = 'chefe_adm_full_access_school_accounts'
  ) THEN
    CREATE POLICY chefe_adm_full_access_school_accounts ON school_accounts
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM users
          WHERE users.uid = auth.uid()::text
          AND (users.is_admin = true AND users.role IN ('ADMIN', 'ADM Chefe', 'Diretor Geral'))
        )
      );
  END IF;

  -- Policy: School account can only view its own account record
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'school_accounts' AND policyname = 'school_account_view_self'
  ) THEN
    CREATE POLICY school_account_view_self ON school_accounts
      FOR SELECT
      USING (
        login_identifier = auth.jwt()->>'email'
        OR institutional_email = auth.jwt()->>'email'
      );
  END IF;
END $$;
