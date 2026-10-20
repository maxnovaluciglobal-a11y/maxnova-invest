// app/lib/fx.js
//
// Monedas por activo (oct-2026). /api/quote devuelve cada precio en la moneda
// de su bolsa: SQM-B.SN en CLP, PETR4.SA en BRL, WALMEX.MX en MXN. La app
// trataba todo precio como USD, asi que 100 acciones de SQM-B.SN (CLP 63.190)
// sumaban US$6,3 millones al portafolio.
//
// Regla de este modulo:
// - Un activo se muestra en su propia moneda (precio, entrada, stop, alertas).
// - Todo AGREGADO entre posiciones (valor, resultado, pesos, riesgo al stop,
//   objetivos, aportes, capital) se calcula en USD, convirtiendo cada posicion
//   con toUsd().
// - Sin tipo de cambio para su moneda, la posicion NO se cuenta como 1:1: queda
//   fuera de los agregados y la UI dice cuantas quedaron fuera (igual que
//   "sin stop").
//
// rates: unidades de la moneda por 1 USD, como devuelve /api/fx-latam
// ({CLP: 940.1, BRL: 5.4, ...}). USD no necesita tasa.
//
// Funciones puras: no tocan DOM, LIVE ni localStorage.

(function (root) {
  "use strict";

  // Sufijo de Yahoo Finance -> moneda de cotizacion, para cuando todavia no
  // llego la cotizacion (que trae su propia moneda y manda sobre esto).
  var SUFFIX_CCY = {
    SN: "CLP", // Bolsa de Santiago
    SA: "BRL", // B3 (Sao Paulo)
    MX: "MXN", // Bolsa Mexicana
    BA: "ARS", // Buenos Aires
    LM: "PEN", // Lima
    CL: "COP", // Colombia
  };

  // Monedas que se muestran sin decimales.
  var NO_DECIMALS = { CLP: true, COP: true, JPY: true, KRW: true };

  function normCcy(c) {
    if (c == null) return null;
    var s = String(c).trim();
    if (!s) return null;
    // GBp (peniques) e ILA (agorot) no son la moneda mayor: se respetan tal cual
    // para que no se conviertan con la tasa de GBP/ILS.
    if (s === "GBp" || s === "ILA" || s === "ZAc") return s;
    return s.toUpperCase();
  }

  // Moneda de un activo. quoteCcy (la que trae la cotizacion) manda; si no hay,
  // se infiere por el sufijo del ticker. Sin sufijo -> USD (acciones, ETF y
  // cripto -USD de EE. UU.). Sufijo desconocido -> null (moneda desconocida:
  // la posicion queda fuera de los agregados hasta que llegue la cotizacion).
  function currencyOf(ticker, quoteCcy) {
    var q = normCcy(quoteCcy);
    if (q) return q;
    var t = String(ticker || "").toUpperCase().trim();
    var m = /\.([A-Z]{1,3})$/.exec(t);
    if (!m) return "USD";
    return SUFFIX_CCY[m[1]] || null;
  }

  // Unidades de ccy por 1 USD, o null si no hay tasa usable.
  function rateOf(ccy, rates) {
    var c = normCcy(ccy);
    if (!c) return null;
    if (c === "USD") return 1;
    var r = rates ? Number(rates[c]) : NaN;
    return isFinite(r) && r > 0 ? r : null;
  }

  // Monto en ccy -> USD. null si falta la tasa o el monto no es un numero.
  // En USD devuelve el mismo numero, sin operar (cifras identicas a antes).
  function toUsd(amount, ccy, rates) {
    if (amount == null || !isFinite(amount)) return null;
    var r = rateOf(ccy, rates);
    if (r == null) return null;
    return r === 1 ? +amount : amount / r;
  }

  // Monto en USD -> ccy (para mostrar un calculo en USD en la moneda del activo).
  function fromUsd(amount, ccy, rates) {
    if (amount == null || !isFinite(amount)) return null;
    var r = rateOf(ccy, rates);
    if (r == null) return null;
    return r === 1 ? +amount : amount * r;
  }

  // Tipo de cambio de la compra (unidades de la moneda por 1 USD) guardado en la
  // posicion, o null si no hay uno valido (FIN-12).
  function fxCostOf(h) {
    var f = h ? Number(h.fxCost) : NaN;
    return h && h.fxCost != null && isFinite(f) && f > 0 ? f : null;
  }

  function decimalsFor(ccy) {
    return NO_DECIMALS[normCcy(ccy)] ? 0 : 2;
  }

  // Posiciones convertidas a USD para los agregados.
  // port: [{t, sh, cost, cur, stop?, ...}] con precios en la moneda del activo.
  // ccyOf: function(ticker) -> moneda. Devuelve:
  //   rows: copias con cost/cur/stop en USD y los originales en costN/curN/stopN,
  //         mas ccy y fx (tasa usada). En USD los valores no se tocan.
  //   excluded: copias (sin convertir) de las posiciones sin tipo de cambio,
  //         con ccy, para mostrarlas aparte con "sin tipo de cambio".
  function convertHoldings(port, ccyOf, rates) {
    var rows = [];
    var excluded = [];
    (port || []).forEach(function (h) {
      var ccy = ccyOf ? ccyOf(h.t) : currencyOf(h.t);
      var r = rateOf(ccy, rates);
      var base = { ccy: ccy, costN: h.cost, curN: h.cur, stopN: h.stop };
      if (r == null) {
        excluded.push(Object.assign({}, h, base, { fx: null }));
        return;
      }
      var conv = function (v) { return r === 1 || v == null || !isFinite(v) ? v : v / r; };
      var fc = r === 1 ? null : fxCostOf(h);
      rows.push(Object.assign({}, h, base, {
        fx: r,
        fxCost: fc,
        // Costo total en USD al tipo de cambio de la compra (null si no se conoce).
        costUsdBuy: fc ? (h.sh * h.cost) / fc : null,
        cost: conv(h.cost),
        cur: conv(h.cur),
        stop: h.stop > 0 ? conv(h.stop) : h.stop,
      }));
    });
    return { rows: rows, excluded: excluded };
  }

  // Valor, Hoy y Total del portafolio en USD (lo que antes hacia dashTotals en
  // index.html, sin conversion). liveOf(t) -> cotizacion {price, changePct} o
  // null. Las posiciones sin precio suman a su costo y no a "Hoy" (missing);
  // las sin tipo de cambio no suman a nada (excluded).
  // Para un portafolio solo en USD el resultado es identico, operacion por
  // operacion, al dashTotals anterior.
  function portfolioTotals(port, liveOf, ccyOf, rates) {
    var value = 0, cost = 0, day = 0, priced = 0, excluded = 0, counted = 0;
    var fxEffect = 0, fxKnown = 0, fxUnknown = 0;
    (port || []).forEach(function (h) {
      var ccy = ccyOf ? ccyOf(h.t) : currencyOf(h.t);
      var r = rateOf(ccy, rates);
      if (r == null) { excluded++; return; }
      counted++;
      var conv = function (v) { return r === 1 ? v : v / r; };
      var lq = liveOf ? liveOf(h.t) : null;
      var px = lq && lq.price > 0 ? lq.price : null;
      // El costo va al tipo de cambio de la compra si se conoce (FIN-12); la
      // diferencia con el de hoy es el efecto cambiario, que se informa aparte.
      var fc = r === 1 ? null : fxCostOf(h);
      if (fc) {
        cost += (h.sh * h.cost) / fc;
        fxEffect += (h.sh * h.cost) / r - (h.sh * h.cost) / fc;
        fxKnown++;
      } else {
        cost += conv(h.sh * h.cost);
        if (r !== 1) fxUnknown++;
      }
      value += conv(h.sh * (px || h.cost));
      if (px) {
        priced++;
        var cp = lq.changePct || 0;
        var prev = px / (1 + cp);
        day += conv(h.sh * (px - prev));
      }
    });
    return {
      value: value,
      cost: cost,
      total: value - cost,
      totalPct: cost > 0 ? (value - cost) / cost : 0,
      day: day,
      dayPct: (value - day) > 0 ? day / (value - day) : 0,
      priced: priced,
      missing: counted - priced,
      excluded: excluded,
      fxEffect: fxEffect,
      fxKnown: fxKnown,
      fxUnknown: fxUnknown,
    };
  }

  // Suma en USD de montos en distintas monedas.
  // items: cualquier lista; amountOf(item) -> monto; ccyOf(item) -> moneda.
  // Devuelve {total, excluded, items:[{item, usd}]} (solo los convertidos).
  function sumUsd(items, amountOf, ccyOf, rates) {
    var total = 0, excluded = 0, out = [];
    (items || []).forEach(function (it) {
      var a = amountOf(it);
      if (a == null || !isFinite(a)) return;
      var usd = toUsd(a, ccyOf(it), rates);
      if (usd == null) { excluded++; return; }
      total += usd;
      out.push({ item: it, usd: usd });
    });
    return { total: total, excluded: excluded, items: out };
  }

  // Tipo de cambio del peso argentino (UXP-8). kind: "MEP" (por defecto) u
  // "Oficial". mep: {rate, date} de /api/fx-ars (DolarApi) o null. oficial:
  // unidades de ARS por 1 USD del tipo oficial, o null. Devuelve
  // {rate, kind, fallback, date} (kind = el que se usa de verdad; fallback = se
  // pidio el MEP y no habia, asi que va el oficial) o null si no hay ninguno.
  function arsRate(kind, mep, oficial) {
    var m = mep ? Number(mep.rate) : NaN;
    var o = Number(oficial);
    var okM = isFinite(m) && m > 0;
    var okO = oficial != null && isFinite(o) && o > 0;
    if (kind !== "Oficial" && okM) {
      return { rate: m, kind: "MEP", fallback: false, date: mep.date || null };
    }
    if (okO) return { rate: o, kind: "Oficial", fallback: kind !== "Oficial", date: null };
    if (okM) return { rate: m, kind: "MEP", fallback: true, date: mep.date || null };
    return null;
  }

  var api = {
    SUFFIX_CCY: SUFFIX_CCY,
    currencyOf: currencyOf,
    rateOf: rateOf,
    toUsd: toUsd,
    fromUsd: fromUsd,
    decimalsFor: decimalsFor,
    fxCostOf: fxCostOf,
    convertHoldings: convertHoldings,
    portfolioTotals: portfolioTotals,
    sumUsd: sumUsd,
    arsRate: arsRate,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof root !== "undefined") {
    root.InvestFx = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
