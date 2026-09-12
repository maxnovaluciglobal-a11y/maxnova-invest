// Tests para app/lib/rebalance.js — el calculo de "cuanto comprar/vender por
// ticker para llegar al peso objetivo" (mencionado en auditorias previas como
// "rebalance trade rows"), extraido de renderRebal/rebalUpdate donde vivia
// duplicado a mano en dos lugares.
import { describe, it, expect } from "vitest";
import { computeRebalanceTrades } from "../app/lib/rebalance.js";

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
