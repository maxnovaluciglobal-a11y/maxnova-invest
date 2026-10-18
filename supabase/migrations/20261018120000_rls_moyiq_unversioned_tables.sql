-- Versiona la RLS de 4 tablas sensibles que se habían creado a mano en el
-- dashboard de Supabase y NO estaban en ninguna migración (auditoría de
-- seguridad, oct-2026): portfolio_holdings, watchlist, consents, profiles.
--
-- Captura el estado EXACTO verificado en producción (dump de pg_policies del
-- proyecto nelwgbcddwiaimzbcuas). Aislamiento por usuario: cada quien ve y
-- modifica solo sus filas (auth.uid() = user_id; en profiles, auth.uid() = id).
--
-- Idempotente y seguro: cada bloque corre solo si la tabla ya existe, así que
-- aplicarlo contra producción re-asienta exactamente lo que ya hay, y contra
-- una base fresca no rompe.
--
-- PENDIENTE (no incluido acá): el DDL de columnas de estas 4 tablas sigue sin
-- versionar. Para poder reconstruir la base desde cero, capturar el esquema
-- real con `pg_dump --schema-only -t public.portfolio_holdings -t public.watchlist
-- -t public.consents -t public.profiles` y sumarlo en una migración previa.

-- ── portfolio_holdings ───────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.portfolio_holdings') is not null then
    execute 'alter table public.portfolio_holdings enable row level security';
    execute 'drop policy if exists "Users can view own holdings" on public.portfolio_holdings';
    execute 'create policy "Users can view own holdings" on public.portfolio_holdings for select using (auth.uid() = user_id)';
    execute 'drop policy if exists "Users can insert own holdings" on public.portfolio_holdings';
    execute 'create policy "Users can insert own holdings" on public.portfolio_holdings for insert with check (auth.uid() = user_id)';
    execute 'drop policy if exists "Users can update own holdings" on public.portfolio_holdings';
    execute 'create policy "Users can update own holdings" on public.portfolio_holdings for update using (auth.uid() = user_id)';
    execute 'drop policy if exists "Users can delete own holdings" on public.portfolio_holdings';
    execute 'create policy "Users can delete own holdings" on public.portfolio_holdings for delete using (auth.uid() = user_id)';
  end if;
end $$;

-- ── watchlist ─────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.watchlist') is not null then
    execute 'alter table public.watchlist enable row level security';
    execute 'drop policy if exists "Users can view own watchlist" on public.watchlist';
    execute 'create policy "Users can view own watchlist" on public.watchlist for select using (auth.uid() = user_id)';
    execute 'drop policy if exists "Users can insert own watchlist" on public.watchlist';
    execute 'create policy "Users can insert own watchlist" on public.watchlist for insert with check (auth.uid() = user_id)';
    execute 'drop policy if exists "Users can delete own watchlist" on public.watchlist';
    execute 'create policy "Users can delete own watchlist" on public.watchlist for delete using (auth.uid() = user_id)';
  end if;
end $$;

-- ── consents ──────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.consents') is not null then
    execute 'alter table public.consents enable row level security';
    execute 'drop policy if exists "users_read_own_consents" on public.consents';
    execute 'create policy "users_read_own_consents" on public.consents for select using (auth.uid() = user_id)';
    execute 'drop policy if exists "users_insert_own_consents" on public.consents';
    execute 'create policy "users_insert_own_consents" on public.consents for insert with check (auth.uid() = user_id)';
  end if;
end $$;

-- ── profiles (compartida con MOY IQ; la clave es id = auth.uid()) ─────────────
do $$
begin
  if to_regclass('public.profiles') is not null then
    execute 'alter table public.profiles enable row level security';
    execute 'drop policy if exists "Users can view own profile" on public.profiles';
    execute 'create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id)';
    execute 'drop policy if exists "Users can update own profile" on public.profiles';
    execute 'create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id)';
  end if;
end $$;
