// Tests para app/lib/market.js
import { describe, it, expect } from "vitest";
import { sparkSvg, sparkUp, marketStatus, normalizeFundamentals, fundTags, corrShade, corrBand } from "../app/lib/market.js";

describe("sparkSvg", () => {
  it("dibuja una polilínea del tamaño pedido, verde si el período subió", () => {
    const s = sparkSvg([1, 2, 3], { w: 48, h: 16 });
    expect(s).toContain('width="48"');
    expect(s).toContain('height="16"');
    expect(s).toContain("var(--pos)");
    expect(s).toContain('aria-hidden="true"');
  });
  it("rojo si el período bajó", () => {
    expect(sparkSvg([3, 2, 1])).toContain("var(--neg)");
    expect(sparkUp([3, 2, 1])).toBe(false);
  });
  it("sin datos suficientes no dibuja nada", () => {
    expect(sparkSvg([])).toBe("");
    expect(sparkSvg([5, null])).toBe("");
    expect(sparkUp(null)).toBe(null);
  });
  it("sin animación", () => {
    expect(sparkSvg([1, 2])).not.toMatch(/animate|transition/);
  });
});

describe("marketStatus", () => {
  const start = Date.UTC(2026, 9, 9, 13, 30), end = Date.UTC(2026, 9, 9, 20, 0);
  it("usa la zona horaria de la cotización: Santiago, no Nueva York", () => {
    const q = { timezone: "America/Santiago", tradingStart: start, tradingEnd: end };
    expect(marketStatus(q, start + 1000)).toEqual({ label: "Bolsa de Santiago abierta", open: true });
    expect(marketStatus(q, end + 1000)).toEqual({ label: "Bolsa de Santiago cerrada", open: false });
  });
  it("zona desconocida con horario: dice mercado abierto o cerrado", () => {
    expect(marketStatus({ timezone: "Asia/Tokyo", tradingStart: start, tradingEnd: end }, start - 1).label).toBe("Mercado cerrado");
  });
  it("sin horario y sin ser acción de EE. UU.: se omite", () => {
    expect(marketStatus({ timezone: "America/Santiago" }, start)).toBe(null);
    expect(marketStatus(null, start)).toBe(null);
  });
  it("acción de EE. UU. sin horario: usa el cálculo de Nueva York", () => {
    expect(marketStatus({}, start, { usEquity: true, fallbackNY: () => true }).label).toBe("Bolsa de Nueva York abierta");
  });
});

describe("normalizeFundamentals", () => {
  it("Finnhub viene en %: ROE de AMZN 30,5 queda en 0,305 (no 3.050 %)", () => {
    const f = normalizeFundamentals({ source: "finnhub", roe: 30.5, netMargin: 17.44, grossMargin: 50.77, operatingMargin: 12.08, revenueGrowth: 15.77, dividendYield: null });
    expect(f.roe).toBeCloseTo(0.305, 10);
    expect(f.netMargin).toBeCloseTo(0.1744, 10);
    expect(f.grossMargin).toBeCloseTo(0.5077, 10);
    expect(f.revenueGrowth).toBeCloseTo(0.1577, 10);
  });
  it("FMP ya viene en fracción: no se toca", () => {
    const f = normalizeFundamentals({ source: "fmp", roe: 0.305, netMargin: 0.1744, revenueGrowth: -0.05 });
    expect(f.roe).toBe(0.305);
    expect(f.revenueGrowth).toBe(-0.05);
  });
  it("fuente desconocida: módulo mayor que 2 se toma como %", () => {
    const f = normalizeFundamentals({ roe: 30.5, netMargin: 0.17 });
    expect(f.roe).toBeCloseTo(0.305, 10);
    expect(f.netMargin).toBe(0.17);
  });
  it("no toca el rendimiento por dividendo (ya es fracción en las dos fuentes)", () => {
    expect(normalizeFundamentals({ source: "finnhub", dividendYield: 0.0045 }).dividendYield).toBe(0.0045);
  });
});

describe("fundTags", () => {
  it("quita repetidos y vacíos: Retail · Retail · US → Retail · US", () => {
    expect(fundTags({ sector: "Retail", industry: "Retail", country: "US" })).toEqual(["Retail", "US"]);
    expect(fundTags({ sector: "", industry: null, country: " US " })).toEqual(["US"]);
    expect(fundTags({ sector: "Technology", industry: "technology" })).toEqual(["Technology"]);
  });
});

describe("corrShade / corrBand", () => {
  it("una sola escala: más correlación, más intensidad; negativos al mínimo", () => {
    expect(corrShade(0.9)).toBe(0.9);
    expect(corrShade(-0.4)).toBe(0);
    expect(corrShade(null)).toBe(null);
    expect(corrBand(0.8)).toBe("alta");
    expect(corrBand(0.5)).toBe("media");
    expect(corrBand(-0.2)).toBe("baja");
  });
});
