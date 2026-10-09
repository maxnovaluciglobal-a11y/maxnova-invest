// Tests para app/lib/fx.js: precios en la moneda del activo y agregados en USD.
import { describe, it, expect } from "vitest";
import {
  currencyOf, rateOf, toUsd, fromUsd, decimalsFor,
  convertHoldings, portfolioTotals, sumUsd,
} from "../app/lib/fx.js";
import { computeRiskAtStop } from "../app/lib/risk.js";

const RATES = { CLP: 940, BRL: 5, MXN: 18.2 };

// Copia literal del dashTotals de app/index.html antes de este cambio
// (todo precio tratado como USD). Sirve de regresión: un portafolio solo en
// USD tiene que dar exactamente las mismas cifras.
function dashTotalsLegacy(port, LIVE) {
  var value = 0, cost = 0, day = 0, priced = 0;
  port.forEach(function (h) {
    var lq = LIVE[h.t];
    var px = lq && lq.price > 0 ? lq.price : null;
    cost += h.sh * h.cost;
    value += h.sh * (px || h.cost);
    if (px) { priced++; var cp = lq.changePct || 0; var prev = px / (1 + cp); day += h.sh * (px - prev); }
  });
  return { value: value, cost: cost, total: value - cost, totalPct: cost > 0 ? (value - cost) / cost : 0, day: day, dayPct: (value - day) > 0 ? day / (value - day) : 0, priced: priced, missing: port.length - priced };
}

describe("currencyOf", () => {
  it("la moneda de la cotización manda sobre el sufijo", () => {
    expect(currencyOf("SQM-B.SN", "CLP")).toBe("CLP");
    expect(currencyOf("ALGO.SN", "USD")).toBe("USD");
  });
  it("infiere por sufijo de Yahoo cuando no hay cotización", () => {
    expect(currencyOf("SQM-B.SN")).toBe("CLP");
    expect(currencyOf("PETR4.SA")).toBe("BRL");
    expect(currencyOf("WALMEX.MX")).toBe("MXN");
    expect(currencyOf("GGAL.BA")).toBe("ARS");
  });
  it("sin sufijo es USD (acciones, ETF, cripto -USD, BRK-B)", () => {
    expect(currencyOf("AAPL")).toBe("USD");
    expect(currencyOf("BTC-USD")).toBe("USD");
    expect(currencyOf("BRK-B")).toBe("USD");
  });
  it("sufijo desconocido sin cotización = moneda desconocida", () => {
    expect(currencyOf("VOD.L")).toBe(null);
  });
  it("respeta GBp (peniques) en vez de convertirlo con GBP", () => {
    expect(currencyOf("VOD.L", "GBp")).toBe("GBp");
    expect(rateOf("GBp", { GBP: 0.8 })).toBe(null);
  });
});

describe("rateOf / toUsd / fromUsd", () => {
  it("USD no necesita tasa y no altera el número", () => {
    expect(rateOf("USD", {})).toBe(1);
    expect(toUsd(123.456, "USD", {})).toBe(123.456);
    expect(toUsd(0.1 + 0.2, "USD", null)).toBe(0.1 + 0.2);
  });
  it("convierte CLP a USD con la tasa por dólar", () => {
    expect(toUsd(63190, "CLP", RATES)).toBeCloseTo(67.2234, 3);
    expect(fromUsd(100, "CLP", RATES)).toBe(94000);
  });
  it("sin tasa devuelve null, nunca 1:1", () => {
    expect(toUsd(100, "COP", RATES)).toBe(null);
    expect(toUsd(100, null, RATES)).toBe(null);
    expect(rateOf("CLP", { CLP: 0 })).toBe(null);
    expect(rateOf("CLP", { CLP: "x" })).toBe(null);
  });
  it("decimales por moneda", () => {
    expect(decimalsFor("CLP")).toBe(0);
    expect(decimalsFor("BRL")).toBe(2);
    expect(decimalsFor("USD")).toBe(2);
  });
});

describe("portfolioTotals", () => {
  const usdPort = [
    { t: "AAPL", sh: 16, cost: 205.4 },
    { t: "SPY", sh: 10, cost: 560.1 },
    { t: "MSFT", sh: 12, cost: 445.0 },
    { t: "NVDA", sh: 20, cost: 120.0 },
    { t: "BTC-USD", sh: 0.0137, cost: 61234.5 },
  ];
  const usdLive = {
    AAPL: { price: 234.12, changePct: 0.0123 },
    SPY: { price: 585.4, changePct: -0.0041 },
    MSFT: { price: 498.7, changePct: 0.0007 },
  };

  it("regresión: portafolio solo en USD da cifras idénticas al dashTotals anterior", () => {
    const legacy = dashTotalsLegacy(usdPort, usdLive);
    const now = portfolioTotals(usdPort, (t) => usdLive[t] || null, (t) => currencyOf(t), {});
    for (const k of Object.keys(legacy)) expect(now[k]).toBe(legacy[k]);
    expect(now.excluded).toBe(0);
  });

  it("mezcla USD + CLP: la posición en CLP suma su valor en USD", () => {
    const port = [
      { t: "AAPL", sh: 10, cost: 200 },
      { t: "SQM-B.SN", sh: 100, cost: 60000 },
    ];
    const live = { AAPL: { price: 250, changePct: 0 }, "SQM-B.SN": { price: 63190, changePct: 0 } };
    const T = portfolioTotals(port, (t) => live[t], (t) => currencyOf(t), RATES);
    // 10 × 250 + 100 × 63190 / 940 = 2500 + 6722,34
    expect(T.value).toBeCloseTo(2500 + 6319000 / 940, 6);
    expect(T.cost).toBeCloseTo(2000 + 6000000 / 940, 6);
    // Antes contaba US$6,3 millones.
    expect(T.value).toBeLessThan(10000);
    expect(T.excluded).toBe(0);
  });

  it("sin tipo de cambio la posición queda fuera y se cuenta en excluded", () => {
    const port = [
      { t: "AAPL", sh: 10, cost: 200 },
      { t: "ECOPETROL.CL", sh: 100, cost: 2000 },
    ];
    const live = { AAPL: { price: 250, changePct: 0.01 }, "ECOPETROL.CL": { price: 2100, changePct: 0 } };
    const T = portfolioTotals(port, (t) => live[t], (t) => currencyOf(t), RATES);
    expect(T.value).toBe(2500);
    expect(T.cost).toBe(2000);
    expect(T.excluded).toBe(1);
    expect(T.missing).toBe(0);
    expect(T.priced).toBe(1);
  });
});

