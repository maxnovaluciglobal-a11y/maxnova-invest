// app/lib/holdings.js
//
// Fase 3 (oct-2026): registrar una operacion AJUSTA la posicion existente en
// vez de reconstruirla desde todas las operaciones del ticker. Antes, una
// compra registrada sobre una posicion cargada a mano dejaba solo las
// unidades de las operaciones (16 unidades pasaban a 3) y perdia la entrada.
// No toca DOM ni Supabase: funciones puras.

(function (root) {
  "use strict";
  var EPS = 1e-7;

  // holding: {sh, cost, stop?} | null. trade: {type:'buy'|'sell', qty, price, amount}.
  // Devuelve {action:'create'|'update'|'close'|'none', sh, cost, sold, pnl}.
  // - buy: suma unidades y recalcula la entrada como promedio ponderado.
  // - sell: resta unidades a la entrada actual (pnl = (precio - entrada) x vendidas).
  //   Si llega a 0 devuelve 'close' (la UI pide confirmar el borrado).
  // El stop nunca se toca aqui.
  function applyTrade(holding, trade) {
    var qty = Number(trade.qty) || 0;
    var price = Number(trade.price) || 0;
    var amount = Number(trade.amount) || 0;
    if (!(qty > 0) && price > 0 && amount > 0) qty = amount / price;
    if (!(qty > 0)) return { action: "none" };
    var cash = amount > 0 ? amount : qty * price;
    if (trade.type === "buy") {
      if (!holding) return { action: "create", sh: qty, cost: cash / qty };
      var sh0 = Number(holding.sh) || 0, c0 = Number(holding.cost) || 0;
      var sh = sh0 + qty;
      return { action: "update", sh: sh, cost: (sh0 * c0 + cash) / sh };
    }
    if (trade.type === "sell") {
      if (!holding) return { action: "none" };
      var have = Number(holding.sh) || 0;
      var sold = Math.min(qty, have);
      var sell = price > 0 ? price : cash / qty;
      var pnl = (sell - (Number(holding.cost) || 0)) * sold;
      var left = have - sold;
      if (left <= EPS) return { action: "close", sh: 0, cost: holding.cost, sold: sold, pnl: pnl };
      return { action: "update", sh: left, cost: holding.cost, sold: sold, pnl: pnl };
    }
    return { action: "none" };
  }

  var api = { applyTrade: applyTrade };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.applyTrade = applyTrade;
})(typeof window !== "undefined" ? window : globalThis);
