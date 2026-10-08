// app/lib/csv-import.js
//
// Importación de posiciones desde CSV (auditoría UX oct-2026, I01: tercer
// camino del primer ingreso). Acepta el CSV que exporta la propia app
// (Ticker, Tipo, Unidades, Entrada, ...) y encabezados comunes en español o
// inglés. Función pura: devuelve filas válidas y errores por línea.

(function (root) {
  "use strict";

  var COLS = {
    t: ["ticker", "simbolo", "símbolo", "symbol", "activo"],
    sh: ["unidades", "cantidad", "acciones", "shares", "quantity", "qty"],
    cost: ["entrada", "precio de entrada", "costo", "costo promedio", "precio", "avg_cost", "avg cost", "cost", "price"],
    type: ["tipo", "type", "asset_type", "clase"],
    stop: ["stop", "stop loss"],
  };
  var TYPES = { stock: "Stock", accion: "Stock", "acción": "Stock", etf: "ETF", crypto: "Crypto", cripto: "Crypto" };

  function splitLine(line, sep) {
    var out = [], cur = "", q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === sep) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map(function (s) { return s.trim(); });
  }

  // "1.234,56" -> 1234.56 ; "1,234.56" -> 1234.56 ; "$172.50" -> 172.5
  function parseNum(s) {
    if (s == null) return NaN;
    var v = String(s).replace(/[^0-9,.\-]/g, "");
    if (!v) return NaN;
    var lc = v.lastIndexOf(","), ld = v.lastIndexOf(".");
    if (lc > ld) v = v.replace(/\./g, "").replace(",", ".");
    else v = v.replace(/,/g, "");
    return parseFloat(v);
  }

  function parseHoldingsCsv(text) {
    var lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return { rows: [], errors: ["El archivo está vacío."] };
    var sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
    var head = splitLine(lines[0], sep).map(function (h) { return h.toLowerCase(); });
    var idx = {};
    Object.keys(COLS).forEach(function (k) {
      idx[k] = head.findIndex(function (h) { return COLS[k].indexOf(h) >= 0; });
    });
    if (idx.t < 0 || idx.sh < 0 || idx.cost < 0) {
      return { rows: [], errors: ["Faltan columnas: se necesitan Ticker, Unidades y Entrada (precio de compra)."] };
    }
    var rows = [], errors = [];
    for (var i = 1; i < lines.length; i++) {
      var c = splitLine(lines[i], sep);
      var t = String(c[idx.t] || "").toUpperCase().replace(/\s+/g, "");
      if (!t || t === "TOTAL") continue;
      if (!/^[A-Z0-9.\-^=]{1,15}$/.test(t)) { errors.push("Línea " + (i + 1) + ": ticker no válido (" + t + ")."); continue; }
      var sh = parseNum(c[idx.sh]);
      var cost = parseNum(c[idx.cost]);
      if (!(sh > 0)) { errors.push("Línea " + (i + 1) + ": unidades no válidas."); continue; }
      if (!(cost > 0)) { errors.push("Línea " + (i + 1) + ": precio de entrada no válido."); continue; }
      var type = idx.type >= 0 ? TYPES[String(c[idx.type] || "").toLowerCase()] || "Stock" : "Stock";
      var row = { t: t, type: type, sh: sh, cost: cost };
      if (idx.stop >= 0) {
        var st = parseNum(c[idx.stop]);
        if (st > 0) row.stop = st;
      }
      rows.push(row);
    }
    if (!rows.length && !errors.length) errors.push("No se encontraron posiciones en el archivo.");
    return { rows: rows, errors: errors };
  }

  var api = { parseHoldingsCsv: parseHoldingsCsv, parseNum: parseNum };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.InvestCsv = api;
})(typeof window !== "undefined" ? window : globalThis);
