// app/lib/analytics.js
//
// Medición de uso con PostHog sin datos personales (D-04 de la auditoría 360, 19-oct-2026).
// Piezas puras, sin DOM ni red:
// - POSTHOG_OPTS: opciones del SDK. Sin autocaptura, sin grabación de sesiones, sin encuestas ni
//   mapas de calor, sin guardar nada en el dispositivo (persistence 'memory') y con perfil de
//   persona solo para quien se identifica. Respeta "No rastrear" y Global Privacy Control.
// - identify(posthog, user): lo único que se manda es el id interno de la cuenta.
// - scrubEvent(ev): último filtro de cada evento (before_send). Quita correo, nombre y plan,
//   tacha correos escritos en texto y recorta las direcciones al origen y la ruta (un enlace de
//   acceso trae el token en el #hash y un enlace de MOY IQ trae el monto en la consulta).
//
// `ip: false` está por claridad: desde posthog-js 1.x la opción no tiene efecto. Que PostHog no
// guarde la IP es un ajuste del proyecto en PostHog ("Discard client IP data").

(function (root) {
  "use strict";

  var PERSONAL_KEYS = ["email", "$email", "name", "$name", "plan"];
  var EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

  function cleanValue(v) {
    if (typeof v !== "string") return v;
    if (/^https?:\/\//i.test(v)) v = v.replace(/[?#].*$/, "");
    return v.replace(EMAIL_RE, "[correo]");
  }
  function cleanBag(bag) {
    if (!bag || typeof bag !== "object") return;
    Object.keys(bag).forEach(function (k) {
      if (PERSONAL_KEYS.indexOf(k) >= 0) { delete bag[k]; return; }
      bag[k] = cleanValue(bag[k]);
    });
  }
  function scrubEvent(ev) {
    if (!ev) return ev;
    cleanBag(ev.properties);
    cleanBag(ev.$set);
    cleanBag(ev.$set_once);
    if (ev.properties) ev.properties.$geoip_disable = true;
    return ev;
  }

  function identify(posthog, user) {
    if (!posthog || typeof posthog.identify !== "function" || !user || !user.id) return false;
    posthog.identify(String(user.id));
    return true;
  }

  var POSTHOG_OPTS = {
    person_profiles: "identified_only",
    persistence: "memory",
    ip: false,
    respect_dnt: true,
    capture_pageview: false,
    autocapture: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    capture_performance: false,
    capture_exceptions: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_conversations: true,
    advanced_disable_flags: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    mask_personal_data_properties: true,
    save_referrer: false,
    save_campaign_params: false,
    before_send: scrubEvent,
  };

  var api = { POSTHOG_OPTS: POSTHOG_OPTS, identify: identify, scrubEvent: scrubEvent };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.InvestAnalytics = api;
})(typeof window !== "undefined" ? window : globalThis);
