// app/lib/market.js
//
// Piezas puras de la tanda "cinta, noticias y modo oscuro" (oct-2026):
// - sparkSvg: mini gráfico de línea (cinta de mercado y tabla de Mercado).
// - marketStatus: bolsa abierta o cerrada según la zona horaria y el horario
//   regular que trae la cotización, no siempre Nueva York.
// - normalizeFundamentals: porcentajes de Fundamentales en una sola unidad
//   (fracción). Finnhub los manda en % (30,5) y FMP en fracción (0,305); la
//   ficha los multiplicaba por 100 dos veces (ROE de AMZN 3.050 %).
// - fundTags: sector, industria y país sin repetidos ni vacíos.
// - corrShade: una sola escala Navy/pizarra por intensidad para la matriz de
//   correlación (el rojo queda para pérdidas y riesgo).
// No tocan DOM ni red.

(function (root) {
  "use strict";

  // pts: números (cierres). opts: {w, h, stroke}. El color sale de la
  // dirección del período (último frente al primero) salvo que se indique.
  function sparkSvg(pts, opts) {
    opts = opts || {};
    var w = opts.w || 48, h = opts.h || 16;
    var v = (pts || []).filter(function (x) { return x != null && isFinite(x); });
    if (v.length < 2) return "";
    var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v), rng = (mx - mn) || 1;
    var pad = 1;
    var coords = v.map(function (x, i) {
      var cx = (i / (v.length - 1)) * w;
      var cy = pad + (h - 2 * pad) - ((x - mn) / rng) * (h - 2 * pad);
      return cx.toFixed(1) + "," + cy.toFixed(1);
    }).join(" ");
    var up = v[v.length - 1] >= v[0];
    var stroke = opts.stroke || (up ? "var(--pos)" : "var(--neg)");
    return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h +
      '" aria-hidden="true" focusable="false"><polyline points="' + coords +
      '" fill="none" stroke="' + stroke + '" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }
  function sparkUp(pts) {
    var v = (pts || []).filter(function (x) { return x != null && isFinite(x); });
    return v.length < 2 ? null : v[v.length - 1] >= v[0];
  }

  // Nombre de la bolsa por zona horaria de la cotización (Yahoo exchangeTimezoneName).
  var EXCHANGE_BY_TZ = {
    "America/New_York": "Bolsa de Nueva York",
    "America/Santiago": "Bolsa de Santiago",
    "America/Sao_Paulo": "B3 (São Paulo)",
    "America/Mexico_City": "Bolsa Mexicana",
    "America/Argentina/Buenos_Aires": "Bolsa de Buenos Aires",
    "America/Buenos_Aires": "Bolsa de Buenos Aires",
    "America/Lima": "Bolsa de Lima",
    "America/Bogota": "Bolsa de Colombia",
    "America/Toronto": "Bolsa de Toronto",
    "Europe/London": "Bolsa de Londres",
    "Europe/Madrid": "Bolsa de Madrid",
  };

  // q: cotización {timezone, tradingStart, tradingEnd} (ms). opts.fallbackNY:
  // función que dice si Nueva York está abierta (para acciones de EE. UU. sin
  // horario en la cotización). Devuelve {label, open} o null si no se sabe.
  function marketStatus(q, now, opts) {
    opts = opts || {};
    now = now == null ? Date.now() : now;
    var tz = q && q.timezone;
    var name = tz ? EXCHANGE_BY_TZ[tz] : null;
    var hasHours = q && q.tradingStart > 0 && q.tradingEnd > q.tradingStart;
    if (hasHours) {
      var open = now >= q.tradingStart && now < q.tradingEnd;
      var nm = name || (opts.usEquity ? "Bolsa de Nueva York" : null);
      if (!nm) return { label: open ? "Mercado abierto" : "Mercado cerrado", open: open };
      return { label: nm + (open ? " abierta" : " cerrada"), open: open };
    }
    if (opts.usEquity && typeof opts.fallbackNY === "function") {
      var o = !!opts.fallbackNY();
      return { label: "Bolsa de Nueva York" + (o ? " abierta" : " cerrada"), open: o };
    }
    return null;
  }

  var PCT_FIELDS = ["roe", "grossMargin", "netMargin", "operatingMargin", "revenueGrowth"];
  // Devuelve una copia con PCT_FIELDS en fracción (0,305 = 30,5 %).
  // Finnhub: vienen en % → /100. FMP: ya son fracción. Fuente desconocida:
  // un valor con módulo mayor que 2 se toma como % (un margen de 200 % no existe;
  // un crecimiento de 2x sí, pero en fracción sería 2, no 200).
  function normalizeFundamentals(f) {
    if (!f) return f;
    var out = Object.assign({}, f);
    PCT_FIELDS.forEach(function (k) {
      var v = f[k];
      if (v == null || !isFinite(v)) { out[k] = null; return; }
      if (f.source === "finnhub") out[k] = v / 100;
      else if (f.source === "fmp") out[k] = +v;
      else out[k] = Math.abs(v) > 2 ? v / 100 : +v;
    });
    return out;
  }

  function fundTags(f) {
    var seen = {}, out = [];
    [f && f.sector, f && f.industry, f && f.country].forEach(function (x) {
      var s = x == null ? "" : String(x).trim();
      if (!s) return;
      var k = s.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(s);
    });
    return out;
  }

  // r en [-1, 1] → intensidad 0..1 (más alta = se movieron más juntos).
  // Los negativos y los cercanos a 0 quedan en el tono más claro.
  function corrShade(r) {
    if (r == null || !isFinite(r)) return null;
    return Math.max(0, Math.min(1, r));
  }
  function corrBand(r) {
    if (r == null || !isFinite(r)) return null;
    return r > 0.7 ? "alta" : r >= 0.4 ? "media" : "baja";
  }

  var api = {
    sparkSvg: sparkSvg, sparkUp: sparkUp, EXCHANGE_BY_TZ: EXCHANGE_BY_TZ, marketStatus: marketStatus,
    PCT_FIELDS: PCT_FIELDS, normalizeFundamentals: normalizeFundamentals, fundTags: fundTags,
    corrShade: corrShade, corrBand: corrBand,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.InvestMarket = api;
})(typeof window !== "undefined" ? window : globalThis);
