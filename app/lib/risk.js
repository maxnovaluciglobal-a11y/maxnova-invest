// app/lib/risk.js
//
// Extraido de app/index.html (renderRiskBody / pbCalc) el 13-sep-2026.
// Es el calculo puro de "cuanto arriesgar por posicion" (position sizing),
// mencionado en la auditoria de FinanceOS/Invest como la feature paga
// "Riesgo y Sizing" ($9.99/mes). Antes vivia duplicado a mano en dos lugares
// (renderRiskBody para "Mis posiciones" y pbCalc para "Nueva posicion"),
// exactamente el mismo patron que ya se documento al extraer
// app/lib/rebalance.js — ver el comentario original en renderRisk():
//   renderRisk:  ps = rA/_r*h.cur           con rA = capital*0.02
//   pbCompute:   posSize = riskAmt/riskPct  con riskPct = (price-stop)/price
// que es la misma ecuacion: riskAmt*price/(price-stop).
//
// IMPORTANTE (fix de copy, no toca la logica): -8%/+15% NO son datos
// historicos reales calculados por ticker — son una referencia estandar fija
// usada como default cuando el usuario no cargo su propio stop. La UI dejo
// de llamarlos "Histórico" y ahora dice "Referencia estándar" (ver
// renderRiskBody en index.html). Este modulo documenta esa constante para
// que quede explicita en un solo lugar.
//
// No toca DOM ni Supabase: son funciones puras.

