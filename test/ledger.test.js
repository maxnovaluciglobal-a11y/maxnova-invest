// Libro de operaciones: efectivo, total aportado, valor actual y rendimiento. El caso central es
// el error de Capital Planner: una operación nunca puede convertirse en una pérdida falsa.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const L = require("../app/lib/ledger.js");
const { applyTrade } = require("../app/lib/holdings.js");
const { toUsd, currencyOf } = require("../app/lib/fx.js");

const RATES = { CLP: 1000 };
const opts = (prices = {}, rates = RATES) => ({
  ccyOf: (t) => currencyOf(t),
  priceOf: (t) => prices[t] ?? null,
  toUsd: (v, c) => toUsd(v, c, rates),
});
const dep = (amount, extra = {}) => ({ id: 1, type: "deposit", ticker: null, date: "2026-01-01", amount, ...extra });
const buy = (t, qty, price, extra = {}) => ({ id: 2, type: "buy", ticker: t, date: "2026-01-02", qty, price, amount: qty * price, cash: true, ...extra });
const sell = (t, qty, price, extra = {}) => ({ id: 3, type: "sell", ticker: t, date: "2026-01-03", qty, price, amount: qty * price, cash: true, ...extra });

describe("efectivo", () => {
  it("depósitos, retiros, compras y ventas lo mueven", () => {
    const ops = [dep(1000), buy("AAPL", 2, 100), sell("AAPL", 1, 150), { id: 4, type: "withdrawal", date: "2026-02-01", amount: 50 }];
    expect(L.cashByCurrency(ops, currencyOf)).toEqual({ USD: 900 });
  });
  it("una compra sin marcar no lo toca", () => {
    expect(L.cashByCurrency([dep(1000), buy("AAPL", 1, 100, { cash: false })], currencyOf)).toEqual({ USD: 1000 });
  });
  it("no mezcla monedas: una compra chilena no descuenta dólares", () => {
    const ops = [dep(1000), buy("SQM-B.SN", 1, 60000)];
    expect(L.cashByCurrency(ops, currencyOf)).toEqual({ USD: 1000, CLP: -60000 });
  });
  it("operaciones viejas: con depósitos previos pasan por el efectivo; sin ellos, no", () => {
    const old = { id: 2, type: "buy", ticker: "AAPL", date: "2026-01-02", qty: 1, price: 100, amount: 100 };
    expect(L.cashByCurrency([dep(500), old], currencyOf)).toEqual({ USD: 400 });
    expect(L.cashByCurrency([old], currencyOf)).toEqual({});
  });
  it("el dividendo al efectivo suma; reinvertido, no", () => {
    const div = { id: 5, type: "dividend", ticker: "AAPL", date: "2026-03-01", amount: 10 };
    expect(L.cashByCurrency([div], currencyOf)).toEqual({ USD: 10 });
    expect(L.cashByCurrency([{ ...div, reinvested: true, qty: 0.1, price: 100 }], currencyOf)).toEqual({});
  });
});

