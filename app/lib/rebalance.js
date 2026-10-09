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
  // opts.wholeUnits(ticker)->bool (fase 2, oct-2026): para acciones y ETF la
  // cantidad se redondea a unidades enteras y el monto se recalcula con esas
  // unidades; si redondea a 0 la fila se omite. Sin opts se mantiene la
  // cantidad fraccionaria (cripto, compatibilidad).
  // Devuelve totM (valor total de mercado del portfolio) y trades (solo los
  // que superan el umbral de $10, igual que el original).
  function computeRebalanceTrades(port, targets, getPrice, opts) {
    var whole = opts && typeof opts.wholeUnits === "function" ? opts.wholeUnits : null;
    var totM = port.reduce(function (s, h) {
      return s + h.sh * (getPrice(h.t) || h.cur || 0);
    }, 0);

    var trades = port
      .map(function (h) {
        var cur = getPrice(h.t) || h.cur || 0;
        var curVal = h.sh * cur;
        var tgtVal = (totM * (targets[h.t] || 0)) / 100;
        var diff = tgtVal - curVal;
        if (Math.abs(diff) < 10 || !(cur > 0)) return null;
        var shares = diff / cur;
        if (whole && whole(h.t)) {
          shares = shares > 0 ? Math.floor(shares + 1e-9) : Math.ceil(shares - 1e-9);
          // Nunca vender mas de lo que se tiene.
          if (shares < 0 && -shares > h.sh) shares = -Math.floor(h.sh);
          if (shares === 0) return null;
          diff = shares * cur;
        }
        return { t: h.t, cur: cur, diff: diff, shares: shares, buy: diff > 0 };
      })
      .filter(Boolean);

    return { totM: totM, trades: trades };
  }

  // Redondeo de pesos a enteros que suman exactamente 100 (metodo del mayor
  // resto). values: [numero >= 0]. Antes cada peso se redondeaba por separado
  // y el estado inicial podia sumar 99 o 101.
  function roundTo100(values) {
    var total = values.reduce(function (s, v) { return s + (v > 0 ? v : 0); }, 0);
    if (!(total > 0)) return values.map(function () { return 0; });
    var exact = values.map(function (v) { return ((v > 0 ? v : 0) / total) * 100; });
    var floors = exact.map(Math.floor);
    var rest = 100 - floors.reduce(function (s, v) { return s + v; }, 0);
    var order = exact
      .map(function (v, i) { return { i: i, r: v - Math.floor(v) }; })
      .sort(function (a, b) { return b.r - a.r || a.i - b.i; });
    for (var k = 0; k < rest; k++) floors[order[k % order.length].i]++;
    return floors;
  }

  // Suma de los objetivos SOLO de las posiciones actuales. Los objetivos se
  // guardan por ticker y quedaban los de posiciones ya vendidas, que inflaban
  // la suma (101 % en un lado y 121 % en otro).
  function sumTargets(port, targets) {
    return (port || []).reduce(function (s, h) {
      var v = Number(targets && targets[h.t]);
      return s + (isFinite(v) ? v : 0);
    }, 0);
  }

  var api = { computeRebalanceTrades: computeRebalanceTrades, roundTo100: roundTo100, sumTargets: sumTargets };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof root !== "undefined") {
    root.computeRebalanceTrades = computeRebalanceTrades;
    root.roundTo100 = roundTo100;
    root.sumTargets = sumTargets;
  }
})(typeof window !== "undefined" ? window : globalThis);
