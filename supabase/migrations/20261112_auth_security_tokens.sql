-- ============================================================================
-- eloEscola — Tokens de recuperação, sessões e LGPD (Parte 2 e Parte 15)
-- ============================================================================
-- Substitui os mapas em memória (`resetSessionsMap`, `phoneOtpMap`) que:
--  - se perdiam a cada reinício do servidor;
--  - não funcionavam com mais de uma instância;
--  - guardavam o código OTP em texto claro na memória do processo.
--
-- Nada aqui é legível pelo navegador: RLS ligada e ZERO políticas para
-- `anon`/`authenticated`. Só o backend (service role) toca nestas tabelas.
-- ============================================================================

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  -- SHA-256 do token entregue ao usuário. O valor original nunca é gravado.
  token_hash text not null unique,
  user_uid text,
  email text not null,
  channel text not null check (channel in ('email','sms')),
  -- SHA-256 do código de 6 dígitos (quando por SMS).
  code_hash text,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null,
  used_at timestamptz,
  requested_ip text,
  created_at timestamptz not null default now()
);

create index if not exists ix_prt_email on public.password_reset_tokens (email, created_at desc);
create index if not exists ix_prt_expires on public.password_reset_tokens (expires_at);
alter table public.password_reset_tokens enable row level security;

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  user_uid text not null,
  via text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists ix_auth_sessions_user on public.auth_sessions (user_uid, created_at desc);
alter table public.auth_sessions enable row level security;

-- Registro de consentimento (LGPD — Parte 15). Base legal e versão da política.
create table if not exists public.consent_records (
  id bigserial primary key,
  user_uid text,
  email text,
  consent_type text not null,
  policy_version text not null,
  granted boolean not null default true,
  ip text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ix_consent_user on public.consent_records (user_uid, created_at desc);
alter table public.consent_records enable row level security;

-- Canal do titular (LGPD): acesso, correção, exclusão, portabilidade.
create table if not exists public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  requester_email text not null,
  requester_name text,
  request_type text not null check (request_type in ('access','correction','deletion','portability','info')),
  details text,
  status text not null default 'open' check (status in ('open','in_progress','completed','rejected')),
  handled_by text,
  handled_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now()
);

create index if not exists ix_dsr_status on public.data_subject_requests (status, created_at desc);
alter table public.data_subject_requests enable row level security;
