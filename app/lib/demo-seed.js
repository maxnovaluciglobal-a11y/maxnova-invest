// app/lib/demo-seed.js
//
// Portafolio de ejemplo y detección del sembrado viejo (auditoría UX oct-2026,
// I01 + decisión D1).
//
// Hasta el commit 557cbe9 cada cuenta nueva recibía en Supabase las 10
// posiciones de DEMO_PORTFOLIO (≈ US$ 80 k) y 15 tickers de watchlist. Desde
// I01 ya no se siembra nada: el ejemplo se muestra solo en memoria y nunca se
// guarda. Para las cuentas que ya lo tienen, la app detecta esas filas exactas
// (mismo ticker, unidades y costo) y ofrece borrarlas a pedido de la persona.
// No hay migración que borre nada por su cuenta.
//
// Funciones puras: sin DOM ni Supabase.

(function (root) {
  "use strict";

  // Mismos valores que se sembraban (no cambiar: la detección depende de ellos).
  var DEMO_PORTFOLIO = [
    { id: 1, t: "AAPL", type: "Stock", sh: 50, cost: 172.5, cur: 195.5, note: "Core holding" },
    { id: 2, t: "MSFT", type: "Stock", sh: 30, cost: 342.0, cur: 415.0, note: "AI exposure" },
    { id: 3, t: "NVDA", type: "Stock", sh: 15, cost: 495.0, cur: 878.0, note: "Semiconductor" },
    { id: 4, t: "SPY", type: "ETF", sh: 25, cost: 452.0, cur: 548.0, note: "US index core" },
    { id: 5, t: "QQQ", type: "ETF", sh: 20, cost: 380.0, cur: 468.0, note: "Tech ETF" },
    { id: 6, t: "GOOGL", type: "Stock", sh: 12, cost: 142.0, cur: 191.0, note: "Digital ads" },
    { id: 7, t: "V", type: "Stock", sh: 20, cost: 235.0, cur: 287.0, note: "Fintech" },
    { id: 8, t: "VTI", type: "ETF", sh: 35, cost: 218.0, cur: 269.0, note: "Total market" },
    { id: 9, t: "AMZN", type: "Stock", sh: 10, cost: 168.0, cur: 199.0, note: "E-commerce+Cloud" },
    { id: 10, t: "JPM", type: "Stock", sh: 18, cost: 158.0, cur: 196.0, note: "Banking value" },
  ];
  var DEMO_WATCH = ["AAPL", "MSFT", "NVDA", "SPY", "QQQ", "GOOGL", "META", "TSLA", "VTI", "JPM", "MELI", "NU", "GGB", "BSBR", "PBR"];

  // Mínimo de coincidencias para ofrecer la limpieza. Una sola coincidencia
  // exacta podría ser una compra real; tres o más del mismo sembrado no.
  var MIN_MATCHES = 3;

  function same(a, b) {
    return Math.abs(Number(a) - Number(b)) < 1e-6;
  }

  // holdings: [{id, t, sh, cost}] (forma en memoria) o filas de la base
  // [{id, ticker, shares, avg_cost}]. Devuelve los ids que coinciden
  // exactamente con una fila del sembrado; cada fila del sembrado se usa una
  // sola vez (si alguien tiene dos AAPL 50 @ 172.5, solo una cuenta).
  function detectSeededHoldings(holdings) {
    var pool = DEMO_PORTFOLIO.slice();
    var ids = [];
    (holdings || []).forEach(function (h) {
      if (!h) return;
      var t = String(h.t != null ? h.t : h.ticker || "").toUpperCase();
      var sh = h.sh != null ? h.sh : h.shares;
      var cost = h.cost != null ? h.cost : h.avg_cost;
      for (var i = 0; i < pool.length; i++) {
        var d = pool[i];
        if (d.t === t && same(d.sh, sh) && same(d.cost, cost)) {
          ids.push(h.id);
          pool.splice(i, 1);
          return;
        }
      }
    });
    return ids;
  }

  // ¿Se ofrece el aviso "Borrar ejemplo"? Sí con 3+ coincidencias, o cuando
  // todo lo que hay en la cuenta coincide con el sembrado.
  function shouldOfferSeedCleanup(holdings) {
    var list = holdings || [];
    var ids = detectSeededHoldings(list);
    if (!ids.length) return false;
    return ids.length >= MIN_MATCHES || ids.length === list.length;
  }

  // Copia fresca del ejemplo para el modo de solo lectura.
  function demoPortfolioCopy() {
    return DEMO_PORTFOLIO.map(function (h) {
      return { id: h.id, t: h.t, type: h.type, sh: h.sh, cost: h.cost, cur: h.cur, note: h.note };
    });
  }

  var api = {
    DEMO_PORTFOLIO: DEMO_PORTFOLIO,
    DEMO_WATCH: DEMO_WATCH,
    MIN_MATCHES: MIN_MATCHES,
    detectSeededHoldings: detectSeededHoldings,
    shouldOfferSeedCleanup: shouldOfferSeedCleanup,
    demoPortfolioCopy: demoPortfolioCopy,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.InvestDemo = api;
})(typeof window !== "undefined" ? window : globalThis);
