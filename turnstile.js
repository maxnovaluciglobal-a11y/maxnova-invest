/* turnstile.js — Cloudflare Turnstile en Invest (auditoría 360, SEG-1 y SEG-7). Copia del
   turnstile.js de financeos-landing. Servidor y orden de encendido: financeos-app/docs/turnstile.md.

   El quiz de perfil-inversor.html (register_invest_lead) va a la Edge Function lead-submit, que verifica el token y llama a la RPC
   con el service role: { rpc, args, turnstileToken? } y responde el mismo status y JSON
   que la RPC.

   El login de /app (Supabase Auth, proyecto compartido con MOY IQ) usa el mismo widget para
   mandar options.captchaToken cuando se prenda el captcha de Supabase Auth.

   SITE_KEY es la clave PÚBLICA del widget `moyiq-forms`. Vacía = sin widget ni script de
   Cloudflare: los formularios van igual a lead-submit, sin token (el servidor deja pasar
   mientras no exista TURNSTILE_ENFORCE).

   Uso: var ts = MoyTurnstile.attach(form);        // pinta el widget antes del botón
        ts.token().then(function (tok) { return MoyTurnstile.submitLead(rpc, args, tok); })
        ...; ts.reset();                            // cada token sirve una sola vez
        ts.showError();                             // si el servidor respondió captcha_failed */
(function (root) {
  'use strict';
  var SITE_KEY = '0x4AAAAAAFes7XsVjxTdfS7Y';
  var LEAD_SUBMIT_URL = 'https://nelwgbcddwiaimzbcuas.supabase.co/functions/v1/lead-submit';
  var SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  var WAIT_MS = 10000;

  var ERR = {
    es: 'No se pudo verificar que eres una persona. Recarga la página e inténtalo de nuevo.',
    en: "We couldn't verify that you're a person. Reload the page and try again.",
    pt: 'Não foi possível verificar que você é uma pessoa. Recarregue a página e tente de novo.',
    de: 'Die Prüfung, ob Sie ein Mensch sind, ist fehlgeschlagen. Laden Sie die Seite neu und versuchen Sie es noch einmal.'
  };

  function body(rpc, args, token) {
    var b = { rpc: rpc, args: args || {} };
    if (token) b.turnstileToken = token;
    return b;
  }

  /** POST a lead-submit. Devuelve la promesa de fetch (Response). */
  function submitLead(rpc, args, token, fetchImpl) {
    var f = fetchImpl || root.fetch.bind(root);
    return f(LEAD_SUBMIT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(rpc, args, token)) });
  }

  function isCaptchaError(data) {
    return !!(data && (data.error === 'captcha_failed' || data.error === 'captcha_unavailable'));
  }

  var loading = null;
  function load() {
    if (root.turnstile) return Promise.resolve(root.turnstile);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      var timer = setTimeout(function () { fail(); }, 15000);
      function fail() { clearTimeout(timer); loading = null; if (s.parentNode) s.parentNode.removeChild(s); reject(new Error('turnstile_load_failed')); }
      s.src = SCRIPT_URL; s.async = true; s.defer = true;
      s.onload = function () { clearTimeout(timer); if (root.turnstile) resolve(root.turnstile); else fail(); };
      s.onerror = fail;
      document.head.appendChild(s);
    });
    return loading;
  }

  var NOOP = { token: function () { return Promise.resolve(''); }, reset: function () {}, showError: function () {}, enabled: false };

  /** Prepara el widget en `form`. Carga el script en la primera interacción con el formulario. */
  function attach(form, opts) {
    if (!SITE_KEY || !form || typeof document === 'undefined') return NOOP;
    opts = opts || {};
    var lang = (document.documentElement.lang || 'es').toLowerCase().split('-')[0];
    var box = document.createElement('div');
    box.className = 'ts-box';
    box.style.margin = '8px 0';
    var err = document.createElement('p');
    err.className = 'ts-err';
    err.setAttribute('role', 'alert');
    err.hidden = true;
    err.style.cssText = 'margin:8px 0;font-size:14px;line-height:1.5;color:var(--error)';
    err.textContent = ERR[lang] || ERR.en;
    var anchor = opts.before || form.querySelector('[type="submit"]') || form.querySelector('button');
    if (anchor && anchor.parentNode) { anchor.parentNode.insertBefore(box, anchor); anchor.parentNode.insertBefore(err, anchor); }
    else { form.appendChild(box); form.appendChild(err); }

    var token = '', waiters = [], id = null, started = false, failed = false;
    function flush(v) { var w = waiters; waiters = []; w.forEach(function (fn) { fn(v); }); }
    function showError() { err.hidden = false; }
    function fail() { token = ''; failed = true; showError(); flush(''); }
    function start() {
      if (started) return; started = true;
      load().then(function (ts) {
        id = ts.render(box, {
          sitekey: SITE_KEY,
          action: opts.action || 'form',
          appearance: 'interaction-only',
          'response-field': false,
          callback: function (t) { token = t; failed = false; err.hidden = true; flush(t); },
          'expired-callback': function () { token = ''; ts.reset(id); },
          'error-callback': function () { fail(); return true; }
        });
      }, fail);
    }
    form.addEventListener('focusin', start);
    form.addEventListener('pointerdown', start);
    if (opts.eager) start();

    return {
      enabled: true,
      /** Token vigente, o espera hasta 10 s; '' si falla (el servidor decide). Lo consume. */
      token: function () {
        start();
        if (token) { var v = token; token = ''; return Promise.resolve(v); }
        // Si el widget ya falló no se espera: el envío sale sin token y el servidor decide.
        if (failed) return Promise.resolve('');
        return new Promise(function (resolve) {
          var timer = setTimeout(function () { waiters = waiters.filter(function (w) { return w !== done; }); resolve(''); }, WAIT_MS);
          function done(v) { clearTimeout(timer); if (v) token = ''; resolve(v); }
          waiters.push(done);
        });
      },
      reset: function () { token = ''; if (id !== null && root.turnstile) { try { root.turnstile.reset(id); } catch (e) { /* sin widget */ } } },
      showError: showError
    };
  }

  var api = { SITE_KEY: SITE_KEY, LEAD_SUBMIT_URL: LEAD_SUBMIT_URL, body: body, submitLead: submitLead, attach: attach, isCaptchaError: isCaptchaError };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.MoyTurnstile = api;
})(typeof self !== 'undefined' ? self : this);
