# Email de relanzamiento a la lista de espera (BORRADOR, no enviado)

> Interno. `*.md` no se publica (`.vercelignore` + redirect en `vercel.json`).
> Enviar solo después del deploy y la verificación del checklist de
> `00 - Gestion/auditorias/2026-10-ux/04-PLAN-RELANZAMIENTO-INVEST.md`.
> Remitente sugerido: `MOY IQ Invest <invest@moyiq.app>` vía Resend (dominio
> verificado). Destinatarios: `invest_leads` con `fuente = 'waitlist'`, sin
> `unsubscribed_at` y con consentimiento de marketing (ver SQL al final).
> Un envío por persona, sin seguimiento automático: el cron de nurture no debe
> mandarles el correo 2 justo después (ver "Backlog" en el plan).

- **Asunto:** Invest volvió: gratis mientras dure la beta
- **Preheader:** Lo que cambió desde la pausa y cómo entrar con tu correo.

---

## Versión texto

```
Hola:

Te anotaste para saber cuándo volvía MOY IQ Invest. Ya está abierto otra vez, como beta pública y gratuita.

Qué cambió desde la pausa:

- Sin notas de 0 a 100. Cada indicador (medias de 50 y 200 días, RSI, MACD, volumen) se muestra por separado, con su rango y una frase que explica qué significa.
- Cada precio dice qué tan actual es: "Al día", "Retraso N min", "Mercado cerrado" o "Sin conexión", con la hora que informa la fuente.
- La calculadora ahora se llama "Con tu regla de riesgo": eliges cuánto arriesgar por operación y te dice cuántas unidades caben, cuánto pierdes si el precio toca tu stop y si superas tu límite de concentración.
- Todo está incluido durante la beta. No hay planes a la venta ni tarjeta que cargar. Si más adelante hay planes pagos, te avisamos antes y lo que uses no se pierde.

Entrar: https://invest.moyiq.app/app

Puedes crear la cuenta con este mismo correo. Si ya tienes cuenta en MOY IQ, usas el mismo correo y contraseña.

Si algo no funciona o no se entiende, responde este correo. Lo leo yo.

Walter
MOY IQ Invest

Herramienta educativa. No es asesoría financiera ni ejecuta órdenes. Invertir implica riesgo de pérdida.
MAXNOVA & LUCI Global LLC · invest@moyiq.app
Recibes este correo porque te anotaste en la lista de espera de MOY IQ Invest. Darte de baja: {{unsubscribe_url}}
```

## Versión HTML

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invest volvió: gratis mientras dure la beta</title>
</head>
<body style="margin:0;padding:0;background:#FAF8F2;">
<span style="display:none;max-height:0;overflow:hidden;">Lo que cambió desde la pausa y cómo entrar con tu correo.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F2;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E4DFD2;border-radius:10px;">
  <tr><td style="background:#14213D;border-radius:10px 10px 0 0;padding:20px 28px;font-family:Arial,Helvetica,sans-serif;color:#F1EEE6;font-size:15px;font-weight:bold;letter-spacing:.06em;">
    MOY <span style="background:#B8863B;color:#14213D;padding:1px 6px;border-radius:3px;">IQ</span> Invest
  </td></tr>
  <tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;color:#14213D;font-size:15px;line-height:1.6;">
    <p style="margin:0 0 16px;">Hola:</p>
    <p style="margin:0 0 16px;">Te anotaste para saber cuándo volvía MOY IQ Invest. Ya está abierto otra vez, como beta pública y gratuita.</p>
    <p style="margin:0 0 8px;font-weight:bold;">Qué cambió desde la pausa</p>
    <ul style="margin:0 0 16px;padding-left:20px;">
      <li style="margin-bottom:8px;">Sin notas de 0 a 100. Cada indicador (medias de 50 y 200 días, RSI, MACD, volumen) se muestra por separado, con su rango y una frase que explica qué significa.</li>
      <li style="margin-bottom:8px;">Cada precio dice qué tan actual es: “Al día”, “Retraso N min”, “Mercado cerrado” o “Sin conexión”, con la hora que informa la fuente.</li>
      <li style="margin-bottom:8px;">La calculadora ahora se llama “Con tu regla de riesgo”: eliges cuánto arriesgar por operación y te dice cuántas unidades caben, cuánto pierdes si el precio toca tu stop y si superas tu límite de concentración.</li>
      <li>Todo está incluido durante la beta. No hay planes a la venta ni tarjeta que cargar. Si más adelante hay planes pagos, te avisamos antes y lo que uses no se pierde.</li>
    </ul>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr>
      <td style="background:#B8863B;border-radius:8px;">
        <a href="https://invest.moyiq.app/app?ref=relaunch-email" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#14213D;text-decoration:none;">Entrar a Invest</a>
      </td>
    </tr></table>
    <p style="margin:0 0 16px;">Puedes crear la cuenta con este mismo correo. Si ya tienes cuenta en MOY IQ, usas el mismo correo y contraseña.</p>
    <p style="margin:0 0 16px;">Si algo no funciona o no se entiende, responde este correo. Lo leo yo.</p>
    <p style="margin:0;">Walter<br>MOY IQ Invest</p>
  </td></tr>
  <tr><td style="padding:18px 28px;border-top:1px solid #E4DFD2;font-family:Arial,Helvetica,sans-serif;color:#5A5F6E;font-size:12px;line-height:1.6;">
    Herramienta educativa. No es asesoría financiera ni ejecuta órdenes. Invertir implica riesgo de pérdida.<br>
    MAXNOVA &amp; LUCI Global LLC · <a href="mailto:invest@moyiq.app" style="color:#8A6329;">invest@moyiq.app</a><br>
    Recibes este correo porque te anotaste en la lista de espera de MOY IQ Invest. <a href="{{unsubscribe_url}}" style="color:#8A6329;">Darte de baja</a>.
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>
```

## SQL: contar la lista de espera (solo lectura)

Correr en el SQL Editor de Supabase (`nelwgbcddwiaimzbcuas`). No modifica nada.

```sql
-- Cuántos leads de la lista de espera hay y cuántos se pueden contactar.
select
  count(*)                                                        as waitlist_total,
  count(*) filter (where unsubscribed_at is null)                 as sin_baja,
  count(*) filter (where unsubscribed_at is null
                     and consent_marketing is true)               as contactables,
  count(*) filter (where account_created_at is not null)          as ya_crearon_cuenta,
  min(created_at)                                                 as primero,
  max(created_at)                                                 as ultimo
from public.invest_leads
where fuente = 'waitlist';

-- Mismo conteo para todo invest_leads, por fuente (para dimensionar el
-- backlog que el cron de nurture tomaría al reactivarse).
select fuente,
       count(*) filter (where unsubscribed_at is null
                          and consent_marketing is true
                          and account_created_at is null
                          and email2_sent_at is null) as elegibles_email2
from public.invest_leads
group by fuente
order by 2 desc;
```

> Si `consent_marketing` no existe o la lista de espera no lo guarda (el
> formulario de la pausa pedía el correo para "avisarte si vuelve"), el aviso de
> relanzamiento es el envío que la persona pidió: se puede mandar una vez a todos
> los `sin_baja`, pero no sumarlos a ninguna secuencia de marketing sin
> consentimiento explícito.
