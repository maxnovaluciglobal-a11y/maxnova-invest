// Tests para app/lib/diversification.js (bucle de Portafolio › Diversificación).
import { describe, it, expect } from "vitest";
import { divToggleChanged, corrPlan, histUsable } from "../app/lib/diversification.js";

describe("divToggleChanged", () => {
  it("re-insertar <details open> con la sección ya abierta no es un cambio", () => {
    expect(divToggleChanged(true, true)).toBe(false);
    expect(divToggleChanged(false, false)).toBe(false);
  });
  it("abrir y cerrar sí son cambios", () => {
    expect(divToggleChanged(true, false)).toBe(true);
    expect(divToggleChanged(false, true)).toBe(true);
  });
});

describe("corrPlan", () => {
  const has = (set) => (t) => set.includes(t);
  it("un ticker que falló no se vuelve a pedir (sin bucle)", () => {
    const p = corrPlan(["AAPL", "MSFT", "NOHIST"], has(["AAPL", "MSFT"]), { NOHIST: true });
    expect(p.toFetch).toEqual([]);
    expect(p.pending).toBe(false);
    expect(p.failed).toEqual(["NOHIST"]);
    expect(p.usable).toEqual(["AAPL", "MSFT"]);
    expect(p.ready).toBe(true);
  });
  it("pide solo lo que falta y no falló", () => {
    const p = corrPlan(["AAPL", "MSFT", "SPY"], has(["AAPL"]), {});
    expect(p.toFetch).toEqual(["MSFT", "SPY"]);
    expect(p.pending).toBe(true);
    expect(p.ready).toBe(false);
  });
  it("con menos de dos tickers con historia no hay matriz", () => {
    const p = corrPlan(["AAPL", "BTC-USD"], has(["AAPL"]), { "BTC-USD": true });
    expect(p.ready).toBe(false);
    expect(p.pending).toBe(false);
  });
  it("usa como máximo 8 tickers y sin repetir", () => {
    const t = ["A", "B", "A", "C", "D", "E", "F", "G", "H", "I"];
    const p = corrPlan(t, () => true, {});
    expect(p.tickers).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
  });
});

describe("histUsable", () => {
  it("rechaza vacío, corto, null y sintético", () => {
    expect(histUsable(null)).toBe(false);
    expect(histUsable([])).toBe(false);
    expect(histUsable([1, 2, 3, 4, 5].map((c) => ({ close: c })))).toBe(false);
    expect(histUsable(Array.from({ length: 10 }, () => ({ close: 1, _synthetic: true })))).toBe(false);
    expect(histUsable(Array.from({ length: 10 }, () => ({ close: 1 })))).toBe(true);
  });
});
