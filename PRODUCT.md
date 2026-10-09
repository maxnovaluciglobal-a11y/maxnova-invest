# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Personas de LatAm (Chile primero) que invierten por su cuenta en acciones, ETF y cripto a través de un bróker externo y quieren ordenar lo que tienen: cuánto vale, cuánto arriesgan si sus stops se activan y qué muestran los indicadores de lo que siguen. Muchas ya usan MOY IQ para sus finanzas personales (misma cuenta).

## Product Purpose
MOY IQ Invest (`invest.moyiq.app/app`) es una herramienta educativa de seguimiento: portafolio con riesgo al stop, lista de seguimiento con lecturas por indicador, calculadora de tamaño de posición con regla de riesgo y plan de aportes. Beta pública gratuita desde oct-2026. Éxito de la beta: cuentas activas con 3 o más posiciones propias cargadas.

## Positioning
Cifras honestas en lugar de señales: cada precio dice su hora y retraso, cada indicador se muestra con su rango y una frase, sin notas 0-100 ni recomendaciones de compra o venta. El riesgo se expresa con la regla de la persona (stop y % por operación), no con un puntaje.

## Operating Context
Se usa en escritorio para revisar y cargar posiciones, y en el celular para mirar cómo va y crear alertas. Las órdenes se ejecutan en el bróker, nunca acá. El puente con MOY IQ Finanzas es manual: "¿cuánto puedes aportar este mes?".

## Capabilities and Constraints
- Estructura decidida por Walter el 09-oct-2026: 5 destinos (Hoy · Portafolio · Lista · Planificar · Mercado), barra lateral en escritorio, barra inferior de 5 en el móvil, ficha del activo y buscador global. Detalle: `../../00 - Gestion/auditorias/2026-10-ux/10-REESTRUCTURA-INVEST.md`.
- App de un solo archivo (`app/index.html`, JS inline) + `app/lib/*.js` con tests (vitest). Supabase compartido con MOY IQ (`portfolio_holdings` con `stop`, `watchlist`, `profiles`, `consents`). Alertas solo en este navegador.
- Datos de mercado con retraso (Yahoo Finance / FMP vía `api/`).
- Prohibido: recomendaciones personalizadas de qué comprar, cestas por perfil, "sugerido", notas 0-100, promesas de tiempo real (guardas en `test/copy-guard.test.js`).

## Brand Commitments
- Marca MOY IQ: Navy `#14213D`, Latón `#B8863B` (CTA con texto Navy), Papel `#F1EEE6` / `#FAF8F2`, estados `--pos`/`--neg`/`--warn` con ícono + palabra, nunca solo color. Radios ≤ 12 px, nunca pill. IBM Plex Sans para texto, IBM Plex Mono solo para cifras. Fuentes autoalojadas, nunca Google Fonts. Modo claro y oscuro.
- Copy en español neutro con "tú", sin voseo, sin signos de exclamación, sin anglicismos de interfaz (portfolio, watchlist, win rate).
- Avisos legales sobrios: "No es un bróker · análisis educativo".

## Evidence on Hand
Sin usuarios reales relevantes todavía (beta reciente). No inventar testimonios, cifras de uso ni rendimiento.

## Product Principles
1. Una función, un lugar: el resto de la app enlaza a ese lugar.
2. Honestidad del dato antes que impresión: hora, retraso y "sin dato" a la vista.
3. El riesgo con la regla de la persona es el centro, no el rendimiento.
4. Nada que se lea como una orden de compra o venta.
5. Hermano de MOY IQ Finanzas: misma marca, mismo tono, mismo modelo de navegación en el móvil.

## Accessibility & Inclusion
WCAG AA: contraste AA, controles ≥ 44 px en el móvil, foco visible, estados con ícono y palabra, `prefers-reduced-motion`.
