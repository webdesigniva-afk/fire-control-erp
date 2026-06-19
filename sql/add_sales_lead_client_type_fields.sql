-- ============================================================
-- Migration: corporate/private sales lead fields
-- Run once in Supabase SQL editor. All statements are idempotent.
-- ============================================================

alter table public.sales_opportunities
  add column if not exists lead_client_type text not null default 'corporate';

alter table public.sales_opportunities
  add column if not exists first_name text not null default '';

alter table public.sales_opportunities
  add column if not exists last_name text not null default '';

alter table public.sales_opportunities
  drop constraint if exists sales_opportunities_lead_client_type_check;

alter table public.sales_opportunities
  add constraint sales_opportunities_lead_client_type_check
  check (lead_client_type in ('corporate', 'private'));

update public.sales_opportunities
set
  lead_client_type = coalesce(nullif(lead_client_type, ''), 'corporate'),
  first_name = coalesce(first_name, ''),
  last_name = coalesce(last_name, '')
where lead_client_type is null
  or lead_client_type = ''
  or first_name is null
  or last_name is null;
