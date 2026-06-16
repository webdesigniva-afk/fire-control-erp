-- ============================================================
-- Migration: named spaces for project services + automatic area
-- Run once in Supabase SQL editor. All statements are idempotent.
-- ============================================================

alter table public.projects
  add column if not exists project_service_spaces jsonb not null default '[]'::jsonb;

alter table public.projects
  add column if not exists project_area_sqm numeric not null default 0;

alter table public.projects
  drop constraint if exists projects_project_service_spaces_is_array;

alter table public.projects
  add constraint projects_project_service_spaces_is_array
  check (jsonb_typeof(project_service_spaces) = 'array');

create or replace function public.project_space_numeric_value(
  space jsonb,
  keys text[]
)
returns numeric
language plpgsql
immutable
as $$
declare
  key text;
  raw_value text;
begin
  foreach key in array keys loop
    if space ? key then
      raw_value := space ->> key;

      if raw_value ~ '^\s*-?\d+([.,]\d+)?\s*$' then
        return replace(trim(raw_value), ',', '.')::numeric;
      end if;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.calculate_project_service_spaces_area(
  spaces jsonb
)
returns numeric
language plpgsql
immutable
as $$
declare
  space jsonb;
  direct_area numeric;
  length_value numeric;
  width_value numeric;
  total_area numeric := 0;
begin
  if spaces is null or jsonb_typeof(spaces) <> 'array' then
    return 0;
  end if;

  for space in select value from jsonb_array_elements(spaces) loop
    direct_area := public.project_space_numeric_value(
      space,
      array[
        'area',
        'areaSqm',
        'area_squares',
        'area_sqm',
        'areaM2',
        'sqm',
        'm2',
        'square_meters',
        'size',
        'size_sqm',
        'площ',
        'квадратура'
      ]
    );

    if direct_area is not null then
      total_area := total_area + direct_area;
    else
      length_value := public.project_space_numeric_value(
        space,
        array['length', 'length_m', 'дължина']
      );
      width_value := public.project_space_numeric_value(
        space,
        array['width', 'width_m', 'ширина']
      );

      if length_value is not null and width_value is not null then
        total_area := total_area + (length_value * width_value);
      end if;
    end if;
  end loop;

  return round(total_area, 2);
end;
$$;

create or replace function public.set_project_area_from_service_spaces()
returns trigger
language plpgsql
as $$
declare
  calculated_area numeric;
begin
  calculated_area :=
    public.calculate_project_service_spaces_area(new.project_service_spaces);

  new := jsonb_populate_record(
    new,
    jsonb_build_object(
      'project_area_sqm', calculated_area,
      'project_area', calculated_area,
      'area_sqm', calculated_area,
      'area', calculated_area,
      'sqm', calculated_area,
      'square_meters', calculated_area,
      'size_sqm', calculated_area
    )
  );

  return new;
end;
$$;

drop trigger if exists set_project_area_from_service_spaces on public.projects;

create trigger set_project_area_from_service_spaces
before insert or update of project_service_spaces
on public.projects
for each row
execute function public.set_project_area_from_service_spaces();

update public.projects
set project_area_sqm =
  public.calculate_project_service_spaces_area(project_service_spaces);

do $$
declare
  area_column text;
begin
  foreach area_column in array array[
    'project_area',
    'area_sqm',
    'area',
    'sqm',
    'square_meters',
    'size_sqm'
  ] loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'projects'
        and column_name = area_column
    ) then
      execute format(
        'update public.projects set %I = public.calculate_project_service_spaces_area(project_service_spaces)',
        area_column
      );
    end if;
  end loop;
end;
$$;
