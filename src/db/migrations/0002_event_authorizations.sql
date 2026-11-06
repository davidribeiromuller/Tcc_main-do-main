-- Migration: 0002_event_authorizations.sql
-- Description: Parental Attendance Authorization System with Digital Handwritten Signature for EloEscola
-- Compliant with LGPD and ECA guidelines for minors

CREATE TABLE IF NOT EXISTS event_attendance_authorizations (
  id TEXT PRIMARY KEY,
  event_id INTEGER NOT NULL,
  student_user_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_school TEXT,
  student_class TEXT,
  guardian_full_name TEXT NOT NULL,
  guardian_relationship TEXT NOT NULL,
  guardian_contact TEXT,
  authorization_text TEXT NOT NULL,
  consent_version TEXT NOT NULL DEFAULT 'v1.0-2026',
  declaration_accepted BOOLEAN NOT NULL DEFAULT true,
  signed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  signature_path TEXT NOT NULL,
  verification_method TEXT NOT NULL DEFAULT 'digital_handwritten_signature',
  verification_status TEXT NOT NULL DEFAULT 'confirmed',
  status TEXT NOT NULL DEFAULT 'authorized',
  event_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  revoked_at TIMESTAMP WITH TIME ZONE
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_event_auth_event_id ON event_attendance_authorizations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_auth_student_id ON event_attendance_authorizations(student_user_id);
CREATE INDEX IF NOT EXISTS idx_event_auth_status ON event_attendance_authorizations(status);

-- Enable Row Level Security (RLS) for data governance and LGPD compliance
ALTER TABLE event_attendance_authorizations ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies
DO $$
BEGIN
  -- Read Policy: Students can view their own authorization records; school staff and admins can view authorizations for their events
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'event_attendance_authorizations' 
    AND policyname = 'allow_read_authorizations'
  ) THEN
    CREATE POLICY allow_read_authorizations ON event_attendance_authorizations
      FOR SELECT
      USING (
        auth.uid()::text = student_user_id
        OR EXISTS (
          SELECT 1 FROM users
          WHERE users.uid = auth.uid()::text
          AND (users.is_admin = true OR users.role IN ('ADMIN', 'Diretor', 'Pedagogo(a)', 'Professor', 'Funcionário', 'ADM Chefe'))
        )
      );
  END IF;

  -- Insert Policy: Authenticated users (students or parents logging for student) can submit authorizations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'event_attendance_authorizations' 
    AND policyname = 'allow_insert_authorizations'
  ) THEN
    CREATE POLICY allow_insert_authorizations ON event_attendance_authorizations
      FOR INSERT
      WITH CHECK (
        auth.uid()::text = student_user_id
        OR auth.uid() IS NOT NULL
      );
  END IF;

  -- Update Policy: Only school staff and admins can revoke or update verification status
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'event_attendance_authorizations' 
    AND policyname = 'allow_update_authorizations'
  ) THEN
    CREATE POLICY allow_update_authorizations ON event_attendance_authorizations
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM users
          WHERE users.uid = auth.uid()::text
          AND (users.is_admin = true OR users.role IN ('ADMIN', 'Diretor', 'Pedagogo(a)', 'ADM Chefe'))
        )
      );
  END IF;
END $$;
