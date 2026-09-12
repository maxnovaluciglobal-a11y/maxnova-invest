// app/lib/rebalance.js
//
// Extraido de app/index.html (renderRebal / rebalUpdate) el 12-sep-2026.
// Es el calculo puro de "cuanto comprar/vender por ticker para llegar al
// peso objetivo", mencionado en auditorias previas como "rebalance trade
// rows". Antes vivia duplicado en dos lugares (renderRebal y rebalUpdate)
// con la misma formula copiada a mano — extraerlo a una sola funcion pura
// evita que las dos copias diverjan silenciosamente.
//
// No toca DOM ni Supabase: recibe el portfolio, los pesos objetivo y una
// funcion getPrice(ticker), y devuelve las filas de operaciones sugeridas.

(function (root) {
  "use strict";

  // port: [{t, sh, cur?}], targets: {ticker: pct 0-100}, getPrice(ticker)->number|undefined
  // Devuelve totM (valor total de mercado del portfolio) y trades (solo los
  // que superan el umbral de $10, igual que el original).
  function computeRebalanceTrades(port, targets, getPrice) {
    var totM = port.reduce(function (s, h) {
      return s + h.sh * (getPrice(h.t) || h.cur || 0);
    }, 0);

    var trades = port
      .map(function (h) {
        var cur = getPrice(h.t) || h.cur || 0;
        var curVal = h.sh * cur;
        var tgtVal = (totM * (targets[h.t] || 0)) / 100;
        var diff = tgtVal - curVal;
        if (Math.abs(diff) < 10) return null;
        return { t: h.t, cur: cur, diff: diff, shares: diff / cur, buy: diff > 0 };
      })
      .filter(Boolean);

    return { totM: totM, trades: trades };
  }

  var api = { computeRebalanceTrades: computeRebalanceTrades };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof root !== "undefined") {
    root.computeRebalanceTrades = computeRebalanceTrades;
  }
})(typeof window !== "undefined" ? window : globalThis);