describe("convertHoldings + riesgo al stop", () => {
  it("el stop en CLP se convierte: el riesgo al stop sale en USD", () => {
    const port = [{ id: 1, t: "SQM-B.SN", sh: 100, cost: 60000, cur: 63190, stop: 58000 }];
    const { rows, excluded } = convertHoldings(port, (t) => currencyOf(t), RATES);
    expect(excluded).toHaveLength(0);
    const r = rows[0];
    expect(r.ccy).toBe("CLP");
    expect(r.curN).toBe(63190);
    expect(r.stopN).toBe(58000);
    expect(r.costN).toBe(60000);
    const rs = computeRiskAtStop(rows, 0, 0.25, { estimateMissing: false });
    // (63190 − 58000) × 100 / 940 = 552,13 USD
    expect(rs.totalRisk).toBeCloseTo((63190 - 58000) * 100 / 940, 6);
    expect(rs.totalRisk).toBeLessThan(1000);
  });

  it("USD queda intacto (mismos números que entraron)", () => {
    const port = [{ id: 1, t: "AAPL", sh: 3, cost: 172.5, cur: 234.12, stop: 222 }];
    const { rows } = convertHoldings(port, (t) => currencyOf(t), {});
    expect(rows[0].cost).toBe(172.5);
    expect(rows[0].cur).toBe(234.12);
    expect(rows[0].stop).toBe(222);
    expect(rows[0].fx).toBe(1);
  });

  it("sin tasa: va a excluded con sus valores nativos", () => {
    const port = [
      { id: 1, t: "AAPL", sh: 1, cost: 100, cur: 110 },
      { id: 2, t: "PETR4.SA", sh: 10, cost: 30, cur: 35 },
    ];
    const { rows, excluded } = convertHoldings(port, (t) => currencyOf(t), { CLP: 940 });
    expect(rows.map((r) => r.t)).toEqual(["AAPL"]);
    expect(excluded).toHaveLength(1);
    expect(excluded[0]).toMatchObject({ t: "PETR4.SA", ccy: "BRL", cur: 35, curN: 35, fx: null });
  });

  it("los pesos suman 100 % sobre las posiciones con precio y tasa", () => {
    const port = [
      { id: 1, t: "AAPL", sh: 10, cost: 200, cur: 250 },
      { id: 2, t: "SQM-B.SN", sh: 100, cost: 60000, cur: 63190 },
      { id: 3, t: "PETR4.SA", sh: 50, cost: 30, cur: 35 },
      { id: 4, t: "ECOPETROL.CL", sh: 100, cost: 2000, cur: 2100 },
    ];
    const { rows, excluded } = convertHoldings(port, (t) => currencyOf(t), RATES);
    expect(excluded.map((h) => h.t)).toEqual(["ECOPETROL.CL"]);
    const rs = computeRiskAtStop(rows, 0, 0.25, { estimateMissing: false });
    const sum = rs.rows.reduce((s, r) => s + r.weight, 0);
    expect(sum).toBeCloseTo(1, 12);
    // SQM: 6722,34 USD de 2500 + 6722,34 + 350 → 70 % (antes era ~99,96 %)
    const sqm = rs.rows.find((r) => r.t === "SQM-B.SN");
    expect(sqm.weight).toBeCloseTo((6319000 / 940) / (2500 + 6319000 / 940 + 350), 9);
  });
});

describe("sumUsd", () => {
  it("suma montos en distintas monedas y cuenta los que no tienen tasa", () => {
    const trades = [
      { ticker: "AAPL", amount: 1000 },
      { ticker: "SQM-B.SN", amount: 940000 },
      { ticker: "ECOPETROL.CL", amount: 5000 },
      { ticker: null, amount: 200 },
    ];
    const r = sumUsd(trades, (x) => x.amount, (x) => (x.ticker ? currencyOf(x.ticker) : "USD"), RATES);
    expect(r.total).toBe(1000 + 1000 + 200);
    expect(r.excluded).toBe(1);
    expect(r.items).toHaveLength(3);
  });
});
