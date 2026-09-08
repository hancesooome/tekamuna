-- Persistent, private operational telemetry for the admin dashboard.
-- The service-role Worker is the only client allowed to read or write these tables.

create table if not exists public.api_usage_logs (
  id text primary key,
  api_name text not null check (api_name in ('tavily', 'tavily2', 'groq', 'openrouter', 'openrouter2', 'gemini')),
  endpoint text not null,
  method text not null,
  duration_ms integer not null check (duration_ms >= 0),
  success boolean not null,
  status_code integer,
  error_message text,
  quota_remaining jsonb,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  created_at timestamptz not null default now()
);

-- Also upgrades an installation where an earlier draft of this migration ran.
alter table public.api_usage_logs add column if not exists input_tokens integer;
alter table public.api_usage_logs add column if not exists output_tokens integer;
alter table public.api_usage_logs add column if not exists total_tokens integer;

create index if not exists api_usage_logs_created_at_idx
  on public.api_usage_logs (created_at desc);
create index if not exists api_usage_logs_api_created_at_idx
  on public.api_usage_logs (api_name, created_at desc);
create index if not exists api_usage_logs_errors_idx
  on public.api_usage_logs (created_at desc) where success = false;

alter table public.api_usage_logs enable row level security;
revoke all on public.api_usage_logs from anon, authenticated;

create table if not exists public.user_search_history (
  id uuid primary key default gen_random_uuid(),
  claim text not null check (char_length(claim) between 5 and 1000),
  claim_normalized text not null,
  category text,
  verdict text check (verdict is null or verdict in ('true', 'false', 'misleading', 'unverified')),
  confidence integer check (confidence is null or confidence between 0 and 100),
  cached boolean not null default false,
  status text not null check (status in ('completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists user_search_history_created_at_idx
  on public.user_search_history (created_at desc);
create index if not exists user_search_history_claim_idx
  on public.user_search_history (claim_normalized, created_at desc);

alter table public.user_search_history enable row level security;
revoke all on public.user_search_history from anon, authenticated;

comment on table public.api_usage_logs is
  'Private external API telemetry. Does not store prompts, credentials, or response bodies.';
comment on table public.user_search_history is
  'Private history of claims submitted to the verification pipeline; contains no IP address or user identifier.';
