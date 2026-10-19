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

## Sin runner de migraciones

A diferencia de lo que se evaluó portar, **no se construyó ningún script runner acá**.
Invest está en pausa de inversión de producto (ver `financeos_moy_iq_invest_pausa_decision_20260912`
en memoria) y el propio `financeos-app` tampoco usa un runner propio — usa el flujo
estándar del Supabase CLI (`supabase migration new` / `supabase db push --linked`) para
migraciones *nuevas*, dejando sus `.sql` viejos como registro histórico sin re-ejecutar
(ver `financeos-app/supabase/migrations/README.md`). Cualquier cambio de esquema
**nuevo** en Invest, si Walter lo pide, debería seguir ese mismo patrón: `supabase
migration new <nombre>` + `supabase db push --linked --project-ref nelwgbcddwiaimzbcuas`
contra el proyecto compartido — verificando primero contra producción real antes de
escribir nada, como ya advierte el `CLAUDE.md` de la raíz.

## Migraciones aplicadas a mano después del 13-sep (no están en el historial remoto)

El historial remoto (`supabase_migrations.schema_migrations`) es compartido con `financeos-app` y no
registra las migraciones de este repo. **No usar `supabase db push`**: intentaría correr las migraciones
locales que el remoto no conoce, incluidas las viejas. Se aplican con `supabase db query --linked -f
<archivo>` (solo SQL), y cada archivo es aditivo e idempotente.

- `20261018120000_rls_moyiq_unversioned_tables.sql` — RLS de `portfolio_holdings`, `watchlist`, `consents`, `profiles`.
- `20261019102000_invest_activity_days.sql` — C-10 (INV-3): tabla `invest_activity_days`, función
  `invest_record_activity()` y vista `invest_weekly_active` para medir los usuarios activos por semana.
  Aplicada el 19-oct-2026 (consulta de WAU en `RUNBOOK.md`, sección 6).
