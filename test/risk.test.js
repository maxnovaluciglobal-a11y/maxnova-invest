// Tests para app/lib/risk.js — el calculo de position sizing / riesgo por
// posicion (feature paga "Riesgo y Sizing"), extraido de renderRiskBody/pbCalc
// donde vivia duplicado a mano en dos lugares (mismo patron que rebalance.js).
import { describe, it, expect } from "vitest";
import { computeRiskRows, computePositionSize, DEFAULT_STOP_PCT, DEFAULT_TARGET_PCT } from "../app/lib/risk.js";

describe("computeRiskRows", () => {
  it("calcula rA como el % de capital indicado (default 2%)", () => {
    const { rA } = computeRiskRows([], 10000);
    expect(rA).toBe(200);
  });

  it("acepta un riesgo por operacion distinto del 2% default", () => {
    const { rA } = computeRiskRows([], 10000, 0.01);
    expect(rA).toBe(100);
  });

  it("usa el stop default -8% cuando el holding no trae uno propio", () => {
    const port = [{ t: "AAPL", cur: 100 }];
    const { rows } = computeRiskRows(port, 10000, 0.02);
    expect(rows[0].stop).toBeCloseTo(100 * (1 - DEFAULT_STOP_PCT));
  });

  it("respeta el stop propio del holding si esta por debajo del limite de seguridad", () => {
    const port = [{ t: "AAPL", cur: 100, stop: 95 }];
    const { rows } = computeRiskRows(port, 10000, 0.02);
    expect(rows[0].stop).toBe(95);
  });

  it("nunca deja el stop igual o por encima del precio (limite 99.5%)", () => {
    const port = [{ t: "AAPL", cur: 100, stop: 100 }]; // stop invalido, igual al precio
    const { rows } = computeRiskRows(port, 10000, 0.02);
    expect(rows[0].stop).toBeLessThanOrEqual(100 * 0.995);
  });

  it("calcula el tamaño de posicion (ps) segun riskAmt/riesgoPct*precio", () => {
    const port = [{ t: "AAPL", cur: 100 }]; // stop 92, riesgo=8
    const { rows, rA } = computeRiskRows(port, 10000, 0.02); // rA=200
    const expectedPs = (rA / 8) * 100;
    expect(rows[0].ps).toBeCloseTo(expectedPs);
  });

  it("calcula R/R usando la referencia estandar +15% (no historica) sobre el rango de riesgo", () => {
    const port = [{ t: "AAPL", cur: 100 }]; // stop 92, riesgo=8
    const { rows } = computeRiskRows(port, 10000, 0.02);
    const expectedRr = (100 * DEFAULT_TARGET_PCT) / 8;
    expect(rows[0].rr).toBeCloseTo(expectedRr);
  });

  it("portfolio vacio no rompe y devuelve rows=[]", () => {
    const { rows } = computeRiskRows([], 10000, 0.02);
    expect(rows).toEqual([]);
  });
});

describe("computePositionSize", () => {
  it("usa el stop default -8% cuando no se pasa stop", () => {
    const r = computePositionSize({ price: 100, capital: 10000, riskPct: 2, rrTarget: 2 });
    expect(r.stop).toBeCloseTo(100 * (1 - DEFAULT_STOP_PCT));
  });

  it("respeta un stop explicito por debajo del precio", () => {
    const r = computePositionSize({ price: 100, capital: 10000, riskPct: 2, stop: 90, rrTarget: 2 });
    expect(r.stop).toBe(90);
  });

  it("calcula posSize, units y riskAmt correctamente", () => {
    // price 100, stop 90 -> riskPct 10%, riskAmt = 10000*2% = 200, posSize = 200/0.10 = 2000
    const r = computePositionSize({ price: 100, capital: 10000, riskPct: 2, stop: 90, rrTarget: 2 });
    expect(r.riskAmt).toBeCloseTo(200);
    expect(r.posSize).toBeCloseTo(2000);
    expect(r.units).toBeCloseTo(20);
  });

  it("calcula target y R/R real segun el rrTarget configurable", () => {
    // price 100, stop 90, rrTarget 3 -> target = 100 + 3*10 = 130
    const r = computePositionSize({ price: 100, capital: 10000, riskPct: 2, stop: 90, rrTarget: 3 });
    expect(r.target).toBeCloseTo(130);
    expect(r.rr).toBeCloseTo(3);
  });

  it("devuelve error cuando el stop es mayor o igual al precio", () => {
    const r = computePositionSize({ price: 100, capital: 10000, riskPct: 2, stop: 100, rrTarget: 2 });
    expect(r.error).toBe("stop-not-below-price");
  });
});
