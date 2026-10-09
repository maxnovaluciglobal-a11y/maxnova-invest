// app/lib/diversification.js
//
// Portafolio › Diversificación (bug de producción, oct-2026): al abrir la
// sección la página "temblaba" y no mostraba nada. Cada renderMain volvía a
// insertar <details open>, el navegador disparaba "toggle" otra vez,
// portDivToggle pedía la historia, y si un ticker no tenía historia (cripto,
// acción local, error de la API) nunca quedaba "cargado": se volvía a pedir y a
// pintar sin fin (unos 250 renders por segundo en el harness).
//
// Reglas puras de este módulo:
// - Un toggle solo cuenta si cambia el estado abierto/cerrado.
// - Un ticker que ya falló no se vuelve a pedir hasta que la persona reintente.
// - La matriz se calcula con los tickers que sí tienen historia (2 o más) y se
//   dice cuáles quedaron fuera.

(function (root) {
  "use strict";

  var MAX_TICKERS = 8;

  // ¿El evento toggle cambia algo? Re-insertar <details open> dispara toggle
  // con el mismo estado que ya estaba guardado: eso no es un cambio.
  function divToggleChanged(isOpen, prevOpen) {
    return !!isOpen !== !!prevOpen;
  }

  // tickers: los de la cartera (se usan los primeros 8, sin repetir).
  // hasHist(t): true si ya hay historia suficiente. failed: {ticker: true}.
  // Devuelve:
  //   usable: con historia; toFetch: sin historia y sin fallo previo;
  //   failed: los que fallaron; ready: true si hay 2 o más para la matriz;
  //   pending: true si todavía falta pedir alguno.
  function corrPlan(tickers, hasHist, failed) {
    var seen = {};
    var list = (tickers || []).filter(function (t) {
      if (!t || seen[t]) return false;
      seen[t] = true;
      return true;
    }).slice(0, MAX_TICKERS);
    var usable = [], toFetch = [], bad = [];
    list.forEach(function (t) {
      if (hasHist(t)) usable.push(t);
      else if (failed && failed[t]) bad.push(t);
      else toFetch.push(t);
    });
    return {
      tickers: list,
      usable: usable,
      toFetch: toFetch,
      failed: bad,
      ready: usable.length >= 2,
      pending: toFetch.length > 0,
    };
  }

  // Una respuesta de historia sirve si es una lista real (no sintética) con
  // más de 5 cierres.
  function histUsable(h) {
    return Array.isArray(h) && h.length > 5 && !(h[0] && h[0]._synthetic === true);
  }

  var api = { MAX_TICKERS: MAX_TICKERS, divToggleChanged: divToggleChanged, corrPlan: corrPlan, histUsable: histUsable };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.InvestDiv = api;
})(typeof window !== "undefined" ? window : globalThis);