describe("total aportado y rendimiento", () => {
  it("rendimiento sobre lo aportado con efectivo incluido", () => {
    const ops = [dep(1000), buy("AAPL", 5, 100)];
    const b = L.book(ops, [{ t: "AAPL", sh: 5, cost: 100 }], opts({ AAPL: 120 }));
    expect(b.cash).toBe(500);
    expect(b.contributed).toBe(1000);
    expect(b.positionsValue).toBe(600);
    expect(b.value).toBe(1100);
    expect(b.gain).toBeCloseTo(100);
    expect(b.returnPct).toBeCloseTo(0.1);
  });
  it("una posición cargada a mano cuenta como aporte a su costo, no como ganancia", () => {
    const b = L.book([], [{ t: "AAPL", sh: 10, cost: 100 }], opts({ AAPL: 120 }));
    expect(b.contributed).toBe(1000);
    expect(b.openingCount).toBe(1);
    expect(b.gain).toBeCloseTo(200);
    expect(b.usesCash).toBe(false);
  });
  it("una compra fuera del efectivo es dinero que entró", () => {
    const b = L.book([buy("AAPL", 10, 100, { cash: false })], [{ t: "AAPL", sh: 10, cost: 100 }], opts({ AAPL: 110 }));
    expect(b.contributed).toBe(1000);
    expect(b.opening).toBe(0);
    expect(b.gain).toBeCloseTo(100);
  });
  it("venta parcial sobre una posición cargada a mano", () => {
    let h = { sh: 10, cost: 100 };
    const a = applyTrade(h, { type: "sell", qty: 4, price: 120, amount: 480 });
    h = { t: "AAPL", sh: a.sh, cost: a.cost };
    const b = L.book([dep(0), sell("AAPL", 4, 120, { pnl: a.pnl })], [h], opts({ AAPL: 120 }));
    expect(b.opening).toBeCloseTo(1000);
    expect(b.gain).toBeCloseTo(200);
  });
  it("compra y venta mezcladas con costo promedio: el costo inicial se recupera", () => {
    let h = { t: "AAPL", sh: 10, cost: 100 };
    const a1 = applyTrade(h, { type: "buy", qty: 10, price: 120, amount: 1200 });
    h = { ...h, sh: a1.sh, cost: a1.cost };
    const a2 = applyTrade(h, { type: "sell", qty: 15, price: 130, amount: 1950 });
    h = { ...h, sh: a2.sh, cost: a2.cost };
    const ops = [buy("AAPL", 10, 120, { cash: false }), sell("AAPL", 15, 130, { cash: false, pnl: a2.pnl })];
    const b = L.book(ops, [h], opts({ AAPL: 130 }));
    expect(b.opening).toBeCloseTo(1000);
    expect(b.gain).toBeCloseTo(400);
  });
  it("sin depósitos ni posiciones el rendimiento queda sin calcular", () => {
    const b = L.book([], [], opts());
    expect(b.contributed).toBe(0);
    expect(b.returnPct).toBeNull();
  });
});

describe("el error de Capital Planner no se repite", () => {
  // Datos reales del hallazgo: aportado 6.000, cinco compras por 1.819,73, activos fuera de la lista.
  const ops = [
    dep(6000),
    buy("PG", 2, 150.5), buy("AAPL", 2, 200), buy("XLV", 2, 140), buy("VOO", 1, 500), buy("SCHD", 7, 69.0471),
  ].map((o, i) => ({ ...o, id: i + 1 }));
  const invested = ops.filter((o) => o.type === "buy").reduce((s, o) => s + o.amount, 0);

  it("borrar las posiciones no crea una pérdida: las unidades se siguen contando", () => {
    const prices = { PG: 150.5, AAPL: 200, XLV: 140, VOO: 500, SCHD: 69.0471 };
    const b = L.book(ops, [], opts(prices));
    expect(b.cash).toBeCloseTo(6000 - invested);
    expect(b.orphans.map((o) => o.t).sort()).toEqual(["AAPL", "PG", "SCHD", "VOO", "XLV"]);
    expect(b.value).toBeCloseTo(6000);
    expect(b.returnPct).toBeCloseTo(0);
  });
  it("sin precio de hoy se usa el último registrado, nunca 0", () => {
    const b = L.book(ops, [], opts({}));
    expect(b.value).toBeCloseTo(6000);
    expect(b.returnPct).toBeCloseTo(0);
    expect(b.unpriced.length).toBe(5);
  });
  it("una posición editada a la baja deja la diferencia a la vista", () => {
    const b = L.book([dep(1000), buy("AAPL", 10, 100)], [{ t: "AAPL", sh: 6, cost: 100 }], opts({ AAPL: 100 }));
    expect(b.orphans).toHaveLength(1);
    expect(b.orphans[0].sh).toBe(4);
    expect(b.gain).toBeCloseTo(0);
  });
  it("venta total y posición quitada: no queda nada huérfano", () => {
    const b = L.book([dep(1000), buy("AAPL", 10, 100), sell("AAPL", 10, 110, { pnl: 100 })], [], opts({ AAPL: 500 }));
    expect(b.orphans).toEqual([]);
    expect(b.value).toBe(1100);
    expect(b.gain).toBeCloseTo(100);
  });
  it("posición cargada a mano, vendida y quitada: usa el resultado de la venta", () => {
    const b = L.book([dep(0), sell("AAPL", 10, 120, { pnl: 200 })], [], opts({ AAPL: 500 }));
    expect(b.opening).toBeCloseTo(1000);
    expect(b.gain).toBeCloseTo(200);
  });
});

