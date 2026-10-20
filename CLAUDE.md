# CLAUDE.md

Guía para Claude Code al trabajar en este repo (`invest-web`, producto **Invest** de
MAXNOVA & Luci LLC — `invest.moyiq.app`).
**Beta pública gratuita desde el 08-oct-2026**: estuvo en pausa del 12-sep al 08-oct y el
relanzamiento v2 ya está en `main` (plan en `../../00 - Gestion/auditorias/2026-10-ux/04-PLAN-RELANZAMIENTO-INVEST.md`).
Su rol (producto, sección de MOY IQ o canal) se decide en el checkpoint del 5-nov (D-08 de la
auditoría 360). Cobro pausado hasta el disparador: 100 usuarios activos por semana, que se
mide con `invest_weekly_active` (`RUNBOOK.md` §6). Features nuevos solo con pedido explícito de
Walter; las correcciones de consistencia y la ejecución de la auditoría 360
(`../../00 - Gestion/auditorias/2026-10-18-auditoria-360/`) sí están habilitadas.
Deploy: un push a `main` redespliega por git el proyecto de Vercel `invest-moyiq` (team
`maxnovaluci-global`); ver `RUNBOOK.md` §5.

## Qué es

PWA de análisis de inversiones para LATAM (`app/index.html`). Landing en `index.html` +
páginas legales. `api/` son Vercel Edge Functions: Stripe checkout/webhook/billing portal y
cron de emails de trial (pausados en la beta), delete-account, check-plan y proxies de datos
de mercado (Yahoo Finance, Finnhub con respaldo en FMP, CoinGecko y mindicador.cl).
`package.json` dice `"name": "maxnova-invest"` y `.vercel/project.json` conserva el nombre
viejo `magnova-invest` (typos históricos de la LLC, MAXNOVA con X — no renombrar sin pedido,
ver `organizacion_naming_pendientes`); el proyecto real de Vercel es `invest-moyiq`
(mismo `projectId`).

## Infraestructura compartida con MOY IQ — NO documentado hasta ahora

Invest usa el **mismo proyecto Supabase que MOY IQ/financeos-app**: `nelwgbcddwiaimzbcuas`
(`supabase/.temp/linked-project.json` → `financeos-prod`). No hay separación a nivel de
infraestructura pese a que ambos productos se facturan por separado desde la migración de
cuentas Stripe del 11/12-sep-2026. Esto es una decisión heredada, no evaluada — auditoría
del 13-sep-2026 la marcó como hallazgo crítico #1. Esta sección es esa auditoría de RLS
(re-verificada el 18-oct, más abajo). Desde entonces Invest salió de la pausa y ya hubo
cambios de esquema: ver "Migraciones SQL versionadas".

**Cómo verificar contra producción**: no hay `.env` en el repo (está gitignoreado), pero el
CLI de Supabase está logueado en esta máquina:
`supabase db query --linked --project-ref nelwgbcddwiaimzbcuas -o json "<SQL de solo lectura>"`
(`pg_policies`, `information_schema`, `has_table_privilege`). Las `.sql` de este repo y de
`financeos-app/supabase/migrations/` pueden estar desactualizadas respecto a la base: mirar
siempre la base antes de asumir.

### Tablas que usa Invest (con service_role, key en Vercel env)

`profiles`, `portfolio_holdings`, `watchlist`, `consents`, `trial_emails`,
`webhook_events`, `licenses` (compartida, ver hallazgo abajo) e `invest_activity_days`
(desde el 19-oct-2026: un día por cuenta en que se abrió la app, para contar usuarios activos
por semana; el cliente solo la escribe, vía la función `invest_record_activity()`, y la lee
`service_role` con la vista `invest_weekly_active`).

- Los endpoints en `api/` (`check-plan.js`, `billing-portal.js`, `delete-account.js`,
  `stripe-webhook.js`, `trial-emails-cron.js`) usan **siempre `SUPABASE_SERVICE_KEY`**
  (bypass de RLS) y filtran manualmente por `id=eq.<userId>` obtenido de
  `/auth/v1/user` con el JWT del caller — nunca de un body. Esto es correcto: aunque RLS
  esté mal, estos endpoints no filtran por lo que dice el JWT, no por lo que manda el
  cliente.
- El cliente (`app/index.html`) usa la **anon key** vía `supabase-js` y siempre agrega
  `.eq("id", authUser.id)` / `.eq("user_id", userId)` explícito en cada query (buscar
  `.eq("user_id"` y `.eq("id"` en `app/index.html`). Esto es defensa en profundidad,
  no la única barrera — si RLS no filtra por `auth.uid()`, cualquiera con un token válido
  (de cualquiera de los dos productos, si comparten `auth.users`) podría llamar la REST
  API de Supabase directo sin ese `.eq()` y leer filas ajenas.

