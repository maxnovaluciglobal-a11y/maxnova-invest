# Migraciones versionadas — reorganizadas 2026-09-13

Hasta esta fecha, cada cambio a la base (Supabase, proyecto `nelwgbcddwiaimzbcuas`,
compartido con MOY IQ/financeos-app) vivía como un archivo `.sql` suelto en la raíz de
este repo, sin ningún sistema de migraciones ni orden explícito. Ver hallazgo técnico #8
de la auditoría del 13-sep-2026 y el detalle en el `CLAUDE.md` de la raíz del repo.

**Esta reorganización solo movió y renombró los 3 archivos que ya existían.** No se
reescribió el SQL de ningún `CREATE`/`ALTER`, no se creó ningún cambio de esquema nuevo,
y **ninguna de estas migraciones se re-ejecutó contra producción** en esta tarea — es
puro versionado de lo que ya está corriendo.

## Orden histórico (inferido de fecha de creación de archivo, no de `git log` — el
historial de git de este repo está reescrito/squasheado y no refleja fechas reales)

1. `20260615141400_stripe_schema_licenses_and_profiles.sql` (antes `supabase-stripe-schema.sql`)
   — tabla `licenses` (compras one-time), columnas Stripe en `profiles`, función
   `validate_license(text)`. **Desactualizado respecto a producción**: la tabla real de
   `licenses` en este proyecto Supabase compartido usa el esquema de financeos-app
   (`key_hash`, no `key` en claro) — ver hallazgo de colisión en `CLAUDE.md`. No
   volver a correr este archivo tal cual.
2. `20260719193300_trial_emails_and_webhook_events.sql` (antes `supabase-trial-emails.sql`)
   — tabla `trial_emails` (dedup de la secuencia de nurture) y `webhook_events` (dedup
   de eventos de Stripe). RLS ON sin policies (solo `service_role`).
3. `20260911204000_trial_used_anti_reuse_fix.sql` (antes `supabase-trial-fix.sql`)
   — columna `trial_used` en `profiles`, backfill, `REVOKE` de columnas de dinero para
   `anon`/`authenticated`, y trigger `protect_trial_reuse` anti-reabuso de trial.

## Sin runner de migraciones (flujo vigente al 19-oct-2026)

No se construyó ningún script runner acá. El historial remoto (`supabase_migrations.schema_migrations`)
es compartido con `financeos-app` y no registra ninguna migración de este repo, así que **no usar
`supabase db push`**: intentaría correr las migraciones locales que el remoto no conoce, incluidas las
viejas (la de `validate_license` pisaría la función real de MOY IQ). Cada archivo nuevo es aditivo e
idempotente y se aplica así (lo usado el 19-oct-2026 con `20261019102000`):

1. Probarlo en un Postgres local o en un contenedor (imagen de Supabase + PostgREST), con los casos de
   RLS y de permisos, incluido el pedido real de `supabase-js`.
2. "Dry run" contra producción: el archivo dentro de un bloque `DO` que termina en
   `RAISE EXCEPTION 'DRY_RUN_ROLLBACK_OK'`; Postgres deshace todo y no queda nada.
3. Aplicar: `supabase db query --linked --project-ref nelwgbcddwiaimzbcuas -f <archivo>`.
4. Verificar con `SELECT` (`pg_class`, `pg_policies`, `information_schema`, `has_*_privilege`).

Estado de los archivos de esta carpeta (ninguno figura en `supabase_migrations.schema_migrations`):

- `20260615141400`, `20260719193300`, `20260911204000`: históricas, aplicadas a mano entre junio y
  septiembre (ver arriba).
- `20260914150000_invest_lead_magnet.sql`: tabla `invest_leads` y RPC `register_invest_lead` del quiz de
  perfil de inversor (14-sep-2026).
- `20261018120000_rls_moyiq_unversioned_tables.sql`: versiona la RLS de `portfolio_holdings`,
  `watchlist`, `consents` y `profiles` tal como ya estaba en producción (dump de `pg_policies` del 18-oct).
- `20261019102000_invest_activity_days.sql`: C-10 (INV-3), aplicada el 19-oct-2026. Tabla
  `invest_activity_days`, función `invest_record_activity()` y vista `invest_weekly_active` para medir los
  usuarios activos por semana (consulta de WAU en `RUNBOOK.md`, sección 6).
