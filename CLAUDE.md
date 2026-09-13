# CLAUDE.md

Guía para Claude Code al trabajar en este repo (`invest-web`, producto **Invest** de
MAXNOVA & Luci LLC — `invest.moyiq.app` / `invest.financeospro.com`). Sin usuarios reales
ni revenue al 13-sep-2026 — **en pausa de inversión de producto** (ver memoria
`financeos_moy_iq_invest_pausa_decision_20260912`). No proponer features/backend nuevos
sin pedido explícito de Walter; fixes de consistencia sí están habilitados.

## Qué es

PWA de análisis de inversiones para LATAM (`app/index.html`). Landing en `index.html` +
páginas legales. `api/` son Vercel Edge Functions (Stripe checkout/webhook/billing portal,
delete-account, check-plan, cron de emails de trial, proxies de datos de mercado —
Yahoo Finance/FMP). `package.json` dice `"name": "maxnova-invest"` (typo histórico de la
LLC, MAXNOVA con X — no renombrar sin pedido, ver `organizacion_naming_pendientes`).

## Infraestructura compartida con MOY IQ — NO documentado hasta ahora

Invest usa el **mismo proyecto Supabase que MOY IQ/financeos-app**: `nelwgbcddwiaimzbcuas`
(`supabase/.temp/linked-project.json` → `financeos-prod`). No hay separación a nivel de
infraestructura pese a que ambos productos se facturan por separado desde la migración de
cuentas Stripe del 11/12-sep-2026. Esto es una decisión heredada, no evaluada — auditoría
del 13-sep-2026 la marcó como hallazgo crítico #1. Esta sesión audita RLS; **no se migra
nada** (ver arriba, pausa de producto).

**Limitación de esta auditoría**: no hay MCP de Supabase ni credenciales en este repo (no
existe `.env`, está gitignoreado). El análisis se basa en los `.sql` sueltos en la raíz de
este repo y en `02 - FinanceOS/releases/v1.2/financeos-app/*.sql` +
`financeos-app/supabase/migrations/`. Esto puede estar desactualizado respecto a lo que
hay realmente en producción — verificar contra el dashboard de Supabase antes de asumir.

### Tablas que usa Invest (con service_role, key en Vercel env)

`profiles`, `portfolio_holdings`, `watchlist`, `consents`, `trial_emails`,
`webhook_events`, `licenses` (compartida, ver hallazgo abajo).

- Los endpoints en `api/` (`check-plan.js`, `billing-portal.js`, `delete-account.js`,
  `stripe-webhook.js`, `trial-emails-cron.js`) usan **siempre `SUPABASE_SERVICE_KEY`**
  (bypass de RLS) y filtran manualmente por `id=eq.<userId>` obtenido de
  `/auth/v1/user` con el JWT del caller — nunca de un body. Esto es correcto: aunque RLS
  esté mal, estos endpoints no filtran por lo que dice el JWT, no por lo que manda el
  cliente.
- El cliente (`app/index.html`) usa la **anon key** vía `supabase-js` y siempre agrega
  `.eq("id", authUser.id)` / `.eq("user_id", userId)` explícito en cada query (líneas
  9546, 10690, 10729, 10832, 10919, 11098, 11135-11163). Esto es defensa en profundidad,
  no la única barrera — si RLS no filtra por `auth.uid()`, cualquiera con un token válido
  (de cualquiera de los dos productos, si comparten `auth.users`) podría llamar la REST
  API de Supabase directo sin ese `.eq()` y leer filas ajenas.

### Resultado de la auditoría RLS

**No pude confirmar aislamiento porque las políticas RLS reales de `profiles`,
`portfolio_holdings`, `watchlist`, `consents`, `trial_emails` NO están en ningún `.sql`
de ninguno de los dos repos.** Los únicos `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` que
encontré para tablas de Invest (`supabase-trial-emails.sql`) son **RLS ON sin policies**
— eso bloquea todo acceso `anon`/`authenticated` (solo `service_role` entra), lo cual es
seguro pero significa que si el cliente alguna vez necesitó leer `trial_emails` directo
(no parece ser el caso), no podría. `profiles`, `portfolio_holdings`, `watchlist`,
`consents` no tienen su `CREATE TABLE` ni sus policies en ningún archivo del repo — deben
haberse creado a mano en el SQL Editor de Supabase y nunca se versionaron. **Antes de
confiar en que el aislamiento por `auth.uid()` existe, verificar directamente en el
dashboard de Supabase → Authentication/Database → Policies.**

No encontré nombres de tabla que **colisionen** entre productos por sí solos: `profiles`,
`portfolio_holdings`, `watchlist`, `consents`, `trial_emails`, `webhook_events` no
aparecen en ningún `.sql` de `financeos-app` (que usa `cloud_backups`, `synced_data`,
`push_subscriptions`, `licenses`, tablas de leads). Es decir, un usuario de MOY IQ no
tiene fila en `profiles`/`portfolio_holdings`/etc. de Invest porque MOY IQ no las toca.

### 🔴 Hallazgo de riesgo concreto: colisión real en la tabla `licenses`

Ambos productos definen una tabla `licenses` **con esquemas incompatibles** y una función
`validate_license(text)` con el **mismo nombre y firma**, en el mismo proyecto Supabase:

- **Invest** — `supabase-stripe-schema.sql` (raíz de este repo, líneas 1-45): PK `id uuid`,
  columna `key` (texto plano único), `stripe_session_id`, `customer_email`,
  `stripe_amount`, `activations`. Función `validate_license(p_key text)` hace
  `select * from licenses where key = p_key`.