### Resultado de la auditoría RLS — ✅ CONFIRMADO en producción (13-sep-2026)

Verificado directamente contra el proyecto real (`nelwgbcddwiaimzbcuas`, SQL Editor del
dashboard, sesión logueada como MaxnovaLuci) — ya no es solo análisis de `.sql` locales:

- Las 7 tablas (`profiles`, `portfolio_holdings`, `watchlist`, `consents`,
  `trial_emails`, `webhook_events`, `licenses`) tienen **RLS habilitado** (`pg_class.
  relrowsecurity = true`).
- `profiles`, `portfolio_holdings`, `watchlist`, `consents` tienen policies reales (11
  en total) que filtran correctamente por `auth.uid() = user_id` (o `= id` en
  `profiles`) en cada operación SELECT/INSERT/UPDATE/DELETE — aislamiento por usuario
  confirmado, no solo asumido.
- `trial_emails`, `webhook_events`, `licenses` tienen RLS ON **sin policies propias** —
  con RLS activo y cero policies permisivas, el default es denegar todo a `anon`/
  `authenticated`; solo `service_role` accede (coincide con cómo las toca `api/`).

**Conclusión: sin fuga de datos entre productos ni entre usuarios de Invest.** El
`CREATE TABLE IF NOT EXISTS` local que decía tener el esquema viejo de `licenses` (PK
`key` en claro) no importa — la tabla real en producción usa el esquema de MOY IQ
(`key_hash`), confirmado también contra `pg_proc` (ver hallazgo de abajo).

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
- **MOY IQ** — `01 - Maxnova Luci Global/02 - MOY IQ/05 - Producto/financeos-app/supabase-licenses.sql`
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

**✅ RESUELTO (13-sep-2026, tarde).** Verificado en vivo contra `pg_proc` que la función
actualmente activa en producción es la de MOY IQ (`key_hash`) — la validación de
licencias de MOY IQ **no estaba rota**. Para que la colisión no pueda volver a ocurrir:
la función y su `grant` en `supabase/migrations/20260615141400_...sql` se renombraron de
`validate_license` a `validate_license_invest_unused` (confirmado por grep que nunca se
llama desde `app/` ni `api/` de este repo — el modelo real de Invest es suscripción +
login, no "pegar una clave"). Si alguna vez se re-ejecuta ese archivo, ya no puede pisar
la función real de MOY IQ. No se tocó nada en producción — solo el archivo de migración
local (que de por sí nunca se re-ejecutó, ver sección de migraciones más abajo).

## Gotchas de deploy (`RUNBOOK.md` / `vercel.json` / `package.json`)

- `vercel.json` tiene `outputDirectory: "."` — los assets estáticos van en la **raíz** del
  repo, no en `dist/` ni `public/` (excepto lo que ya vive en `public/`).
- **Relanzamiento v2 · beta pública gratuita (oct-2026, reemplaza el modo pausa T06):**
  - `index.html` es la landing de la beta (hero Navy, cuerpo Papel-000). `faq`,
    `perfil-inversor` y `estado-mercado` volvieron a la raíz; `_pausa/` queda como archivo
    (bloqueado por `.vercelignore` y redirect). `/app` vuelve a servirse (rewrite) con
    `X-Robots-Tag: noindex`; las páginas públicas ya no llevan noindex.
  - `app/index.html`: `INVEST_BETA=true` → `planOf()` devuelve `PLANS.beta` (todo
    desbloqueado) sin importar `profiles.plan`; no hay trial, upgrade ni portal de pago.
  - **Prohibido volver a mostrar** notas agregadas por activo (score 0-100), señales
    BUY/SELL/Acumular/Reducir, niveles de entrada/objetivo, consenso de analistas,
    "tiempo real" o "~15 min" fijos (T18). Cada indicador se muestra con rango y lectura
    (`app/lib/readings.js`, con tests) y cada precio con su frescura real
    (`quoteFreshness`, a partir de `marketTime` que devuelven `api/quote.js` y
    `api/crypto.js`). Riesgo: `computeRiskAtStop` / `concentrationAlternative` en
    `app/lib/risk.js` (límite 25 %).
  - Sentimiento (Fear & Greed compuesto) y Radar (Health Score + IA no conectada) están
    fuera de la navegación; su código sigue en el archivo como código muerto.
  - Cobro: `create-checkout`, `billing-portal` y `trial-emails-cron` devuelven 410
    `billing_paused`. `stripe-webhook` **verifica la firma y responde 200**
    `{received:true, ignored:"billing_paused"}` (`BILLING_PAUSED=true`): el endpoint
    `invest-web-subscriptions` de la cuenta Stripe compartida sigue activo y un 410
    lo haría acumular fallos hasta deshabilitarse. El cron de trial sigue fuera de
    `vercel.json`.
  - Email a la lista de espera: borrador en `docs/relaunch-email.md` (no publicado:
    `*.md` está en `.vercelignore`).
  - `api/delete-account.js` borra **solo datos de Invest** (holdings, watchlist,
    consents, trial_emails, invest_activity_days, profiles). Nunca el `auth.users`: es compartido con MOY IQ;
    la baja de la cuenta se pide por `support@moyiq.app`.
  - Leads del quiz: `perfil-inversor.html` manda `p_consent_marketing`, que requiere la
    migración `financeos-app/supabase/migrations/20261009000100_*` aplicada antes del push.
  - `og-invest.png` se genera desde `tools/og/og-invest.html` (headless Chrome; `tools/`
    no se despliega). Términos con ley de Florida y el bloque de empresa de moyiq.app.
