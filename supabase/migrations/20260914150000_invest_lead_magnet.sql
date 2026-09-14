-- Lead magnet de Invest: "Perfil de Inversor" (perfil-inversor.html), pedido
-- explícito de Walter 14-sep-2026 — portar el patrón de MOY IQ (diagnostico.html
-- + diagnostico_leads + register_diagnostico_lead) a Invest, sin backend hasta
-- capturar el email, y sincronizado al CRM compartido crm_contacts con
-- producto_origen='invest' (esa tabla ya existe, ya permite 'invest' en su
-- check constraint desde su diseño original — ver 20260916000000_crm_contacts.sql
-- en financeos-app, no se toca acá).
--
-- Verificado antes de crear: 'invest_leads' y 'register_invest_lead' no
-- aparecen en ningún .sql de financeos-app ni de este repo — sin colisión de
-- nombres con MOY IQ (ver CLAUDE.md de este repo, sección de la colisión de
-- 'licenses'/'validate_license' resuelta el 13-sep-2026, misma clase de riesgo
-- que motiva esta verificación previa).
--
-- Mismo patrón de seguridad que diagnostico_leads: insert-only para anon vía
-- RPC security definer, sin policy de select/update/delete — una key filtrada
-- no permite listar leads ya guardados.
--
-- Fuera de alcance a propósito (pedido de Walter): NO se construye secuencia
-- de nurture por email para Invest en esta migración. Solo captura + CRM.

create table if not exists public.invest_leads (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  perfil     text,              -- 'conservador' | 'moderado' | 'agresivo'
  score      int,               -- puntaje bruto del quiz (0-100), informativo
  fuente     text,              -- UTM o referrer, mismo patrón que diagnostico_leads
  created_at timestamptz not null default now()
);

alter table public.invest_leads enable row level security;

create policy "invest_leads_insert_anon"
  on public.invest_leads for insert
  to anon
  with check (true);

create or replace function public.register_invest_lead(
  p_email  text,
  p_perfil text default null,
  p_score  int default null,
  p_fuente text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text;
  v_perfil text;
begin
  v_email := trim(p_email);
  if v_email is null or v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false);
  end if;

  v_perfil := nullif(left(coalesce(p_perfil, ''), 20), '');
  if v_perfil is not null and v_perfil not in ('conservador', 'moderado', 'agresivo') then
    v_perfil := null;
  end if;

  if p_score is not null and (p_score < 0 or p_score > 100) then
    p_score := null;
  end if;

  insert into public.invest_leads (email, perfil, score, fuente)
  values (v_email, v_perfil, p_score, nullif(left(coalesce(p_fuente, ''), 60), ''));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.register_invest_lead(text, text, int, text) from public;
grant  execute on function public.register_invest_lead(text, text, int, text) to anon;

-- Sincroniza cada lead nuevo a crm_contacts (producto_origen='invest').
-- security definer porque invest_leads solo permite insert a anon (sin
-- select) — corre con privilegios de owner, igual que
-- sync_diagnostico_lead_to_crm en financeos-app.
create or replace function public.sync_invest_lead_to_crm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.crm_contacts (email, producto_origen, fuente, score, notas)
  values (new.email, 'invest', new.fuente, new.score, new.perfil)
  on conflict (email, producto_origen) do update
    set score = coalesce(excluded.score, crm_contacts.score),
        fuente = coalesce(crm_contacts.fuente, excluded.fuente),
        notas = coalesce(excluded.notas, crm_contacts.notas),
        actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists trg_sync_invest_lead_to_crm on public.invest_leads;
create trigger trg_sync_invest_lead_to_crm
  after insert on public.invest_leads
  for each row execute function public.sync_invest_lead_to_crm();
