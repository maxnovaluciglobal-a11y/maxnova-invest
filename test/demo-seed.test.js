// Tests para app/lib/demo-seed.js — detección del portafolio sembrado (I01/D1).
import { describe, it, expect } from "vitest";
import { DEMO_PORTFOLIO, detectSeededHoldings, shouldOfferSeedCleanup, demoPortfolioCopy } from "../app/lib/demo-seed.js";

const dbRows = (list, start = 7000) =>
  list.map((h, i) => ({ id: start + i, ticker: h.t, asset_type: h.type, shares: h.sh, avg_cost: h.cost }));

describe("detectSeededHoldings", () => {
  it("detecta las 10 filas sembradas tal como quedaron en la base", () => {
    expect(detectSeededHoldings(dbRows(DEMO_PORTFOLIO))).toHaveLength(10);
  });
  it("acepta la forma en memoria {t, sh, cost}", () => {
    const mem = DEMO_PORTFOLIO.map((h, i) => ({ id: 500 + i, t: h.t, sh: h.sh, cost: h.cost }));
    expect(detectSeededHoldings(mem)).toEqual(mem.map((h) => h.id));
  });
  it("no toca una fila editada (otras unidades o costo)", () => {
    const rows = dbRows(DEMO_PORTFOLIO);
    rows[0].shares = 51;
    rows[1].avg_cost = 340;
    const ids = detectSeededHoldings(rows);
    expect(ids).toHaveLength(8);
    expect(ids).not.toContain(rows[0].id);
    expect(ids).not.toContain(rows[1].id);
  });
  it("no confunde posiciones propias del mismo ticker", () => {
    expect(detectSeededHoldings([{ id: 1, ticker: "AAPL", shares: 16, avg_cost: 205.4 }])).toEqual([]);
  });
  it("cada fila del sembrado cuenta una sola vez", () => {
    const dup = [
      { id: 1, ticker: "AAPL", shares: 50, avg_cost: 172.5 },
      { id: 2, ticker: "AAPL", shares: 50, avg_cost: 172.5 },
    ];
    expect(detectSeededHoldings(dup)).toEqual([1]);
  });
  it("tolera valores numéricos que llegan como texto desde la base", () => {
    expect(detectSeededHoldings([{ id: 9, ticker: "msft", shares: "30", avg_cost: "342.00" }])).toEqual([9]);
  });
});

describe("shouldOfferSeedCleanup", () => {
  it("sí con el sembrado completo", () => {
    expect(shouldOfferSeedCleanup(dbRows(DEMO_PORTFOLIO))).toBe(true);
  });
  it("sí con 3 coincidencias mezcladas con posiciones propias", () => {
    const rows = dbRows(DEMO_PORTFOLIO.slice(0, 3)).concat([{ id: 1, ticker: "MELI", shares: 2, avg_cost: 2000 }]);
    expect(shouldOfferSeedCleanup(rows)).toBe(true);
  });
  it("no con una sola coincidencia junto a posiciones propias", () => {
    const rows = dbRows(DEMO_PORTFOLIO.slice(0, 1)).concat([{ id: 1, ticker: "MELI", shares: 2, avg_cost: 2000 }]);
    expect(shouldOfferSeedCleanup(rows)).toBe(false);
  });
  it("sí cuando todo lo que queda es del sembrado", () => {
    expect(shouldOfferSeedCleanup(dbRows(DEMO_PORTFOLIO.slice(0, 2)))).toBe(true);
  });
  it("no en una cuenta vacía", () => {
    expect(shouldOfferSeedCleanup([])).toBe(false);
  });
});

describe("demoPortfolioCopy", () => {
  it("devuelve una copia independiente", () => {
    const a = demoPortfolioCopy();
    a[0].sh = 999;
    expect(DEMO_PORTFOLIO[0].sh).toBe(50);
  });
});