describe("multimoneda: nunca 1:1", () => {
  it("convierte con el tipo de cambio del día", () => {
    const b = L.book([dep(500000, { currency: "CLP" })], [], opts());
    expect(b.cash).toBe(500);
    expect(b.contributed).toBe(500);
  });
  it("usa el tipo de cambio de la operación para lo aportado", () => {
    const b = L.book([dep(450000, { currency: "CLP", fx: 900 })], [], opts());
    expect(b.contributed).toBeCloseTo(500);
    expect(b.cash).toBe(450);
    expect(b.gain).toBeCloseTo(-50);
  });
  it("sin tipo de cambio excluye, avisa y no inventa un rendimiento", () => {
    const b = L.book([dep(1000), dep(500000, { currency: "CLP" })], [{ t: "SQM-B.SN", sh: 1, cost: 60000 }], opts({ "SQM-B.SN": 60000 }, {}));
    expect(b.cash).toBe(1000);
    expect(b.excludedCcys).toEqual(["CLP"]);
    expect(b.excludedPositions).toEqual(["SQM-B.SN"]);
    expect(b.complete).toBe(false);
    expect(b.gain).toBeNull();
    expect(b.returnPct).toBeNull();
  });
  it("una cuenta en dos monedas suma en USD", () => {
    const ops = [dep(1000), buy("SQM-B.SN", 1, 60000)];
    const b = L.book(ops, [{ t: "SQM-B.SN", sh: 1, cost: 60000, fxCost: 1000 }], opts({ "SQM-B.SN": 60000 }));
    expect(b.cash).toBe(940);
    expect(b.value).toBe(1000);
    expect(b.gain).toBeCloseTo(0);
  });
});

describe("dividendos reinvertidos y bonos", () => {
  it("DRIP: más unidades, sin mover el efectivo; el dividendo es ganancia", () => {
    const ops = [dep(1000), buy("AAPL", 10, 100), { id: 9, type: "dividend", reinvested: true, ticker: "AAPL", date: "2026-03-01", qty: 0.5, price: 100, amount: 50 }];
    const h = applyTrade({ sh: 10, cost: 100 }, { type: "buy", qty: 0.5, price: 100, amount: 50 });
    const b = L.book(ops, [{ t: "AAPL", sh: h.sh, cost: h.cost }], opts({ AAPL: 100 }));
    expect(b.cash).toBe(0);
    expect(b.contributed).toBe(1000);
    expect(b.dividends).toBe(50);
    expect(b.gain).toBeCloseTo(50);
    expect(b.orphans).toEqual([]);
  });
  it("bono: suma unidades sin subir el costo total", () => {
    const a = applyTrade({ sh: 10, cost: 100, fxCost: 900 }, { type: "bonus", qty: 2 });
    expect(a.sh).toBe(12);
    expect(a.sh * a.cost).toBeCloseTo(1000);
    expect(a.fxCost).toBe(900);
  });
  it("bono sobre una posición nueva: costo cero", () => {
    expect(applyTrade(null, { type: "bonus", qty: 3 })).toEqual({ action: "create", sh: 3, cost: 0, fxCost: null });
  });
  it("bono: todo el valor es ganancia y no toca lo aportado ni el efectivo", () => {
    const ops = [dep(1000), buy("AAPL", 10, 100), { id: 9, type: "bonus", ticker: "AAPL", date: "2026-03-01", qty: 1, amount: 0 }];
    const a = applyTrade({ sh: 10, cost: 100 }, { type: "bonus", qty: 1 });
    const b = L.book(ops, [{ t: "AAPL", sh: a.sh, cost: a.cost }], opts({ AAPL: 100 }));
    expect(b.contributed).toBe(1000);
    expect(b.cash).toBe(0);
    expect(b.gain).toBeCloseTo(100);
  });
  it("el bono no entra al promedio de lo pagado", () => {
    const ops = [buy("AAPL", 10, 100), { id: 9, type: "bonus", ticker: "AAPL", date: "2026-03-01", qty: 5, amount: 0 }, sell("AAPL", 3, 120)];
    expect(L.costOf(ops, "AAPL")).toMatchObject({ avgPaid: 100, paidSh: 10, bonusSh: 5, units: 12 });
  });
});

