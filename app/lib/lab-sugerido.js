// app/lib/lab-sugerido.js
//
// EXPERIMENTO INTERNO, no publicado. Calculadora de monto por niveles de media móvil, como la
// de Capital Planner. Choca con PRODUCT.md ("sugerido", frontera LEG-10), así que solo carga
// para las cuentas de lab-gate.js mientras Walter decide. Es el único archivo excluido de
// test/copy-guard.test.js. No enlazar desde landing, novedades ni newsletter.

(function (root) {
  "use strict";

  var DEFAULT_RULES = [{ sma: 200, pct: 50 }, { sma: 100, pct: 25 }, { sma: 50, pct: 15 }, { sma: 20, pct: 10 }];
  var DEFAULT_RSI = { min: 30, max: 50 };

  // ── Cálculo (puro) ──
  function normalizeRules(raw) {
    var out = (Array.isArray(raw) ? raw : [])
      .map(function (r) { return { sma: Math.round(Number(r && r.sma)), pct: Number(r && r.pct) }; })
      .filter(function (r) { return r.sma > 0 && r.pct > 0 && r.pct <= 100; })
      .sort(function (a, b) { return b.sma - a.sma; });
    return out.length ? out : DEFAULT_RULES.map(function (r) { return { sma: r.sma, pct: r.pct }; });
  }
  function normalizeRsi(raw) {
    var min = Number(raw && raw.min), max = Number(raw && raw.max);
    if (!(min >= 0) || !(max <= 100) || !(min < max)) return { min: DEFAULT_RSI.min, max: DEFAULT_RSI.max };
    return { min: min, max: max };
  }
  // Nivel actual: la media más larga con el precio en o bajo ella. null = sobre todas.
  function detectLevel(price, smas, rules) {
    if (!(price > 0)) return null;
    var list = normalizeRules(rules);
    for (var i = 0; i < list.length; i++) {
      var v = smas && smas[list[i].sma];
      if (v > 0 && price <= v) return list[i];
    }
    return null;
  }
  function fundOf(capital, weightPct) {
    return capital > 0 && weightPct > 0 ? (capital * weightPct) / 100 : 0;
  }
  function suggestedAmount(fund, rule) {
    return fund > 0 && rule ? (fund * rule.pct) / 100 : 0;
  }
  function estimatedUnits(amount, price) {
    return amount > 0 && price > 0 ? amount / price : 0;
  }
  function rsiInZone(rsi, zone) {
    if (rsi == null || !isFinite(rsi)) return null;
    return rsi >= zone.min && rsi <= zone.max;
  }

  var api = {
    DEFAULT_RULES: DEFAULT_RULES, DEFAULT_RSI: DEFAULT_RSI, normalizeRules: normalizeRules, normalizeRsi: normalizeRsi,
    detectLevel: detectLevel, fundOf: fundOf, suggestedAmount: suggestedAmount, estimatedUnits: estimatedUnits, rsiInZone: rsiInZone,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root === "undefined" || !root.document) return;

  // ── Pantalla ──
  var L = { t: null, weight: null, capital: null, level: null, amount: null, data: {}, loading: null, rulesOpen: false };

  function uid() { return typeof S !== "undefined" && S.user && S.user.id; }
  function gateOk() { return !!(root.InvestLabGate && root.InvestLabGate.allowed(uid())); }
  function key() { return "lab_rules_" + uid(); }
  function cfg() {
    try {
      var c = JSON.parse(root.localStorage.getItem(key()) || "{}") || {};
      return { rules: normalizeRules(c.rules), rsi: normalizeRsi(c.rsi) };
    } catch (e) { return { rules: normalizeRules(null), rsi: normalizeRsi(null) }; }
  }
  function saveCfg(c) {
    try { root.localStorage.setItem(key(), JSON.stringify(c)); } catch (e) { /* solo este navegador */ }
  }
  function tickers() {
    var wl = (S.watchlist || []).map(function (w) { return typeof w === "string" ? w : w && w.ticker; });
    return Array.from(new Set(S.portfolio.map(function (h) { return h.t; }).concat(wl))).filter(Boolean).sort();
  }
  function defaultWeight(t) {
    try { root.rebalLoadTargets(); } catch (e) { /* sin objetivos */ }
    var v = root.REBAL && root.REBAL.targets && Number(root.REBAL.targets[t]);
    return v > 0 ? v : null;
  }
  function defaultCapital() {
    if (S.capital > 0) return S.capital;
    var b = root.ledgerBook();
    return b.value > 0 ? Math.round(b.value) : null;
  }
  async function loadTicker(t) {
    if (L.data[t] || L.loading === t) return;
    L.loading = t;
    root.renderMain();
    var hist = null;
    try { hist = await root.fetchHistory(t, "1y"); } catch (e) { hist = null; }
    var closes = (hist || []).map(function (d) { return d.close; }).filter(function (c) { return c > 0; });
    L.data[t] = closes.length >= 20 ? { closes: closes, last: closes[closes.length - 1] } : { failed: true };
    L.loading = null;
    if (S.page === "lab") root.renderMain();
  }
  function smasFor(d, rules) {
    var o = {};
    rules.forEach(function (r) { o[r.sma] = root._smaLast(d.closes, r.sma); });
    return o;
  }
  function field(id, label, value, handler, extra) {
    return '<div class="calc-field"><label for="' + id + '">' + label + "</label>" +
      '<input id="' + id + '" class="inp num" type="number" inputmode="decimal" min="0" step="any" value="' + (value == null ? "" : value) +
      '" onchange="' + handler + '(this.value)"' + (extra || "") + "/></div>";
  }

  function render() {
    var main = root.document.getElementById("main");
    if (!gateOk()) { main.innerHTML = ""; return; }
    var esc = root.esc, icon = root.icon;
    var c = cfg(), list = tickers();
    if (!L.t && list.length) { L.t = list[0]; }
    if (L.t && L.weight == null) L.weight = defaultWeight(L.t);
    if (L.capital == null) L.capital = defaultCapital();

    var d = L.t ? L.data[L.t] : null;
    if (L.t && !d && L.loading !== L.t) { setTimeout(function () { loadTicker(L.t); }, 0); }

    var ccy = L.t ? root.assetCcy(L.t) : "USD";
    var price = L.t ? (root.LIVE[L.t] && root.LIVE[L.t].price) || (d && d.last) || null : null;
    var smas = d && d.closes ? smasFor(d, c.rules) : {};
    var rsiArr = d && d.closes ? root.TI.rsi(d.closes, 14) : null;
    var rsi = rsiArr && rsiArr.length ? rsiArr[rsiArr.length - 1] : null;
    var level = detectLevel(price, smas, c.rules);
    var chosen = c.rules.find(function (r) { return r.sma === L.level; }) || level;
    var fund = fundOf(L.capital, L.weight);
    var usd = suggestedAmount(fund, chosen);
    var calc = root.InvestFx.fromUsd(usd, ccy, root.FX_ASSET);
    var dec = root.InvestFx.decimalsFor(ccy);
    var rounded = calc != null ? +calc.toFixed(dec) : null;
    var amount = L.amount != null ? L.amount : rounded;
    var units = estimatedUnits(amount, price);
    var zoneOk = rsiInZone(rsi, c.rsi);
    var book = root.ledgerBook();
    var avail = book.cashByCcy[ccy] || 0;

    var opts = list.map(function (t) {
      return '<option value="' + esc(t) + '"' + (t === L.t ? " selected" : "") + ">" + esc(t) + "</option>";
    }).join("");
    var banner = '<section class="seed-banner lab-flag" role="note"><div class="seed-banner-body"><div class="seed-banner-t">' +
      icon("warning", "ico-inline") + "Experimento interno: solo visible para tu cuenta. No está publicado.</div></div></section>";

    var form = '<section class="lab-box" aria-labelledby="lab-in-h"><h2 class="port-h2" id="lab-in-h">Posición y fondo</h2>' +
      '<div class="calc-field"><label for="lab-t">Posición</label><select id="lab-t" class="inp" onchange="InvestLab.setTicker(this.value)">' + opts + "</select></div>" +
      field("lab-w", "Peso objetivo (%)", L.weight, "InvestLab.setWeight", ' placeholder="Por ejemplo, 10"') +
      field("lab-c", "Capital (USD)", L.capital, "InvestLab.setCapital") +
      '<dl class="calc-facts"><div><dt>Fondo asignado</dt><dd class="num">' + (fund > 0 ? root.fmtUSD(fund, 2) : "—") + "</dd></div></dl></section>";

    var levels = c.rules.map(function (r) {
      var on = chosen && chosen.sma === r.sma;
      return '<button type="button" class="tab' + (on ? " act" : "") + '" aria-pressed="' + !!on + '" onclick="InvestLab.setLevel(' + r.sma + ')">Media ' + r.sma + " · " + root.fmtPctN(r.pct, 0) + "</button>";
    }).join("");

    var smaRows = c.rules.map(function (r) {
      var v = smas[r.sma], below = v > 0 && price > 0 && price <= v;
      return "<div><dt>Media de " + r.sma + ' días</dt><dd class="num">' + (v > 0 ? root.pxHtml(v, ccy) : "—") +
        " <span>" + (v > 0 ? (below ? "precio en o bajo" : "precio sobre") : "sin dato") + "</span></dd></div>";
    }).join("");

    var facts = !L.t ? '<p class="port-muted">Agrega una posición o un activo a tu lista para usar esta calculadora.</p>' :
      L.loading === L.t ? '<p class="port-muted"><span class="spin-sm"></span> Cargando precios…</p>' :
      d && d.failed ? '<p class="port-muted">' + icon("warning", "ico-inline") + "Sin historia de precios para " + esc(L.t) + ".</p>" :
      '<dl class="calc-facts"><div><dt>Precio actual</dt><dd class="num">' + root.pxHtml(price, ccy) + "</dd></div>" + smaRows +
      '<div><dt>RSI de 14 días</dt><dd class="num">' + (rsi != null ? fmtD(rsi) : "—") + " <span>" +
        (zoneOk == null ? "sin dato" : zoneOk ? "dentro de tu zona" : "fuera de tu zona") + " (" + c.rsi.min + "–" + c.rsi.max + ")</span></dd></div>" +
      '<div><dt>Nivel actual</dt><dd>' + (level ? "Media de " + level.sma + " días" : "Sobre todas tus medias") + "</dd></div></dl>";

    var noFx = calc == null && usd > 0;
    var buy = '<section class="lab-box" aria-labelledby="lab-out-h"><h2 class="port-h2" id="lab-out-h">Monto</h2>' +
      '<div class="cap-ctl"><span class="cap-lbl" id="lab-lv">Nivel elegido</span><div class="li-chips" role="group" aria-labelledby="lab-lv">' + levels + "</div></div>" +
      '<dl class="calc-facts"><div><dt>Monto sugerido</dt><dd class="num">' + (rounded != null && rounded > 0 ? root.pxHtml(rounded, ccy) : "—") + "</dd></div></dl>" +
      (noFx ? '<p class="port-muted">' + icon("warning", "ico-inline") + "Sin tipo de cambio para " + esc(ccy || "esta moneda") + ": no se calcula.</p>" : "") +
      field("lab-a", "Monto a registrar (" + esc(ccy || "—") + ")", amount, "InvestLab.setAmount") +
      '<dl class="calc-facts"><div><dt>Unidades estimadas</dt><dd class="num">' + (units > 0 ? root.fmtUnits(units) : "—") + "</dd></div>" +
      "<div><dt>Efectivo en " + esc(ccy || "—") + '</dt><dd class="num">' + root.pxHtml(avail, ccy) + (amount > avail ? " <span>" + root.warnTag("no alcanza") + "</span>" : "") + "</dd></div></dl>" +
      (L.amount != null && L.amount !== rounded ? '<p class="port-muted">Monto editado: se marca con &#10033; en Movimientos.</p>' : "") +
      '<button type="button" class="btn-big"' + (amount > 0 && price > 0 ? "" : " disabled") + ' onclick="InvestLab.register()">Registrar compra</button></section>';

    var ruleRows = c.rules.map(function (r, i) {
      return '<div class="lab-rule"><label class="sr-only" for="lab-rs-' + i + '">Media en días</label><input id="lab-rs-' + i + '" class="inp num" type="number" min="1" step="1" value="' + r.sma + '"/>' +
        '<label class="sr-only" for="lab-rp-' + i + '">Porcentaje del fondo</label><input id="lab-rp-' + i + '" class="inp num" type="number" min="0" max="100" step="any" value="' + r.pct + '"/></div>';
    }).join("");
    var rules = '<details class="lab-box"' + (L.rulesOpen ? " open" : "") + ' ontoggle="InvestLab.toggleRules(this.open)"><summary class="port-h2">Reglas</summary>' +
      '<p class="port-muted">Media en días y porcentaje del fondo. Se guardan en este navegador.</p>' + ruleRows +
      '<div class="lab-rule"><div class="calc-field"><label for="lab-rmin">RSI mínimo</label><input id="lab-rmin" class="inp num" type="number" min="0" max="100" step="any" value="' + c.rsi.min + '"/></div>' +
      '<div class="calc-field"><label for="lab-rmax">RSI máximo</label><input id="lab-rmax" class="inp num" type="number" min="0" max="100" step="any" value="' + c.rsi.max + '"/></div></div>' +
      '<div class="port-bar"><button type="button" class="btn" onclick="InvestLab.saveRules(' + c.rules.length + ')">Guardar reglas</button>' +
      '<button type="button" class="btn" onclick="InvestLab.resetRules()">Volver a los valores iniciales</button></div></details>';

    main.innerHTML = "<style>.lab-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px;align-items:start}" +
      ".lab-box{display:flex;flex-direction:column;gap:12px;padding:16px 18px;background:var(--card);border:1px solid var(--border2);border-radius:var(--r-md);min-width:0}" +
      ".lab-box .calc-field{margin-bottom:0}.lab-box summary{cursor:pointer;min-height:44px;display:flex;align-items:center;margin:0}" +
      ".lab-rule{display:grid;grid-template-columns:1fr 1fr;gap:8px}.lab-rule .inp{min-height:44px;width:100%}.lab-flag{border-color:var(--amber)}.lab-flag .ico-inline{margin-right:6px}" +
      ".lab-box .tab,.lab-box .btn-big{min-height:44px}.lab-box select.inp{width:100%;min-height:44px}</style>" +
      '<div class="port-wrap pv">' + banner + '<div class="lab-grid">' + form +
      '<section class="lab-box" aria-labelledby="lab-d-h"><h2 class="port-h2" id="lab-d-h">Datos de ' + esc(L.t || "—") + "</h2>" + facts + "</section>" +
      buy + rules + "</div></div>";
  }

  function set(k, v) {
    L[k] = v;
    L.amount = null;
    root.renderMain();
  }
  function posNum(v) {
    var n = parseFloat(v);
    return n > 0 ? n : null;
  }

  root.InvestLab = Object.assign(api, {
    init: function () {
      if (!gateOk()) return;
      root.registerExtraTab("planificar", { slug: "laboratorio", label: "Laboratorio", page: "lab" }, render);
      root.renderMainNav();
    },
    setTicker: function (t) { L.t = t; L.weight = null; L.level = null; L.amount = null; root.renderMain(); },
    setWeight: function (v) { set("weight", posNum(v)); },
    setCapital: function (v) { set("capital", posNum(v)); },
    setLevel: function (sma) { set("level", sma); },
    setAmount: function (v) { L.amount = posNum(v); root.renderMain(); },
    toggleRules: function (open) { L.rulesOpen = open; },
    saveRules: function (n) {
      var doc = root.document, rules = [];
      for (var i = 0; i < n; i++) rules.push({ sma: doc.getElementById("lab-rs-" + i).value, pct: doc.getElementById("lab-rp-" + i).value });
      saveCfg({ rules: normalizeRules(rules), rsi: normalizeRsi({ min: doc.getElementById("lab-rmin").value, max: doc.getElementById("lab-rmax").value }) });
      L.level = null; L.amount = null;
      root.showToast("Reglas guardadas");
      root.renderMain();
    },
    resetRules: function () {
      saveCfg({ rules: DEFAULT_RULES, rsi: DEFAULT_RSI });
      L.level = null; L.amount = null;
      root.renderMain();
    },
    register: function () {
      if (!gateOk() || !L.t) return;
      var c = cfg(), d = L.data[L.t] || {}, ccy = root.assetCcy(L.t);
      var price = (root.LIVE[L.t] && root.LIVE[L.t].price) || d.last;
      var smas = d.closes ? smasFor(d, c.rules) : {};
      var level = detectLevel(price, smas, c.rules);
      var chosen = c.rules.find(function (r) { return r.sma === L.level; }) || level;
      var calc = root.InvestFx.fromUsd(suggestedAmount(fundOf(L.capital, L.weight), chosen), ccy, root.FX_ASSET);
      var rounded = calc != null ? +calc.toFixed(root.InvestFx.decimalsFor(ccy)) : null;
      var amount = L.amount != null ? L.amount : rounded;
      var rsiArr = d.closes ? root.TI.rsi(d.closes, 14) : null;
      var rsi = rsiArr && rsiArr.length ? rsiArr[rsiArr.length - 1] : null;
      root.openModal("addtrade", {
        type: "buy", t: L.t, price: price, amount: amount, qty: estimatedUnits(amount, price), refAmount: rounded,
        cash: true, rsi: rsi != null ? +rsi.toFixed(1) : null, note: chosen ? "Laboratorio · media de " + chosen.sma + " días" : "Laboratorio",
      });
    },
  });
  root.InvestLab.init();
})(typeof window !== "undefined" ? window : globalThis);
