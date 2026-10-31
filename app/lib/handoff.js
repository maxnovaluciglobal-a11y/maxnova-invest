// app/lib/handoff.js
//
// Entrada desde MOY IQ (módulo Inversiones): la app abre
// /app/#handoff=<token_hash>&uid=<id>[&aporte=<suma>&ccy=<moneda>&n=<cantidad>&usd=<suma en USD>].
// El token es de un solo uso (Edge Function invest-handoff, en financeos-app) y se
// canjea con verifyOtp para abrir una sesión propia de Invest. Nunca es el refresh
// token de MOY IQ: compartirlo haría que Auth revocara las dos sesiones.
//
// Este archivo carga ANTES que PostHog y Supabase: al evaluarse lee el fragmento y lo
// borra de la URL, para que el token no llegue a ningún evento, al historial ni a la
// detección de sesión en la URL. Lo demás son funciones puras.

(function (root) {
  "use strict";

  var TOKEN_RE = /^[A-Za-z0-9_-]{16,256}$/;
  var UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var CCY_RE = /^[A-Z]{3}$/;
  var MAX_AMOUNT = 1e13;

  function positive(v) {
    var n = Number(v);
    return v != null && v !== "" && isFinite(n) && n > 0 && n <= MAX_AMOUNT ? n : null;
  }

  function parseAporte(p) {
    var amount = positive(p.get("aporte"));
    if (amount == null) return null;
    var ccy = p.get("ccy"), n = parseInt(p.get("n"), 10);
    return {
      amount: amount,
      ccy: ccy && CCY_RE.test(ccy) ? ccy : null,
      n: n > 0 && n < 1000 ? n : 1,
      usd: positive(p.get("usd")),
    };
  }

  // Devuelve null si el fragmento no es de este flujo (por ejemplo, #access_token de
  // un enlace de Auth, que no se toca).
  function parseFragment(hash) {
    var raw = String(hash || "").replace(/^#/, "");
    if (!raw) return null;
    var p;
    try { p = new URLSearchParams(raw); } catch (e) { return null; }
    if (!p.has("handoff") && !p.has("aporte")) return null;
    var token = p.get("handoff"), uid = p.get("uid");
    return {
      token: token && TOKEN_RE.test(token) ? token : null,
      uid: uid && UID_RE.test(uid) ? uid : null,
      aporte: parseAporte(p),
    };
  }

  // Qué hacer con el token según la sesión que ya hay en este navegador:
  //   verify: no hay sesión, se canjea.
  //   skip:   ya está la cuenta correcta, el token no hace falta.
  //   switch: hay otra cuenta; se cierra esa, solo en este navegador, y se canjea.
  function plan(currentUid, targetUid) {
    if (!currentUid) return "verify";
    if (!targetUid || currentUid === targetUid) return "skip";
    return "switch";
  }

  // Monto en USD para Planificar › Aportes: el que calculó MOY IQ con su tasa con
  // fecha o, si no vino, la conversión de Invest. Sin tasa, null: nunca 1:1.
  function aporteUsd(a, toUsd) {
    if (!a) return null;
    if (a.usd > 0) return a.usd;
    if (a.ccy === "USD") return a.amount;
    var v = a.ccy && toUsd ? toUsd(a.amount, a.ccy) : null;
    return v > 0 ? v : null;
  }

  // Lee el fragmento y lo limpia de la URL. La marca se borra aunque el valor sea inválido.
  function capture(win) {
    if (!win || !win.location) return null;
    var got = parseFragment(win.location.hash);
    if (got && win.history && win.history.replaceState) {
      win.history.replaceState(win.history.state, "", win.location.pathname + win.location.search);
    }
    return got;
  }

  var api = { parseFragment: parseFragment, plan: plan, aporteUsd: aporteUsd, capture: capture };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") {
    root.InvestHandoff = api;
    if (root.document) root.__investHandoff = capture(root);
  }
})(typeof window !== "undefined" ? window : globalThis);
