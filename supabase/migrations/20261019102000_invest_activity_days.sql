-- C-10 (auditoría 360, INV-3, 19-oct-2026): medir el uso real de Invest.
--
-- El disparador de cobro de Invest es 100 usuarios activos por semana (checkpoint del 5-nov), y
-- hoy no se puede medir: el login y `profiles` se comparten con MOY IQ, así que una cuenta que
-- solo usa MOY IQ también tiene fila. Esta tabla guarda una fila por cuenta y por día en que se
-- abrió la app de Invest con la sesión iniciada.
--
-- La app llama a invest_record_activity() una vez por día y por dispositivo. La función inserta con
-- ON CONFLICT DO NOTHING la fila de la cuenta que llama y del día de hoy (fecha UTC, la pone el
-- servidor). Cada cuenta solo puede insertar su propia fila, y solo la de hoy. Nadie lee desde el
-- cliente: solo service_role y postgres, que no pasan por RLS.
--
-- Por qué una función y no un upsert directo desde supabase-js: PostgREST traduce "ignorar
-- duplicados" a ON CONFLICT ("day", "user_id") DO NOTHING, y con un objetivo de conflicto
-- Postgres exige permiso SELECT sobre esas columnas y una política de SELECT que deje ver la fila.
-- Eso abriría la lectura al cliente. Con la función no hace falta (probado con PostgREST real y
-- supabase-js 2.112).
--
-- Aditiva e idempotente: se puede correr más de una vez. No toca ninguna tabla existente.
-- Consulta de WAU: ver RUNBOOK.md, sección 6.

create table if not exists public.invest_activity_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default ((now() at time zone 'utc')::date),
  primary key (user_id, day)
);

comment on table public.invest_activity_days is
  'Un día por cuenta en que se abrió MOY IQ Invest con sesión (fecha UTC). Mide los usuarios activos por semana. Solo escribe la propia cuenta; solo lee service_role.';

alter table public.invest_activity_days enable row level security;

-- Los permisos por defecto de `public` en este proyecto dan todo a anon y authenticated.
revoke all on table public.invest_activity_days from public, anon, authenticated;
grant insert on table public.invest_activity_days to authenticated;
grant select, insert, delete on table public.invest_activity_days to service_role;

-- Una fila propia y de hoy: nadie puede inventar otros días, así que una cuenta suma como máximo
-- una fila por día.
drop policy if exists invest_activity_days_insert_own on public.invest_activity_days;
create policy invest_activity_days_insert_own on public.invest_activity_days
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and day = ((now() at time zone 'utc')::date)
  );

-- Lo que llama la app (supabase.rpc('invest_record_activity')). security definer con search_path
-- vacío: corre como dueño, así que no necesita permisos de tabla para el cliente, y la identidad
-- sale del JWT (auth.uid()), nunca de un parámetro.
create or replace function public.invest_record_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;
  insert into public.invest_activity_days (user_id)
  values ((select auth.uid()))
  on conflict (user_id, day) do nothing;
end;
$$;

revoke all on function public.invest_record_activity() from public, anon;
grant execute on function public.invest_record_activity() to authenticated, service_role;

-- Usuarios activos por semana ISO (lunes a domingo, fecha UTC). security_invoker: la vista corre
-- con los permisos de quien la consulta, así que no abre la tabla a nadie más.
create or replace view public.invest_weekly_active
  with (security_invoker = true) as
select
  w.week_start,
  to_char(w.week_start, 'IYYY-"W"IW') as iso_week,
  count(distinct w.user_id)           as wau
from (
  select user_id, day - (extract(isodow from day)::int - 1) as week_start
  from public.invest_activity_days
) w
group by w.week_start
order by w.week_start desc;

comment on view public.invest_weekly_active is
  'WAU de Invest por semana ISO: cuentas distintas que abrieron la app al menos un día. Solo service_role.';

revoke all on table public.invest_weekly_active from public, anon, authenticated;
grant select on table public.invest_weekly_active to service_role;
