# RUNBOOK Operativo — MOY IQ Invest

Guía de continuidad para detectar y responder a caídas. Pareja con la observabilidad
PostHog (evento `api_error`) ya instrumentada en la app. Beta pública gratuita desde el
08-oct-2026: no hay cobro (ver Stripe abajo). Actualizada el 19-oct-2026.

---

## 1. Dependencias externas (single points of failure)

| Proveedor | Qué provee | Endpoint(s) | Riesgo | Plan B actual |
|---|---|---|---|---|
| **Yahoo Finance** (no oficial) | Precios, marketbar, noticias, histórico | `/api/quote`, `/api/marketbar`, `/api/news`, `/api/history` | **Alto** — sin SLA, puede bloquear o rate-limitear | Cache localStorage (precios 2h, noticias 15min, marketbar 3min) + fallback RSS en news |
| **Finnhub** (principal) y **Financial Modeling Prep (FMP)** (respaldo) | Fundamentals, dividendos; FMP además los resultados trimestrales | `/api/fundamentals`, `/api/earnings` | Medio — límites del tier free (`/api/earnings` está devolviendo vacío: INV-7) | Cache localStorage 1h |
| **CoinGecko** · **mindicador.cl** | Criptoactivos · dólar observado y monedas de LatAm | `/api/crypto` · `/api/fx`, `/api/fx-latam` | Medio | — |
| **Supabase** (`financeos-prod`, compartido con MOY IQ) | Auth + datos de usuario | `*.supabase.co` | Alto — sin esto no hay login | Ninguno (crítico) |
| **Stripe** | Cobro, **pausado** en la beta gratuita | `/api/create-checkout` y `/api/billing-portal` devuelven 410 `billing_paused`; `/api/stripe-webhook` verifica la firma y responde 200 `ignored: billing_paused` | Sin impacto hoy: no se cobra | — |
| **Vercel** (proyecto `invest-moyiq`, team `maxnovaluci-global`) | Hosting + edge functions | todo | Alto | Ninguno |
| **PostHog** | Medición de uso (sin correo ni IP del cliente, ver `app/lib/analytics.js`) | `us.i.posthog.com` | Bajo — no afecta UX (track es no-op si falla) | — |
| **Resend** | Correos (bienvenida, perfil de inversor, newsletter diario por el proxy de newsletters) | `api.resend.com` | Bajo | — |

---

## 2. Detección — alertas a configurar en PostHog

La app emite el evento **`api_error`** con propiedad `context`. Crear alertas (Insights →
nueva alerta) sobre estos contextos:

| `context` | Significa | Severidad | Umbral sugerido |
|---|---|---|---|
| `checkout` (`critical:true`) | Falla el checkout de Stripe. **Pausado**: en la beta no hay cobro; volver a armar esta alerta (P0) al reactivarlo | — | — |
| `quotes` | Yahoo no devuelve precios | P1 — dashboard degradado | >10 en 15 min → revisar Yahoo |
| `marketbar` | Falla la barra de mercado | P2 | >20 en 1h |
| `news` | Falla el feed de noticias | P2 | >20 en 1h |
| `uncaught` / `promise` | Error JS no controlado en cliente | P1 si es masivo | pico repentino → revisar último deploy |

Además: caída de muchos eventos en general (registro/login a 0) puede indicar caída total
de Supabase o Vercel.

---

## 3. Respuesta por escenario

### Yahoo Finance bloqueado / rate-limit (spike de `quotes`/`marketbar`/`news`)
1. Verificar: `curl -s "https://invest.moyiq.app/api/quote?ticker=SPY"` — ¿200 con precio o error?
2. La app degrada sola a cache (precios hasta 2h). El usuario ve badge "Caché".
3. Si persiste >2h: rotar el `User-Agent` en `api/quote.js`/`marketbar.js`/`news.js`, o
   activar proveedor de respaldo (ver §4 — pendiente E3).

### Cobro (Stripe): pausado
Nada que hacer hoy: no hay checkout ni trial en la beta (`INVEST_BETA=true`). Al reactivar el cobro:
poner `BILLING_PAUSED=false` en `api/stripe-webhook.js`, reactivar `create-checkout`, `billing-portal`
y el cron de `trial-emails-cron` (que sigue fuera de `vercel.json`), y volver a armar la alerta
`checkout` de PostHog.

