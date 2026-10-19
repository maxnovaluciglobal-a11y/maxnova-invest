-- FIN-12 (auditoría 360, 19-oct-2026): tipo de cambio de la compra por posición.
-- Unidades de la moneda del activo por 1 USD al momento de la compra (p. ej. 900 para CLP).
-- La app lo usa para el costo en USD y muestra el efecto cambiario aparte. Null = no se conoce
-- (posiciones en USD o cargadas antes de este cambio): la app usa el tipo de cambio de hoy.
-- Aditiva e idempotente. authenticated tiene UPDATE por columna en esta tabla (no a nivel de
-- tabla), así que la columna nueva necesita su propio grant; INSERT y SELECT son de tabla.
alter table public.portfolio_holdings add column if not exists fx_at_cost numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'portfolio_holdings_fx_at_cost_positive'
      and conrelid = 'public.portfolio_holdings'::regclass
  ) then
    alter table public.portfolio_holdings
      add constraint portfolio_holdings_fx_at_cost_positive check (fx_at_cost is null or fx_at_cost > 0);
  end if;
end $$;

grant update (fx_at_cost) on public.portfolio_holdings to authenticated;