(function (root) {
  "use strict";

  // Referencia estandar (no historica, no por-ticker) usada como default de
  // stop-loss / take-profit cuando el usuario no definio los suyos.
  var DEFAULT_STOP_PCT = 0.08;   // -8%
  var DEFAULT_TARGET_PCT = 0.15; // +15%

  // portfolio: [{t, cur, stop?}], capital: number, riskPctOfCapital: 0-1 (default .02 = 2%)
  // Devuelve rA (riesgo en $ por operacion) y rows (una fila de sizing por holding),
  // igual que el original de renderRiskBody.
  function computeRiskRows(portfolio, capital, riskPctOfCapital) {
    var rA = capital * (riskPctOfCapital == null ? 0.02 : riskPctOfCapital);
    var rows = (portfolio || []).map(function (h) {
      // El stop debe quedar SIEMPRE por debajo del precio: si no, (cur-stop) es
      // negativo y el R:R se mostraba en negativo en activos volatiles.
      var stop = Math.min(h.stop || h.cur * (1 - DEFAULT_STOP_PCT), h.cur * 0.995);
      var r = Math.max(h.cur - stop, h.cur * 0.005);
      var ps = (rA / r) * h.cur;
      var rr = (h.cur * DEFAULT_TARGET_PCT) / r;
      return { t: h.t, cur: h.cur, stop: stop, ps: ps, rr: rr };
    });
    return { rA: rA, rows: rows };
  }

  // Position Builder ("Nueva posicion"): dado precio/capital/riesgo%/stop/rrTarget
  // explicitos (o vacios, en cuyo caso usa el default -8%), calcula tamano de
  // posicion, unidades, target y R/R real. Misma formula que computeRiskRows,
  // pero con inputs explicitos en vez de tomar el portfolio.
  function computePositionSize(opts) {
    var price = opts.price;
    var capital = opts.capital;
    var riskPct = opts.riskPct == null ? 2 : opts.riskPct; // % del capital, ej. 2
    var stop = opts.stop;
    var rrTarget = opts.rrTarget == null ? 2 : opts.rrTarget;

    if (!stop || stop <= 0) stop = price * (1 - DEFAULT_STOP_PCT);
    if (stop >= price) {
      return { error: "stop-not-below-price" };
    }

    var riskPctCalc = (price - stop) / price;
    if (riskPctCalc <= 0) {
      return { error: "invalid-risk-pct" };
    }

    var riskAmt = capital * (riskPct / 100);
    var posSize = riskAmt / riskPctCalc;
    var units = posSize / price;
    var target = price + rrTarget * (price - stop);
    var rrActual = (target - price) / (price - stop);

    return {
      stop: stop,
      riskPct: riskPctCalc,
      riskAmt: riskAmt,
      posSize: posSize,
      units: units,
      target: target,
      rr: rrActual,
    };
  }

  // Relanzamiento v2 (T18): limite de concentracion por posicion. Es una
  // referencia por defecto que la UI muestra como "tu limite": no es una
  // recomendacion, la persona puede ignorarlo.
  var DEFAULT_CONCENTRATION_LIMIT = 0.25; // 25 % del capital o del portafolio

  // "Riesgo al stop": cuanto se pierde si el precio toca el stop, por posicion
  // y en total. portfolio: [{t, sh, cur, stop?}]. capital: base para el %.
  // opts.estimateMissing (default true): sin stop propio se estima con -8 %
  // y la fila se marca stopIsDefault. Con estimateMissing=false (I03: la
  // columna stop existe), la fila queda "sin stop": riskAtStop null, no suma
  // al total y cuenta en noStopCount.
  // Devuelve {rows:[{t, value, weight, stop, stopIsDefault, noStop,
  // riskAtStop, riskPctCapital, overLimit}], totalValue, totalRisk,
  // totalRiskPct, noStopCount, limit}.
  function computeRiskAtStop(portfolio, capital, limit, opts) {
    limit = limit == null ? DEFAULT_CONCENTRATION_LIMIT : limit;
    var estimate = !(opts && opts.estimateMissing === false);
    var list = portfolio || [];
    var totalValue = list.reduce(function (s, h) { return s + (h.sh || 0) * (h.cur || 0); }, 0);
    var base = capital > 0 ? capital : totalValue;
    var totalRisk = 0;
    var noStopCount = 0;
    var rows = list.map(function (h) {
      var value = (h.sh || 0) * (h.cur || 0);
      var weight = totalValue > 0 ? value / totalValue : 0;
      // En modo estimacion se mantiene la regla anterior: un stop sobre el
      // precio se ignora. Con stops reales (I03) se respeta y la perdida es 0.
      var ownStop = h.stop != null && h.stop > 0 && (!estimate || h.stop < h.cur);
      if (!ownStop && !estimate) {
        noStopCount++;
        return { t: h.t, value: value, weight: weight, stop: null, stopIsDefault: false, noStop: true,
          riskAtStop: null, riskPctCapital: null, overLimit: weight > limit };
      }
      var stop = ownStop ? h.stop : h.cur * (1 - DEFAULT_STOP_PCT);
      // Un stop por encima del precio actual ya no tiene perdida pendiente: 0.
      var risk = Math.max(0, (h.cur - stop) * (h.sh || 0));
      totalRisk += risk;
      return {
        t: h.t,
        value: value,
        weight: weight,
        stop: stop,
        stopIsDefault: !ownStop,
        noStop: false,
        riskAtStop: risk,
        riskPctCapital: base > 0 ? risk / base : 0,
        overLimit: weight > limit,
      };
    });
    return {
      rows: rows,
      totalValue: totalValue,
      totalRisk: totalRisk,
      totalRiskPct: base > 0 ? totalRisk / base : 0,
      noStopCount: noStopCount,
      limit: limit,
    };
  }

  // Calculadora: si la posicion supera el limite de concentracion sobre el
  // capital, devuelve cuantas unidades enteras caben dentro del limite y el
  // peso resultante. Null si no lo supera.
  function concentrationAlternative(price, units, capital, limit) {
    limit = limit == null ? DEFAULT_CONCENTRATION_LIMIT : limit;
    if (!(price > 0) || !(capital > 0)) return null;
    var weight = (price * units) / capital;
    if (weight <= limit) return null;
    var maxUnits = Math.floor((capital * limit) / price);
    return { weight: weight, maxUnits: maxUnits, weightAtMax: (maxUnits * price) / capital, limit: limit };
  }

    // Calculadora M12 (auditoria UX oct-2026, I04): unidades ENTERAS (o con 4
  // decimales si el activo admite fracciones, como cripto), exposicion,
  // perdida al stop y tabla en multiplos de R. Si no hay stop propio se usa la
  // referencia -8 % y se marca como estimacion.
  // opts: {capital, riskPct (ej. 2), entry, stop?, limit?, fractional?}
  function computeSizing(opts) {
    var capital = Number(opts.capital);
    var riskPct = opts.riskPct == null ? 2 : Number(opts.riskPct);
    var entry = Number(opts.entry);
    var limit = opts.limit == null ? DEFAULT_CONCENTRATION_LIMIT : opts.limit;
    if (!(entry > 0)) return { error: "no-entry" };
    if (!(capital > 0)) return { error: "no-capital" };
    if (!(riskPct > 0)) return { error: "no-risk" };
    var stop = Number(opts.stop);
    var stopIsEstimate = false;
    if (!(stop > 0)) {
      stop = entry * (1 - DEFAULT_STOP_PCT);
      stopIsEstimate = true;
    }
    if (stop >= entry) return { error: "stop-not-below-price" };
    var perUnit = entry - stop;
    var riskBudget = capital * (riskPct / 100);
    var raw = riskBudget / perUnit;
    // Redondeo hacia abajo: nunca arriesgar mas que la regla.
    var units = opts.fractional ? Math.floor(raw * 1e4 + 1e-9) / 1e4 : Math.floor(raw + 1e-9);
    var exposure = units * entry;
    var lossAtStop = units * perUnit;
    return {
      entry: entry,
      stop: stop,
      stopIsEstimate: stopIsEstimate,
      perUnitRisk: perUnit,
      riskBudget: riskBudget,
      units: units,
      exposure: exposure,
      exposurePct: exposure / capital,
      lossAtStop: lossAtStop,
      lossPct: lossAtStop / capital,
      concentration: concentrationAlternative(entry, units, capital, limit),
      rTable: rMultiples(entry, stop, units),
    };
  }

  // Escenarios en multiplos de R (R = entrada - stop): Stop, +1R, +2R, +3R.
  function rMultiples(entry, stop, units, multiples) {
    var r = entry - stop;
    var list = multiples || [-1, 1, 2, 3];
    return list.map(function (m) {
      return {
        label: m === -1 ? "Stop" : (m > 0 ? "+" : "") + m + "R",
        r: m,
        price: entry + m * r,
        pnl: m * r * units,
      };
    });
  }

  var api = {
    computeSizing: computeSizing,
    rMultiples: rMultiples,
    DEFAULT_CONCENTRATION_LIMIT: DEFAULT_CONCENTRATION_LIMIT,
    computeRiskAtStop: computeRiskAtStop,
    concentrationAlternative: concentrationAlternative,
    DEFAULT_STOP_PCT: DEFAULT_STOP_PCT,
    DEFAULT_TARGET_PCT: DEFAULT_TARGET_PCT,
    computeRiskRows: computeRiskRows,
    computePositionSize: computePositionSize,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof root !== "undefined") {
    root.computeRiskRows = computeRiskRows;
    root.computePositionSize = computePositionSize;
    root.RISK_DEFAULT_STOP_PCT = DEFAULT_STOP_PCT;
    root.RISK_DEFAULT_TARGET_PCT = DEFAULT_TARGET_PCT;
    root.computeRiskAtStop = computeRiskAtStop;
    root.concentrationAlternative = concentrationAlternative;
    root.RISK_CONCENTRATION_LIMIT = DEFAULT_CONCENTRATION_LIMIT;
    root.computeSizing = computeSizing;
    root.rMultiples = rMultiples;
  }
})(typeof window !== "undefined" ? window : globalThis);