- Sin Supabase no hay login — es punto único de falla marcado como "Alto" sin plan B en
  `RUNBOOK.md`.
- Antes de push: `node -e "new Function(<script de index.html>)"` para validar sintaxis
  del JS inline (recordatorio propio del RUNBOOK).
- Rollback: `git revert <sha> && git push` (Vercel redespliega solo) o promote de un
  deploy anterior desde el dashboard.
- `package.json` no tiene build script real, solo `"test": "vitest run"`.
- CSP en `vercel.json` (19-oct-2026, C-33): `connect-src` solo permite el propio sitio, Supabase y
  PostHog. El navegador no habla con ningún proveedor de mercado: todo pasa por `/api/*`. Si
  alguna vez el cliente necesita llamar a un tercero, hay que sumarlo ahí o rompe en silencio.
  `unsafe-inline` sigue (script inline de ~410 KB y ~270 manejadores `onclick=`: quitarlo exige
  reescribir el SPA). HSTS con `includeSubDomains`. Los proxies CORS de terceros (allorigins,
  corsproxy) se quitaron el 19-oct-2026: sin `/api` (por ejemplo en `localhost`) la app no
  consulta datos de mercado. Para probarla con datos, `vercel dev` o interceptar `/api/*` en un
  navegador de pruebas con `_USE_EDGE=true`.
- API de mercado (C-33): `api/_lib/origin.js` responde 403 `origin_not_allowed` (sin llamar al
  proveedor) a un navegador con `Origin` ajeno; **sin `Origin` (curl, el newsletter) pasa**. No
  hay límite por IP en el código: en serverless un contador en memoria no se comparte entre
  instancias (ver `RUNBOOK.md` §4). `/api/earnings` usa Finnhub y FMP `/stable/earnings` de
  respaldo y dice `source` (null si no hubo dato). `GET /api/health` da el estado de cada
  proveedor (código y antigüedad del dato), sin claves, con 15 min de caché.
- Medición de uso (19-oct-2026): PostHog **sin correo, sin IP del lado del cliente y sin
  almacenamiento en el dispositivo** (`app/lib/analytics.js`: solo el id de la cuenta, perfil
  solo al identificarse, sin autocaptura ni grabación, `before_send` que limpia correos y
  recorta las URL). `ip:false` no tiene efecto en el SDK actual: descartar la IP es un ajuste
  del proyecto de PostHog. Al cambiar `privacy.html`, mantener `test/privacy-copy.test.js` en
  verde. Usuarios activos por semana: `app/lib/activity.js` + `RUNBOOK.md` §6.

## Migraciones SQL versionadas (reorganizado 13-sep-2026; flujo actualizado 19-oct-2026)

