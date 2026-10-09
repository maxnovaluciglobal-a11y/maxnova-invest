// Tests para app/lib/rebalance.js — el calculo de "cuanto comprar/vender por
// ticker para llegar al peso objetivo" (mencionado en auditorias previas como
// "rebalance trade rows"), extraido de renderRebal/rebalUpdate donde vivia
// duplicado a mano en dos lugares.
import { describe, it, expect } from "vitest";
import { computeRebalanceTrades, roundTo100, sumTargets } from "../app/lib/rebalance.js";

describe("computeRebalanceTrades", () => {
  const prices = { AAPL: 100, MSFT: 50, VOO: 400 };
  const getPrice = (t) => prices[t];

  it("calcula el valor total de mercado del portfolio", () => {
    const port = [
      { t: "AAPL", sh: 10 }, // 1000
      { t: "MSFT", sh: 20 }, // 1000
    ];
    const { totM } = computeRebalanceTrades(port, {}, getPrice);
    expect(totM).toBe(2000);
  });

  it("sugiere comprar cuando el peso objetivo es mayor al actual", () => {
    const port = [
      { t: "AAPL", sh: 10 }, // 1000, peso actual 50%
      { t: "MSFT", sh: 20 }, // 1000, peso actual 50%
    ];
    // Objetivo: 70% AAPL / 30% MSFT sobre un total de 2000 -> AAPL deberia
    // valer 1400 (compra de 400 = 4 acciones), MSFT deberia valer 600 (venta
    // de 400 = 8 acciones).
    const targets = { AAPL: 70, MSFT: 30 };
    const { trades } = computeRebalanceTrades(port, targets, getPrice);

    const aapl = trades.find((tr) => tr.t === "AAPL");
    const msft = trades.find((tr) => tr.t === "MSFT");

    expect(aapl.buy).toBe(true);
    expect(aapl.diff).toBeCloseTo(400);
    expect(aapl.shares).toBeCloseTo(4);

    expect(msft.buy).toBe(false);
    expect(msft.diff).toBeCloseTo(-400);
    expect(msft.shares).toBeCloseTo(-8);
  });

  it("omite tickers cuyo ajuste es menor a $10 (umbral de ruido)", () => {
    const port = [{ t: "AAPL", sh: 10 }]; // 1000, target 100% -> diff 0
    const { trades } = computeRebalanceTrades(port, { AAPL: 100 }, getPrice);
    expect(trades.length).toBe(0);
  });

  it("trata un target ausente como 0% (venta total sugerida)", () => {
    const port = [{ t: "VOO", sh: 5 }]; // 2000, sin target definido
    const { trades } = computeRebalanceTrades(port, {}, getPrice);
    expect(trades.length).toBe(1);
    expect(trades[0].buy).toBe(false);
    expect(trades[0].diff).toBeCloseTo(-2000);
  });

  it("usa h.cur como fallback cuando getPrice no devuelve nada (ticker sin precio live)", () => {
    const port = [{ t: "ZZZZ", sh: 10, cur: 25 }]; // sin precio live, fallback a cur
    const { totM } = computeRebalanceTrades(port, {}, () => undefined);
    expect(totM).toBe(250);
  });

  it("portfolio vacio no rompe y devuelve totM=0 y trades=[]", () => {
    const { totM, trades } = computeRebalanceTrades([], {}, getPrice);
    expect(totM).toBe(0);
    expect(trades).toEqual([]);
  });
});

describe("unidades enteras (fase 2)", () => {
  const getPrice = (t) => ({ AAPL: 100, BTC: 30000 })[t];
  it("redondea hacia cero y recalcula el monto", () => {
    const port = [{ t: "AAPL", sh: 10 }, { t: "BTC", sh: 0.1 }]; // 1000 + 3000
    const { trades } = computeRebalanceTrades(port, { AAPL: 37, BTC: 63 }, getPrice, { wholeUnits: (t) => t !== "BTC" });
    const aapl = trades.find((x) => x.t === "AAPL");
    expect(aapl.shares).toBe(4); // 480 / 100 = 4.8 -> 4
    expect(aapl.diff).toBe(400);
    const btc = trades.find((x) => x.t === "BTC");
    expect(btc.shares).toBeCloseTo(-0.016, 6); // cripto admite fracciones
  });
  it("omite el ajuste cuando no alcanza a una unidad", () => {
    const port = [{ t: "AAPL", sh: 10 }, { t: "BTC", sh: 0.1 }];
    const { trades } = computeRebalanceTrades(port, { AAPL: 27, BTC: 73 }, getPrice, { wholeUnits: () => true });
    expect(trades.find((x) => x.t === "AAPL")).toBeUndefined(); // +80 -> 0.8 unidades
  });
});

describe("roundTo100", () => {
  it("suma exactamente 100 aunque cada peso redondee distinto", () => {
    const r = roundTo100([1, 1, 1]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(100);
    expect(r).toEqual([34, 33, 33]);
  });
  it("caso que antes sumaba 101", () => {
    const r = roundTo100([3746, 5854, 5984, 3566]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("todo cero devuelve ceros", () => {
    expect(roundTo100([0, 0])).toEqual([0, 0]);
  });
});

describe("sumTargets", () => {
  it("ignora objetivos de tickers que ya no estan en el portafolio", () => {
    const port = [{ t: "AAPL" }, { t: "MSFT" }];
    expect(sumTargets(port, { AAPL: 60, MSFT: 40, TSLA: 20 })).toBe(100);
  });
});