- **MOY IQ** — `02 - FinanceOS/releases/v1.2/financeos-app/supabase-licenses.sql`
  (líneas 1-50+, evolucionada con migraciones hasta el 2026-09-15 en
  `financeos-app/supabase/migrations/`): PK `key_hash text` (hash SHA-256, nunca la
  clave en claro), columnas `status`, `expires_at`, `stripe_subscription_id`. Función
  `validate_license(p_key text)` hashea el input y busca por `key_hash`.

`CREATE TABLE IF NOT EXISTS` no pisa una tabla que ya existe con otro esquema — así que
lo que hay realmente en producción es el esquema del script que se corrió primero (todo
indica que es el de financeos-app, activamente mantenido con migraciones recientes).
Pero `CREATE OR REPLACE FUNCTION validate_license(text)` **sí pisa sin aviso** la función
del otro producto si alguien vuelve a correr `supabase-stripe-schema.sql` de este repo:
dejaría la función de Invest activa buscando una columna `key` que no existe en la tabla
real (`key_hash`), rompiendo la validación de licencias de MOY IQ con un error de
"columna no existe" la próxima vez que se llame.

**No lo arreglé — decisión de Walter.** Opciones sin migrar infraestructura: renombrar la
función/tabla de Invest a algo con namespace propio (`invest_licenses`,
`validate_invest_license`) para no volver a pisar la de MOY IQ, o simplemente no volver a
correr `supabase-stripe-schema.sql` tal cual está y dejar constancia de que está
desactualizado respecto a lo que hay en producción.

## Gotchas de deploy (`RUNBOOK.md` / `vercel.json` / `package.json`)

- `vercel.json` tiene `outputDirectory: "."` — los assets estáticos van en la **raíz** del
  repo, no en `dist/` ni `public/` (excepto lo que ya vive en `public/`).
- Cron de Vercel: `/api/trial-emails-cron` corre diario a las 14:00 UTC — necesita
  `SUPABASE_SERVICE_KEY` y `RESEND_API_KEY` en el entorno o falla en silencio (ver guard
  en `api/trial-emails-cron.js:190`).
- Sin Supabase no hay login — es punto único de falla marcado como "Alto" sin plan B en
  `RUNBOOK.md`.
- Antes de push: `node -e "new Function(<script de index.html>)"` para validar sintaxis
  del JS inline (recordatorio propio del RUNBOOK).
- Rollback: `git revert <sha> && git push` (Vercel redespliega solo) o promote de un
  deploy anterior desde el dashboard.
- `package.json` no tiene build script real, solo `"test": "vitest run"`.
- CSP en `vercel.json` limita `connect-src` a Supabase, Yahoo Finance, FMP, mindicador.cl,
  proxies CORS y PostHog — si se agrega un proveedor de datos nuevo, hay que sumarlo ahí
  o rompe en silencio (bloqueado por CSP, no por error de red visible en Network tab).

## Migraciones SQL versionadas (reorganizado 13-sep-2026)

Los 3 `.sql` sueltos que estaban en la raíz (hallazgo técnico #8 de la auditoría del
13-sep) se movieron y renombraron a `supabase/migrations/`, siguiendo el mismo patrón de
nomenclatura (`YYYYMMDDHHMMSS_descripcion.sql`) que usa `financeos-app/supabase/migrations/`.
**Solo se reordenó/renombró — el SQL de cada archivo quedó exactamente igual, no se
reescribió ningún `CREATE`/`ALTER`, no se creó ningún cambio de esquema nuevo, y ninguna
migración se re-ejecutó contra producción en esta tarea.**

Orden histórico (inferido de la fecha de creación de cada archivo — el `git log` de este
repo está reescrito/squasheado y no sirve para esto):

1. `20260615141400_stripe_schema_licenses_and_profiles.sql` — ex `supabase-stripe-schema.sql`.
   **Desactualizado respecto a producción**: define `licenses` con PK `key` en claro,
   pero la tabla real en el proyecto Supabase compartido usa el esquema de financeos-app
   (`key_hash`). No volver a correr este archivo — ver el hallazgo de colisión de
   `validate_license` más arriba en este mismo documento.
2. `20260719193300_trial_emails_and_webhook_events.sql` — ex `supabase-trial-emails.sql`.
   `trial_emails` + `webhook_events`, RLS ON sin policies.
3. `20260911204000_trial_used_anti_reuse_fix.sql` — ex `supabase-trial-fix.sql`. Columna
   `trial_used`, backfill, `REVOKE` de columnas de dinero, trigger anti-reabuso.

No se portó ningún runner de aplicación de migraciones — `financeos-app` tampoco tiene
uno propio, usa el Supabase CLI estándar (`supabase migration new` / `supabase db push
--linked`) solo para migraciones *nuevas*, dejando sus `.sql` viejos como registro
histórico. Invest sigue el mismo patrón: la carpeta ordenada es documentación/versionado;
cualquier migración nueva (si Walter la pide — recordar que Invest está en pausa de
producto) usa ese mismo flujo del CLI, verificando primero contra producción real. Detalle
completo en `supabase/migrations/README.md`.

## Fuente de verdad

Este archivo es nuevo (creado 13-sep-2026, no existía antes). Memoria relevante:
`financeos_moy_iq_invest_auditoria_completa_20260913` (hallazgo #1 = este),
`financeos_moy_iq_invest_pausa_decision_20260912` (por qué no se toca infraestructura),
`invest_repo_path`, `organizacion_naming_pendientes` (typo maxnova-invest).