describe("aporte desde MOY IQ", () => {
  const a = { amount: 410, ccy: "USD", usd: 410 };
  it("sin depósitos previos propone todo", () => {
    expect(L.aportePending(a, [], "2026-10")).toEqual({ amount: 410, ccy: "USD" });
  });
  it("no cuenta dos veces lo ya registrado este mes", () => {
    const ops = [dep(300, { source: "moyiq", currency: "USD", date: "2026-10-05" })];
    expect(L.aportePending(a, ops, "2026-10").amount).toBe(110);
    expect(L.aportePending({ ...a, amount: 300 }, ops, "2026-10").amount).toBe(0);
  });
  it("ignora depósitos manuales y de otro mes", () => {
    const ops = [dep(300, { currency: "USD", date: "2026-10-05" }), dep(300, { source: "moyiq", currency: "USD", date: "2026-09-05" })];
    expect(L.aportePending(a, ops, "2026-10").amount).toBe(410);
  });
  it("sin moneda ni USD no propone nada", () => {
    expect(L.aportePending({ amount: 10, ccy: null, usd: null }, [], "2026-10")).toBeNull();
    expect(L.aportePending(null, [], "2026-10")).toBeNull();
  });
});

describe("sincronización con la cuenta", () => {
  const op = (uid, id, extra = {}) => ({ uid, id, type: "deposit", amount: 1, date: "2026-01-01", ...extra });
  it("sube lo local que falta y conserva lo remoto", () => {
    const m = L.mergeOps([op("a", 1)], [op("b", 1, { synced: true })], []);
    expect(m.ops.map((o) => o.uid).sort()).toEqual(["a", "b"]);
    expect(m.upload.map((o) => o.uid)).toEqual(["a"]);
    expect(new Set(m.ops.map((o) => o.id)).size).toBe(2);
  });
  it("lo ya subido que no está en la cuenta se borró en otro dispositivo", () => {
    const m = L.mergeOps([op("a", 1, { synced: true })], [], []);
    expect(m.ops).toEqual([]);
    expect(m.upload).toEqual([]);
  });
  it("un borrado pendiente no vuelve", () => {
    const m = L.mergeOps([], [op("a", 1, { synced: true })], ["a"]);
    expect(m.ops).toEqual([]);
  });
  it("ida y vuelta de la fila", () => {
    const o = { id: 7, uid: "u", type: "dividend", ticker: "AAPL", date: "2026-02-02", currency: "USD", price: 100, qty: 0.5, amount: 50, fx: null, rsi: null, note: "x", pnl: null, cash: null, reinvested: true, edited: false, source: null };
    const back = L.rowToOp(L.opToRow(o, "user"));
    expect(back).toMatchObject({ ...o, synced: true });
    expect(L.opToRow(o, "user").user_id).toBe("user");
  });
  it("reconoce la tabla que aún no existe y solo esa", () => {
    expect(L.isMissingTable({ code: "42P01" })).toBe(true);
    expect(L.isMissingTable({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
    expect(L.isMissingTable({ message: 'relation "public.invest_operations" does not exist' })).toBe(true);
    expect(L.isMissingTable({ code: "42501", message: "permission denied" })).toBe(false);
    expect(L.isMissingTable(null)).toBe(false);
  });
});
