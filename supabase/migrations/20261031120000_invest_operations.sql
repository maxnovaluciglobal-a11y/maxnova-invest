-- Efectivo del portafolio (Capital Planner #1 a #4, 31-oct-2026): libro de operaciones de Invest.
--
-- Hasta ahora las operaciones vivían solo en el navegador (localStorage), así que el efectivo y lo
-- aportado no se podían ver desde otro dispositivo ni desde MOY IQ. Esta tabla guarda cada compra,
-- venta, depósito, retiro, dividendo y bono de la cuenta. El id lo genera el cliente (uuid) para que
-- subir dos veces la misma operación no la duplique. `portfolio_holdings` no cambia: el panel
-- de MOY IQ la sigue leyendo igual.
--
-- `cash`: la compra o venta pasó por el efectivo. Null = operación anterior a este libro.
-- `seq`: orden de carga en el dispositivo, desempata operaciones de una misma fecha.
-- `edited`: el monto se cambió respecto del cálculo (✱ en Movimientos).
-- `source`: 'moyiq' si el depósito viene del aporte marcado en MOY IQ; evita registrarlo dos veces.
--
-- Aditiva e idempotente. No toca ninguna tabla existente. Si aún no se aplica, la app sigue
-- funcionando solo en este navegador. No usar `supabase db push` (ver CLAUDE.md del repo).
-- Después de aplicar: agregar la tabla a financeos-app/supabase/tests/acl-esperada.json.

create table if not exists public.invest_operations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  seq        bigint not null default 0,
  type       text not null,
  ticker     text,
  op_date    date not null,
  currency   text,
  price      numeric,
  qty        numeric,
  amount     numeric not null default 0,
  fx         numeric,
  pnl        numeric,
  rsi        numeric,
  note       text,
  cash       boolean,
  reinvested boolean not null default false,
  edited     boolean not null default false,
  source     text,
  created_at timestamptz not null default now(),
  constraint invest_operations_type_check
    check (type in ('buy', 'sell', 'deposit', 'withdrawal', 'dividend', 'bonus')),
  constraint invest_operations_ticker_check
    check ((type in ('deposit', 'withdrawal') and ticker is null)
        or (type not in ('deposit', 'withdrawal') and ticker is not null and length(ticker) between 1 and 32)),
  constraint invest_operations_amount_check check (amount >= 0),
  constraint invest_operations_qty_check check (qty is null or qty >= 0),
  constraint invest_operations_price_check check (price is null or price >= 0),
  constraint invest_operations_fx_check check (fx is null or fx > 0),
  constraint invest_operations_currency_check check (currency is null or length(currency) between 2 and 8),
  constraint invest_operations_note_check check (note is null or length(note) <= 500),
  constraint invest_operations_source_check check (source is null or source in ('moyiq'))
);

comment on table public.invest_operations is
  'Libro de operaciones de MOY IQ Invest por cuenta: compras, ventas, depósitos, retiros, dividendos y bonos. De aquí salen el efectivo y el total aportado.';

create index if not exists invest_operations_user_date_idx
  on public.invest_operations (user_id, op_date);

alter table public.invest_operations enable row level security;

-- Grants explícitos (reglas de financeos-app/supabase/tests/acl-esperada.json): nada a anon.
revoke all on table public.invest_operations from public, anon, authenticated;
grant select, insert, update, delete on table public.invest_operations to authenticated;
grant select, insert, update, delete on table public.invest_operations to service_role;

drop policy if exists invest_operations_select_own on public.invest_operations;
create policy invest_operations_select_own on public.invest_operations
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists invest_operations_insert_own on public.invest_operations;
create policy invest_operations_insert_own on public.invest_operations
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists invest_operations_update_own on public.invest_operations;
create policy invest_operations_update_own on public.invest_operations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists invest_operations_delete_own on public.invest_operations;
create policy invest_operations_delete_own on public.invest_operations
  for delete to authenticated using (user_id = (select auth.uid()));