### La cuenta de usuarios activos no sube o `invest_weekly_active` está vacía
Ver la sección 6: revisar que la app sirva `app/lib/activity.js`, que `invest_record_activity` no devuelva
errores en la red de un navegador con sesión y que la migración `20261019102000` siga aplicada.

### Supabase caído (login falla, eventos a 0)
1. Status: https://status.supabase.com
2. No hay fallback — comunicar mantenimiento. Datos de usuario están en Supabase (con backups automáticos del plan).

### Pico de `uncaught`/`promise` tras un deploy
1. Probable regresión del último push. Revisar `git log` y el commit reciente.
2. Rollback rápido: `git revert <sha> && git push` (Vercel redespliega solo).

---

## 4. Pendientes de resiliencia (no implementados)

- **E3 — Proveedor de datos de respaldo**: agregar failover de Yahoo a FMP/Alpha Vantage
  en `/api/quote` y `/api/marketbar` cuando Yahoo devuelva error/empty. Hoy solo hay cache.
- **Backups Supabase**: confirmar política de backup/restore del plan actual.
- **Health-check proactivo**: Vercel Cron → ping a `/api/quote` y `/api/marketbar` →
  webhook a Slack/email si fallan (complementa las alertas reactivas de PostHog).

---

## 5. Despliegue y rollback
- Deploy: push a `main` → Vercel despliega por git el proyecto `invest-moyiq` (team
  `maxnovaluci-global`) en menos de un minuto. Si no despliega:
  `vercel deploy --prod --scope maxnovaluci-global` desde `main` limpio. `.vercel/project.json` conserva
  el nombre viejo `magnova-invest`, con el mismo `projectId`.
- Verificar: `curl` de `https://invest.moyiq.app/app/` con el contenido nuevo y la consola del
  navegador sin errores.
- Rollback: `git revert <sha> && git push`, o desde el dashboard de Vercel (Promote a un
  deploy anterior).
- Antes de integrar: `npm test` completo.
- Validar JS antes de push: `node -e "new Function(<script de index.html>)"`.
- Recordatorio: `vercel.json` usa `outputDirectory:"."` → assets estáticos van en la RAÍZ del repo.

---

## 6. Usuarios activos por semana (WAU) de Invest

El disparador de cobro (checkpoint del 5-nov) es **100 usuarios activos por semana**. Login y `profiles`
se comparten con MOY IQ, así que `auth.users` y `profiles` no sirven para medirlo. Desde el 19-oct-2026 la
app registra un día de actividad por cuenta: al abrirse con la sesión iniciada llama (una vez por día y por
dispositivo) a `public.invest_record_activity()`, que guarda `(cuenta, hoy UTC)` en
`public.invest_activity_days`. Migración: `supabase/migrations/20261019102000_invest_activity_days.sql`
(aplicada a mano con `supabase db query --linked -f`, no con `db push`: el historial de migraciones del
proyecto es compartido con `financeos-app`).

- Solo escribe la propia cuenta (la función toma la identidad del JWT) y solo lee `service_role`/`postgres`.
  Los clientes (`anon`, `authenticated`) no pueden leer la tabla ni la vista.
- "Eliminar mis datos de Invest" (`api/delete-account.js`) borra también esas filas; al borrar la cuenta
  se van en cascada.
- La semana es ISO (lunes a domingo) y el día es UTC.
- Solo hay datos desde el 19-oct-2026: la medición necesita 2 o 3 semanas antes del 5-nov.

**WAU por semana, todas las cuentas** (SQL Editor de Supabase, o
`supabase db query --linked --project-ref nelwgbcddwiaimzbcuas "<consulta>"`):

```sql
select * from public.invest_weekly_active limit 8;
```

**WAU sin cuentas internas ni de prueba** (el criterio de la auditoría DAT-9; puede dejar fuera algún correo
real que contenga "test"):

```sql
select s.week_start, to_char(s.week_start, 'IYYY-"W"IW') as iso_week, count(distinct s.user_id) as wau_reales
from (
  select a.user_id, a.day - (extract(isodow from a.day)::int - 1) as week_start
  from public.invest_activity_days a
  join auth.users u on u.id = a.user_id
  where u.email !~* '(walterlamadriz|maxnova|lamadriz|test|prueba|example)'
) s
group by s.week_start
order by s.week_start desc
limit 8;
```

Si la semana en curso está incompleta, mirar la anterior. Si la vista no devuelve filas, revisar que la
app esté sirviendo `app/lib/activity.js` y que no haya errores `invest_record_activity` en la red.
