// app/lib/portfolio-history.js
//
// L3 (21-oct-2026): serie del valor del portafolio en el tiempo para el gráfico
// de Hoy. Funciones puras, sin DOM ni red.
//
// Qué mide, con honestidad: el valor de las posiciones de HOY (mismas unidades)
// al cierre de cada día, pasado a USD con el tipo de cambio de cada día. Invest
// no guarda la fecha de compra de cada posición, así que la serie no incluye
// compras, ventas ni dividendos del período; la interfaz lo dice al pie.
//
// Entradas:
//   positions: [{t, sh, ccy}]                 ccy = moneda de cotización del activo
//   histories: {ticker: [{ts, close}]}         ts en segundos (como /api/history)
//   fxHist:    {CCY: [{ts, close}]}            unidades de CCY por 1 USD (Yahoo "CCY=X")
//   opts.fxNow: {CCY: tasa}                    respaldo si falta el histórico de esa moneda
//   opts.weekdaysOnly: true                    descarta sábados y domingos (si hay acciones)

(function (root) {
  "use strict";

  var DAY = 86400;

  function dayKey(ts) {
    var d = new Date(ts * 1000);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function keyTs(k) { return Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 1000; }
  function isWeekend(k) { var w = new Date(keyTs(k) * 1000).getUTCDay(); return w === 0 || w === 6; }

  // [{ts, close}] -> {dayKey: close} (el último cierre del día manda).
  function byDay(rows) {
    var out = {};
    (rows || []).forEach(function (r) {
      var c = Number(r && r.close);
      if (r && isFinite(r.ts) && isFinite(c) && c > 0) out[dayKey(r.ts)] = c;
    });
    return out;
  }

  // Valor de cierre en `k` o el último anterior (relleno hacia adelante).
  function filler(map) {
    var keys = Object.keys(map).sort();
    var i = 0, last = null;
    return function (k) {
      while (i < keys.length && keys[i] <= k) { last = map[keys[i]]; i++; }
      return last;
    };
  }

  function buildSeries(positions, histories, fxHist, opts) {
    opts = opts || {};
    var fxNow = opts.fxNow || {};
    var included = [], missing = [], fxApprox = [];
    var maps = [];
    (positions || []).forEach(function (p) {
      var m = byDay(histories && histories[p.t]);
      var keys = Object.keys(m);
      if (keys.length < 2 || !(p.sh > 0)) { missing.push(p.t); return; }
      var ccy = p.ccy || "USD", fxMap = null, rateNow = null;
      if (ccy !== "USD") {
        fxMap = byDay(fxHist && fxHist[ccy]);
        if (!Object.keys(fxMap).length) {
          rateNow = Number(fxNow[ccy]);
          if (!(isFinite(rateNow) && rateNow > 0)) { missing.push(p.t); return; }
          if (fxApprox.indexOf(ccy) < 0) fxApprox.push(ccy);
          fxMap = null;
        }
      }
      included.push(p.t);
      maps.push({ p: p, m: m, first: keys.sort()[0], fx: fxMap, fxFirst: fxMap ? Object.keys(fxMap).sort()[0] : null, rateNow: rateNow });
    });
    if (!maps.length) return { points: [], included: included, missing: missing, fxApprox: fxApprox };

    // Días: la unión de todas las fechas, desde que TODAS las posiciones tienen
    // dato (antes faltarían posiciones y la línea saltaría al sumarse).
    var start = maps.reduce(function (a, x) { return x.first > a ? x.first : a; }, "");
    var all = {};
    maps.forEach(function (x) { Object.keys(x.m).forEach(function (k) { if (k >= start) all[k] = 1; }); });
    var days = Object.keys(all).sort();
    if (opts.weekdaysOnly) days = days.filter(function (k) { return !isWeekend(k); });

    maps.forEach(function (x) {
      x.px = filler(x.m);
      if (x.fx) { x.fxf = filler(x.fx); x.fxStart = x.fx[x.fxFirst]; }
    });
    var points = [];
    days.forEach(function (k) {
      var v = 0;
      for (var i = 0; i < maps.length; i++) {
        var x = maps[i], px = x.px(k);
        if (px == null) return;
        var r = 1;
        if (x.fx) r = x.fxf(k) || x.fxStart; else if (x.rateNow) r = x.rateNow;
        v += (x.p.sh * px) / r;
      }
      points.push({ ts: keyTs(k), v: v });
    });
    return { points: points, included: included, missing: missing, fxApprox: fxApprox };
  }

  // Recorta la serie al rango. now: segundos (por defecto, el último punto).
  // 1M y 3M cuentan días corridos; YTD desde el 1 de enero del año del último
  // punto; 1A un año; MAX todo lo que haya.
  function sliceRange(points, range, now) {
    if (!points || !points.length) return [];
    var last = now || points[points.length - 1].ts;
    var from;
    if (range === "1M") from = last - 31 * DAY;
    else if (range === "3M") from = last - 92 * DAY;
    else if (range === "YTD") from = Date.UTC(new Date(last * 1000).getUTCFullYear(), 0, 1) / 1000;
    else if (range === "1A") from = last - 366 * DAY;
    else from = -Infinity;
    var out = points.filter(function (p) { return p.ts >= from; });
    // Sin puntos en el rango (p. ej. YTD el 2 de enero): al menos los dos últimos.
    return out.length >= 2 ? out : points.slice(-2);
  }

  // Índice de comparación con el mismo punto de partida que la serie.
  function rebase(indexRows, points) {
    if (!points || !points.length) return [];
    var f = filler(byDay(indexRows));
    var base = null, out = [];
    points.forEach(function (p) {
      var c = f(dayKey(p.ts));
      if (c == null) { out.push({ ts: p.ts, v: null }); return; }
      if (base == null) base = c;
      out.push({ ts: p.ts, v: points[0].v * (c / base) });
    });
    return out;
  }

  function change(points) {
    var a = null, b = null;
    for (var i = 0; i < (points || []).length; i++) if (points[i].v != null) { a = points[i]; break; }
    for (var j = (points || []).length - 1; j >= 0; j--) if (points[j].v != null) { b = points[j]; break; }
    if (!a || !b) return null;
    return { from: a.v, to: b.v, abs: b.v - a.v, pct: a.v > 0 ? (b.v - a.v) / a.v : 0 };
  }

  var api = { buildSeries: buildSeries, sliceRange: sliceRange, rebase: rebase, change: change, dayKey: dayKey };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.InvestPvh = api;
})(typeof window !== "undefined" ? window : globalThis);
