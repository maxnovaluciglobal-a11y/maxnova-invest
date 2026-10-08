// Tests de la calculadora M12 (I04): unidades enteras y tabla en múltiplos de R.
import { describe, it, expect } from "vitest";
import { computeSizing, rMultiples } from "../app/lib/risk.js";

describe("computeSizing", () => {
  it("caso M12: capital 10.000, 2 %, entrada 234,12, stop 222 → 16 unidades, −194 al stop", () => {
    const r = computeSizing({ capital: 10000, riskPct: 2, entry: 234.12, stop: 222 });
    expect(r.units).toBe(16);
    expect(r.riskBudget).toBeCloseTo(200);
    expect(r.lossAtStop).toBeCloseTo(193.92);
    expect(Math.round(r.lossAtStop)).toBe(194);
    expect(r.exposure).toBeCloseTo(3745.92);
    expect(r.stopIsEstimate).toBe(false);
  });
  it("nunca arriesga más que la regla (redondea hacia abajo)", () => {
    const r = computeSizing({ capital: 10000, riskPct: 2, entry: 100, stop: 93 });
    expect(r.units).toBe(28); // 200/7 = 28,57
    expect(r.lossAtStop).toBeLessThanOrEqual(200);
  });
  it("con unidades fraccionarias (cripto) usa 4 decimales hacia abajo", () => {
    const r = computeSizing({ capital: 10000, riskPct: 1, entry: 60000, stop: 57000, fractional: true });
    expect(r.units).toBe(0.0333);
  });
  it("sin stop usa −8 % y lo marca como estimación", () => {
    const r = computeSizing({ capital: 10000, riskPct: 2, entry: 100 });
    expect(r.stop).toBeCloseTo(92);
    expect(r.stopIsEstimate).toBe(true);
    expect(r.units).toBe(25);
  });
  it("informa cuando no alcanza para una unidad entera", () => {
    const r = computeSizing({ capital: 1000, riskPct: 1, entry: 500, stop: 480 });
    expect(r.units).toBe(0);
    expect(r.lossAtStop).toBe(0);
  });
  it("aviso de concentración con alternativa entera", () => {
    const r = computeSizing({ capital: 10000, riskPct: 2, entry: 234.12, stop: 222 });
    expect(r.concentration.maxUnits).toBe(10);
    expect(Math.round(r.concentration.weightAtMax * 100)).toBe(23);
  });
  it("errores de entrada", () => {
    expect(computeSizing({ capital: 0, riskPct: 2, entry: 100 }).error).toBe("no-capital");
    expect(computeSizing({ capital: 1000, riskPct: 2, entry: 0 }).error).toBe("no-entry");
    expect(computeSizing({ capital: 1000, riskPct: 2, entry: 100, stop: 100 }).error).toBe("stop-not-below-price");
    expect(computeSizing({ capital: 1000, riskPct: 0, entry: 100 }).error).toBe("no-risk");
  });
});

describe("rMultiples", () => {
  it("Stop, +1R, +2R, +3R con precio y resultado", () => {
    const t = rMultiples(234.12, 222, 16);
    expect(t.map((x) => x.label)).toEqual(["Stop", "+1R", "+2R", "+3R"]);
    expect(t[0].price).toBeCloseTo(222);
    expect(t[0].pnl).toBeCloseTo(-193.92);
    expect(t[1].price).toBeCloseTo(246.24);
    expect(t[1].pnl).toBeCloseTo(193.92);
    expect(t[3].price).toBeCloseTo(270.48);
    expect(t[3].pnl).toBeCloseTo(581.76);
  });
});
