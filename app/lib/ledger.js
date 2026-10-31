// app/lib/ledger.js
//
// Libro de operaciones del portafolio (efectivo, total aportado, valor actual y
// rendimiento sobre lo aportado). Funciones puras: no tocan DOM, LIVE ni Supabase.
//
// Regla aprendida de Capital Planner: ahí las compras dejaron de contar cuando el activo
// salió de la lista y apareció una pérdida falsa de 30 %. Por eso aquí una operación nunca
// queda huérfana:
// - Las unidades de cada ticker salen de las operaciones. Si Portafolio tiene menos (se
//   borró o se editó la posición), la diferencia se sigue valuando y se avisa.
// - Si Portafolio tiene más (posición cargada a mano), esa parte cuenta como aporte al
//   costo: no es una ganancia.
// - Una compra que no pasó por el efectivo es dinero que entró de afuera: suma a lo
//   aportado. Una venta que no volvió al efectivo es dinero que salió.
// Así se cumple siempre: ganancia = valor actual − total aportado, sin importar cómo se
// cargaron los datos. Si falta un tipo de cambio no se hace 1:1 ni se inventa un resultado:
// los montos quedan fuera, se dice cuántos y el rendimiento queda sin calcular.

(function (root) {
  "use strict";
  var EPS = 1e-7;

  function num(v) {
    var n = Number(v);
    return v != null && isFinite(n) ? n : 0;
  }
  function byDateThenId(a, b) {
    var da = String(a.date || ""), db = String(b.date || "");
    return da < db ? -1 : da > db ? 1 : num(a.id) - num(b.id);
  }

  // Operaciones anteriores a este libro: no traen `cash`. Si la persona ya anotaba
  // depósitos, sus compras y ventas se descontaban del efectivo estimado; si no, el dinero
  // entró y salió por fuera.
  function usesCash(op, legacy) {
    if (op.type !== "buy" && op.type !== "sell") return false;
    return op.cash == null ? !!legacy : !!op.cash;
  }
  function hasDeposits(ops) {
    return (ops || []).some(function (t) { return t.type === "deposit"; });
  }
  function isReinvest(op) {
    return op.type === "dividend" && !!op.reinvested;
  }
  // Moneda de la operación: la guardada o la del activo; sin ticker, USD (datos viejos).
  function opCcy(op, ccyOf) {
    if (op.currency) return op.currency;
    if (!op.ticker) return "USD";
    return ccyOf ? ccyOf(op.ticker) : null;
  }

  // Saldo por moneda: {USD: 1200, CLP: -50000}. Nunca se mezclan monedas aquí.
  function cashByCurrency(ops, ccyOf) {
    var legacy = hasDeposits(ops), out = {};
    (ops || []).forEach(function (t) {
      var sign = 0;
      if (t.type === "deposit" || (t.type === "dividend" && !isReinvest(t))) sign = 1;
      else if (t.type === "withdrawal") sign = -1;
      else if (usesCash(t, legacy)) sign = t.type === "sell" ? 1 : -1;
      if (!sign) return;
      var c = opCcy(t, ccyOf) || "?";
      out[c] = (out[c] || 0) + sign * num(t.amount);
    });
    return out;
  }

  // Monto en USD de un flujo histórico: con el tipo de cambio del día de la operación si
  // se conoce; si no, el de hoy. null = sin tipo de cambio.
  function flowUsd(op, ccy, toUsd) {
    var fx = Number(op.fx);
    if (ccy && ccy !== "USD" && op.fx != null && isFinite(fx) && fx > 0) return num(op.amount) / fx;
    return toUsd(num(op.amount), ccy);
  }

  // Costo por unidad de lo que había antes de las operaciones. Con costo promedio, el
  // costo final depende en forma lineal de ese valor: se despeja.
  function openingUnitCost(list, baseSh, holdSh, holdCost) {
    var a = baseSh, b = 0, sh = baseSh, fromSell = null, sellPrice = null;
    list.forEach(function (t) {
      var q = num(t.qty);
      if (t.type === "buy" || isReinvest(t)) { sh += q; b += num(t.amount); }
      else if (t.type === "bonus") { sh += q; }
      else if (t.type === "sell" && sh > EPS) {
        if (fromSell == null && t.pnl != null && q > 0) fromSell = ((num(t.amount) - num(t.pnl)) / q * sh - b) / a;
        if (sellPrice == null && q > 0) sellPrice = num(t.amount) / q;
        var f = Math.max(0, sh - q) / sh;
        a *= f; b *= f; sh = Math.max(0, sh - q);
      }
    });
    var c;
    if (holdSh > EPS && a > EPS) c = (holdCost - b) / a;
    else if (fromSell != null) c = fromSell;
    else c = sellPrice != null ? sellPrice : 0;
    return Math.max(0, c);
  }

  // ops: operaciones de la bitácora. holdings: posiciones actuales [{t, sh, cost, fxCost}].
  // opts: {ccyOf(t), priceOf(t) (moneda del activo; null si no hay), toUsd(monto, moneda)}.
  function book(ops, holdings, opts) {
    var ccyOf = opts.ccyOf, priceOf = opts.priceOf, toUsd = opts.toUsd;
    var list = (ops || []).slice().sort(byDateThenId);
    var legacy = hasDeposits(list);
    var deposits = 0, withdrawals = 0, implicit = 0, dividends = 0, excludedOps = 0;
    var perT = {};

    list.forEach(function (t) {
      if (t.ticker) (perT[t.ticker] = perT[t.ticker] || []).push(t);
      var ccy = opCcy(t, ccyOf);
      var flows = t.type === "deposit" || t.type === "withdrawal" || t.type === "dividend" ||
        ((t.type === "buy" || t.type === "sell") && !usesCash(t, legacy));
      if (!flows) return;
      var usd = flowUsd(t, ccy, toUsd);
      if (usd == null) { excludedOps++; return; }
      if (t.type === "deposit") deposits += usd;
      else if (t.type === "withdrawal") withdrawals += usd;
      else if (t.type === "dividend") dividends += usd;
      else implicit += t.type === "buy" ? usd : -usd;
    });

    var held = {};
    (holdings || []).forEach(function (h) {
      var o = held[h.t] = held[h.t] || { sh: 0, cost: 0, fxCost: null };
      o.sh += num(h.sh);
      o.cost += num(h.sh) * num(h.cost);
      if (h.fxCost > 0) o.fxCost = Number(h.fxCost);
    });

    var opening = 0, openingCount = 0, positionsValue = 0, positionsCost = 0;
    var excludedPositions = [], orphans = [], unpriced = [];
    Object.keys(Object.assign({}, held, perT)).forEach(function (t) {
      var h = held[t] || { sh: 0, cost: 0, fxCost: null };
      var mine = perT[t] || [];
      var net = 0, lastPrice = null;
      mine.forEach(function (o) {
        var q = num(o.qty);
        if (o.type === "buy" || o.type === "bonus" || isReinvest(o)) net += q;
        else if (o.type === "sell") net -= q;
        if (o.price > 0) lastPrice = Number(o.price);
      });
      var ccy = ccyOf(t);
      var extra = h.sh - net;
      var unit = h.sh > EPS ? h.cost / h.sh : 0;

      var orphanSh = extra < -EPS ? -extra : 0;
      var px = priceOf ? priceOf(t) : null;
      var priced = px > 0;
      if (!priced) { px = lastPrice > 0 ? lastPrice : unit; if (h.sh + orphanSh > EPS) unpriced.push(t); }
      var units = h.sh + orphanSh;
      var valueCcy = units * px;
      var valueUsd = toUsd(valueCcy, ccy);
      // Sin tipo de cambio queda fuera entera: su valor y su costo, para no comparar uno sin el otro.
      if (valueUsd == null) {
        if (units > EPS) excludedPositions.push(t);
      } else {
        if (extra > EPS) {
          var costCcy = openingUnitCost(mine, extra, h.sh, h.cost) * extra;
          opening += h.fxCost > 0 && ccy !== "USD" ? costCcy / h.fxCost : toUsd(costCcy, ccy);
          openingCount++;
        }
        positionsValue += valueUsd;
        var c0 = toUsd(h.cost + orphanSh * (lastPrice > 0 ? lastPrice : unit), ccy);
        positionsCost += c0 == null ? 0 : c0;
      }
      if (orphanSh > EPS) orphans.push({ t: t, sh: orphanSh, value: valueUsd, ccy: ccy, price: px });
    });

    var byCcy = cashByCurrency(list, ccyOf);
    var cash = 0, excludedCcys = [];
    Object.keys(byCcy).forEach(function (c) {
      var u = c === "?" ? null : toUsd(byCcy[c], c);
      if (u == null) excludedCcys.push(c === "?" ? "moneda desconocida" : c);
      else cash += u;
    });

    var contributed = deposits - withdrawals + implicit + opening;
    var complete = !excludedOps && !excludedCcys.length && !excludedPositions.length;
    var value = cash + positionsValue;
    var gain = complete ? value - contributed : null;
    return {
      cash: cash, cashByCcy: byCcy, excludedCcys: excludedCcys,
      deposits: deposits, withdrawals: withdrawals, implicit: implicit, opening: opening, openingCount: openingCount,
      contributed: contributed, dividends: dividends,
      positionsValue: positionsValue, positionsCost: positionsCost, value: value,
      gain: gain, returnPct: gain != null && contributed > EPS ? gain / contributed : null,
      orphans: orphans, unpriced: unpriced, excludedPositions: excludedPositions, excludedOps: excludedOps,
      complete: complete,
      usesCash: list.some(function (t) { return t.type === "deposit" || t.type === "withdrawal" || t.cash === true; }),
    };
  }

  // Costo promedio de lo pagado por ticker: los bonos suman unidades, no costo, y no entran
  // al promedio. {paid, paidSh, bonusSh, units, avgPaid}.
  function costOf(ops, ticker) {
    var paid = 0, paidSh = 0, bonusSh = 0, sold = 0;
    (ops || []).forEach(function (t) {
      if (t.ticker !== ticker) return;
      if (t.type === "buy" || isReinvest(t)) { paid += num(t.amount); paidSh += num(t.qty); }
      else if (t.type === "bonus") bonusSh += num(t.qty);
      else if (t.type === "sell") sold += num(t.qty);
    });
    return { paid: paid, paidSh: paidSh, bonusSh: bonusSh, units: paidSh + bonusSh - sold, avgPaid: paidSh > 0 ? paid / paidSh : 0 };
  }

  // Cuánto de lo marcado este mes en MOY IQ falta registrar como depósito. MOY IQ manda la
  // suma del mes: sin esto, entrar dos veces contaría el mismo dinero dos veces.
  function aportePending(a, ops, month) {
    if (!a) return null;
    var ccy = a.ccy || (a.usd > 0 ? "USD" : null);
    if (!ccy) return null;
    var amount = a.ccy ? num(a.amount) : num(a.usd);
    var done = (ops || []).reduce(function (s, t) {
      var same = t.type === "deposit" && t.source === "moyiq" && (t.currency || "USD") === ccy && String(t.date || "").indexOf(month) === 0;
      return same ? s + num(t.amount) : s;
    }, 0);
    return { amount: Math.max(0, amount - done), ccy: ccy };
  }

  // ── Fila de invest_operations <-> operación en memoria ──
  var COLUMNS = "id,seq,type,ticker,op_date,currency,price,qty,amount,fx,pnl,rsi,note,cash,reinvested,edited,source";
  function opToRow(op, userId) {
    return {
      id: op.uid, user_id: userId, seq: num(op.id), type: op.type, ticker: op.ticker || null, op_date: op.date,
      currency: op.currency || null, price: op.price || null, qty: op.qty || null, amount: num(op.amount),
      fx: op.fx > 0 ? op.fx : null, pnl: op.pnl != null ? op.pnl : null, rsi: op.rsi || null, note: op.note || null,
      cash: op.cash == null ? null : !!op.cash, reinvested: !!op.reinvested, edited: !!op.edited, source: op.source || null,
    };
  }
  function n(v) { return v == null ? null : Number(v); }
  function rowToOp(r) {
    return {
      id: Number(r.seq), uid: r.id, ticker: r.ticker, type: r.type, date: r.op_date, currency: r.currency,
      price: n(r.price), qty: n(r.qty), amount: Number(r.amount), fx: n(r.fx), rsi: n(r.rsi), note: r.note || "", pnl: n(r.pnl),
      cash: r.cash, reinvested: !!r.reinvested, edited: !!r.edited, source: r.source || null, synced: true,
    };
  }

  // Une este navegador con la cuenta. Lo remoto manda; lo local sin subir se conserva y se
  // sube; lo que ya se había subido y no está en la cuenta se borró en otro dispositivo.
  function mergeOps(local, remote, deleted) {
    var gone = {}, seen = {}, ops = [], upload = [];
    (deleted || []).forEach(function (u) { gone[u] = true; });
    (remote || []).forEach(function (o) {
      if (gone[o.uid]) return;
      seen[o.uid] = true;
      ops.push(o);
    });
    (local || []).forEach(function (o) {
      if (seen[o.uid] || gone[o.uid] || o.synced) return;
      ops.push(o);
      upload.push(o);
    });
    ops.sort(function (a, b) { return num(a.id) - num(b.id); });
    var used = {}, max = ops.reduce(function (m, o) { return Math.max(m, num(o.id)); }, 0);
    ops.forEach(function (o) {
      if (!(o.id > 0) || used[o.id]) o.id = ++max;
      used[o.id] = true;
    });
    return { ops: ops, upload: upload, nextId: max + 1 };
  }

  // PostgREST y Postgres cuando la migración aún no está aplicada.
  function isMissingTable(err) {
    if (!err) return false;
    if (err.code === "42P01" || err.code === "PGRST205" || err.code === "PGRST202") return true;
    return /invest_operations/i.test(String(err.message || "")) && /does not exist|schema cache/i.test(String(err.message || ""));
  }

  var api = {
    usesCash: usesCash, opCcy: opCcy, cashByCurrency: cashByCurrency, book: book, costOf: costOf, aportePending: aportePending,
    opToRow: opToRow, rowToOp: rowToOp, mergeOps: mergeOps, isMissingTable: isMissingTable, COLUMNS: COLUMNS,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.InvestLedger = api;
})(typeof window !== "undefined" ? window : globalThis);
