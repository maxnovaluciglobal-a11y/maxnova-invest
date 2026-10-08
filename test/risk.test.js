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

// ── Relanzamiento v2 (T18): riesgo al stop y límite de concentración ──
import { computeRiskAtStop, concentrationAlternative, DEFAULT_CONCENTRATION_LIMIT } from "../app/lib/risk.js";

describe("computeRiskAtStop", () => {
  it("calcula la pérdida si el precio toca el stop, por posición y total", () => {
    const port = [
      { t: "AAPL", sh: 16, cur: 234.12, stop: 222 },
      { t: "SPY", sh: 10, cur: 500 }, // sin stop propio → -8 % de referencia
    ];
    const r = computeRiskAtStop(port, 10000);
    expect(r.rows[0].riskAtStop).toBeCloseTo(16 * 12.12);
    expect(r.rows[0].stopIsDefault).toBe(false);
    expect(r.rows[1].stopIsDefault).toBe(true);
    expect(r.rows[1].riskAtStop).toBeCloseTo(10 * 500 * 0.08);
    expect(r.totalRisk).toBeCloseTo(16 * 12.12 + 400);
    expect(r.totalRiskPct).toBeCloseTo(r.totalRisk / 10000);
  });

  it("marca las posiciones que superan el límite de concentración (25 % por defecto)", () => {
    const port = [
      { t: "A", sh: 1, cur: 700 },
      { t: "B", sh: 1, cur: 300 },
    ];
    const r = computeRiskAtStop(port, 0);
    expect(DEFAULT_CONCENTRATION_LIMIT).toBe(0.25);
    expect(r.rows[0].overLimit).toBe(true);
    expect(r.rows[1].overLimit).toBe(true);
    expect(computeRiskAtStop(port, 0, 0.8).rows[0].overLimit).toBe(false);
  });

  it("ignora un stop por encima del precio y usa la referencia", () => {
    const r = computeRiskAtStop([{ t: "X", sh: 1, cur: 100, stop: 120 }], 1000);
    expect(r.rows[0].stopIsDefault).toBe(true);
    expect(r.rows[0].riskAtStop).toBeCloseTo(8);
  });
});

describe("concentrationAlternative", () => {
  it("propone las unidades que caben dentro del límite (caso del mockup M12)", () => {
    const alt = concentrationAlternative(234.12, 16, 10000);
    expect(alt.weight).toBeCloseTo(0.3746, 3);
    expect(alt.maxUnits).toBe(10);
    expect(alt.weightAtMax).toBeCloseTo(0.234, 3);
  });
  it("null si no supera el límite", () => {
    expect(concentrationAlternative(100, 10, 10000)).toBeNull();
  });
});

describe("computeRiskAtStop con stop por posición (I03)", () => {
  const port = [
    { t: "AAPL", sh: 16, cur: 234.12, stop: 222 },
    { t: "MSFT", sh: 12, cur: 498.7 },
    { t: "NVDA", sh: 20, cur: 178.3, stop: null },
  ];
  it("sin estimación: las filas sin stop no suman y se cuentan", async () => {
    const { computeRiskAtStop } = await import("../app/lib/risk.js");
    const r = computeRiskAtStop(port, 10000, 0.25, { estimateMissing: false });
    expect(r.noStopCount).toBe(2);
    expect(r.totalRisk).toBeCloseTo(16 * (234.12 - 222));
    expect(r.rows[1].noStop).toBe(true);
    expect(r.rows[1].riskAtStop).toBeNull();
    expect(r.rows[0].stopIsDefault).toBe(false);
  });
  it("con estimación (columna ausente): −8 % marcado como referencia", async () => {
    const { computeRiskAtStop, DEFAULT_STOP_PCT } = await import("../app/lib/risk.js");
    const r = computeRiskAtStop(port, 10000, 0.25);
    expect(r.noStopCount).toBe(0);
    expect(r.rows[1].stopIsDefault).toBe(true);
    expect(r.rows[1].stop).toBeCloseTo(498.7 * (1 - DEFAULT_STOP_PCT));
  });
  it("un stop sobre el precio actual no genera pérdida al stop", async () => {
    const { computeRiskAtStop } = await import("../app/lib/risk.js");
    const r = computeRiskAtStop([{ t: "X", sh: 10, cur: 100, stop: 105 }], 1000, 0.25, { estimateMissing: false });
    expect(r.rows[0].riskAtStop).toBe(0);
    expect(r.rows[0].stopIsDefault).toBe(false);
  });
});