Desde el 19-oct-2026 hay migraciones nuevas aplicadas a mano (ver la lista al final de esta
sección). Lo que sigue describe la reorganización original del 13-sep. Los 3 `.sql` sueltos que estaban en la raíz (hallazgo técnico #8 de la auditoría del
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

No se portó ningún runner de aplicación de migraciones. **No usar `supabase db push`**: el
historial remoto (`supabase_migrations.schema_migrations`) es compartido con `financeos-app`
y no registra las migraciones de este repo, así que `db push` intentaría correr las locales
que el remoto no conoce (incluidas las viejas, como `validate_license`). Flujo vigente:
1. Escribir el `.sql` aditivo e idempotente en `supabase/migrations/`.
2. Probarlo en un Postgres local o en un contenedor (imagen de Supabase + PostgREST) con
   los casos de RLS y los grants, incluido el pedido real de `supabase-js` (ver C-10).
3. "Dry run" contra producción: el archivo dentro de un bloque `DO` que termina en
   `RAISE EXCEPTION`, así Postgres deshace todo y no queda nada.
4. Aplicar: `supabase db query --linked --project-ref nelwgbcddwiaimzbcuas -f <archivo>`.
5. Verificar con `SELECT` (`pg_class`, `pg_policies`, `information_schema`, `has_*_privilege`).
Aplicadas así: `20261019160000_portfolio_holdings_fx_at_cost.sql` (FIN-12: tipo de cambio de la compra por
posición; ojo, en `portfolio_holdings` el UPDATE de `authenticated` es por columna: una columna nueva
necesita su `grant update (col)`) y `20261019102000_invest_activity_days.sql` (C-10: tabla, función y vista para
medir usuarios activos por semana). `20261018120000_rls_moyiq_unversioned_tables.sql` versiona
la RLS de las 4 tablas creadas a mano tal como ya estaba en producción. Estado de cada archivo en
`supabase/migrations/README.md`.

## Lead magnet + auth compartida con MOY IQ (14-sep-2026, pedido explícito de Walter)

- **`perfil-inversor.html`**: quiz de perfil de riesgo (6 preguntas, cálculo client-side), alimenta `invest_leads` → `crm_contacts` (`producto_origen='invest'`) en el Supabase compartido — visible en el panel `?admin=crm` de financeos-app. CTA en 3 lugares (nav, hero, cierre de `index.html`) — no dejarlo solo en el footer, Walter no lo encontraba ahí.
- **Bug de CSS real, ya corregido**: `.wrap` en `perfil-inversor.html`/`faq.html`/`estado-mercado.html`/`index.html` tenía un padding (`max(24px,calc(50% - Npx))`) copiado de `nav` sin darse cuenta de que `nav` no tiene `max-width` propio y `.wrap` sí — la combinación dejaba 0px de contenido útil a partir de cierto ancho de viewport (rompía en desktop normal, ≥1280px en el peor caso). Si una página nueva copia este mismo patrón de `.wrap`+padding-porcentual, va a tener el mismo bug — usar padding fijo (`0 24px`) en vez.
- **`signUp()` ahora pasa `options.emailRedirectTo: window.location.origin`** (antes no lo pasaba) — necesario para que el Auth Hook compartido (vive en `financeos-app/supabase/functions/auth-email-hook/`) detecte que el correo de confirmación es de Invest y no de MOY IQ. Si se toca el flujo de signup, no borrar ese parámetro.
- **RPC `notify_invest_signup`** (vive en el Supabase compartido, no en este repo): se llama desde el cliente justo después de un `signUp()` exitoso para notificar el alta a `maxnovaluciglobal@gmail.com`. No expone ningún secret — valida server-side que el email tenga un `auth.users` creado en los últimos 10 minutos antes de disparar.

Detalle completo: memoria `financeos_moy_iq_invest_crm_20260914`, `financeos_moy_iq_auth_email_hook_20260914`, `financeos_moy_iq_admin_notify_20260914`.

## Fuente de verdad

Este archivo es nuevo (creado 13-sep-2026, no existía antes). Memoria relevante:
`financeos_moy_iq_invest_auditoria_completa_20260913` (hallazgo #1 = este),
`financeos_moy_iq_invest_pausa_decision_20260912` (**histórica**: la pausa terminó el
08-oct-2026; su regla "no tocar invest-web" ya no rige), `invest_repo_path`,
`organizacion_naming_pendientes` (typo maxnova-invest). Si algo de esta guía contradice a
`../../00 - Gestion/ESTADO.md`, gana `ESTADO.md`.

## Auditoría de seguridad (18-oct-2026) — RLS re-verificada y versionada

Segunda verificación de la RLS (la primera fue el 13-sep). Método transversal: memoria `auditoria-seguridad-metodo`.

- RLS de `portfolio_holdings`, `watchlist`, `consents`, `profiles` **re-confirmada con dump de `pg_policies`**: las 4 con RLS ON y aislamiento por usuario (`auth.uid() = user_id`; en `profiles`, `= id`), 11 policies, sin fuga. Rol `{public}` pero sin riesgo (`auth.uid()` es null para anon → 0 filas).
- **Esas 4 tablas, que existían solo en el dashboard, quedaron versionadas** en `supabase/migrations/20261018120000_rls_moyiq_unversioned_tables.sql` (idempotente, validada). Pendiente aparte: capturar su DDL de columnas (`pg_dump --schema-only`) para reconstrucción total.
- `stripe-webhook` y `check-plan` verifican firma/JWT; `delete-account` usa el JWT como única identidad; las api de mercado no filtran keys. Sin vulnerabilidad.
