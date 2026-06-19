-- ============================================================
-- Migration: corporate/private client fields
-- Run once in Supabase SQL editor. All statements are idempotent.
-- ============================================================

alter table public.clients
  add column if not exists client_type text not null default 'corporate';

alter table public.clients
  add column if not exists company_name text not null default '';

alter table public.clients
  add column if not exists eik text not null default '';

alter table public.clients
  add column if not exists first_name text not null default '';

alter table public.clients
  add column if not exists last_name text not null default '';

alter table public.clients
  drop constraint if exists clients_client_type_check;

alter table public.clients
  add constraint clients_client_type_check
  check (client_type in ('corporate', 'private'));

update public.clients
set
  client_type = coalesce(nullif(client_type, ''), 'corporate'),
  company_name = coalesce(nullif(company_name, ''), name, ''),
  eik = coalesce(nullif(eik, ''), bulstat, '')
where client_type = 'corporate'
  or client_type is null
  or client_type = '';
