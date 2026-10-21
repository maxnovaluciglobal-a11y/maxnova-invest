// Tests para app/lib/portfolio-history.js (L3: gráfico de valor del portafolio en Hoy).
import { describe, it, expect } from "vitest";
import { buildSeries, sliceRange, rebase, change, dayKey } from "../app/lib/portfolio-history.js";

const D = 86400;
const t0 = Date.UTC(2026, 0, 5) / 1000; // lunes 5-ene-2026
const day = (i) => t0 + i * D + 14.5 * 3600; // hora de apertura, como Yahoo
const rows = (closes, from = 0) => closes.map((c, i) => ({ ts: day(from + i), close: c }));

describe("buildSeries", () => {
  it("suma unidades × cierre de cada día", () => {
    const r = buildSeries(
      [{ t: "AAA", sh: 2, ccy: "USD" }, { t: "BBB", sh: 1, ccy: "USD" }],
      { AAA: rows([10, 11, 12]), BBB: rows([100, 90, 95]) }
    );
    expect(r.points.map((p) => p.v)).toEqual([120, 112, 119]);
    expect(r.included).toEqual(["AAA", "BBB"]);
    expect(r.missing).toEqual([]);
  });

  it("empieza cuando todas las posiciones tienen dato (sin saltos al sumarse una)", () => {
    const r = buildSeries(
      [{ t: "OLD", sh: 1, ccy: "USD" }, { t: "NEW", sh: 1, ccy: "USD" }],
      { OLD: rows([5, 5, 5, 5]), NEW: rows([7, 8], 2) }
    );
    expect(r.points.length).toBe(2);
    expect(r.points[0].v).toBe(12);
  });

  it("rellena hacia adelante los días en que un activo no cotizó", () => {
    const r = buildSeries(
      [{ t: "A", sh: 1, ccy: "USD" }, { t: "B", sh: 1, ccy: "USD" }],
      { A: rows([1, 2, 3]), B: [{ ts: day(0), close: 10 }, { ts: day(2), close: 30 }] }
    );
    expect(r.points.map((p) => p.v)).toEqual([11, 12, 33]);
  });

  it("pasa a USD con el tipo de cambio de cada día", () => {
    const r = buildSeries(
      [{ t: "SQM-B.SN", sh: 10, ccy: "CLP" }],
      { "SQM-B.SN": rows([1000, 1000]) },
      { CLP: rows([1000, 800]) }
    );
    expect(r.points.map((p) => p.v)).toEqual([10, 12.5]);
    expect(r.fxApprox).toEqual([]);
  });

  it("sin histórico de la moneda usa la tasa de hoy y lo informa", () => {
    const r = buildSeries([{ t: "X.SN", sh: 1, ccy: "CLP" }], { "X.SN": rows([940, 1880]) }, {}, { fxNow: { CLP: 940 } });
    expect(r.points.map((p) => p.v)).toEqual([1, 2]);
    expect(r.fxApprox).toEqual(["CLP"]);
  });

  it("deja fuera, con nombre, las posiciones sin historia o sin tipo de cambio", () => {
    const r = buildSeries(
      [{ t: "A", sh: 1, ccy: "USD" }, { t: "NOHIST", sh: 1, ccy: "USD" }, { t: "Z.SN", sh: 1, ccy: "CLP" }],
      { A: rows([1, 2]), "Z.SN": rows([1, 1]) }
    );
    expect(r.included).toEqual(["A"]);
    expect(r.missing).toEqual(["NOHIST", "Z.SN"]);
  });

  it("con acciones descarta los fines de semana que agrega la cripto", () => {
    const weekRows = rows([1, 1, 1, 1, 1, 1, 1]); // lun a dom
    const r = buildSeries(
      [{ t: "BTC-USD", sh: 1, ccy: "USD" }, { t: "AAPL", sh: 1, ccy: "USD" }],
      { "BTC-USD": weekRows, AAPL: rows([2, 2, 2, 2, 2]) },
      {},
      { weekdaysOnly: true }
    );
    expect(r.points.length).toBe(5);
    expect(r.points.every((p) => [0, 6].indexOf(new Date(p.ts * 1000).getUTCDay()) < 0)).toBe(true);
  });

  it("sin posiciones utilizables devuelve una serie vacía", () => {
    expect(buildSeries([], {}).points).toEqual([]);
  });
});

describe("sliceRange", () => {
  const pts = Array.from({ length: 400 }, (_, i) => ({ ts: t0 + i * D, v: i }));
  const last = pts[pts.length - 1].ts;
  it("1M, 3M y 1A cuentan días corridos desde el último punto", () => {
    expect(sliceRange(pts, "1M")[0].ts).toBe(last - 31 * D);
    expect(sliceRange(pts, "3M")[0].ts).toBe(last - 92 * D);
    expect(sliceRange(pts, "1A")[0].ts).toBe(last - 366 * D);
  });
  it("YTD empieza el 1 de enero del año del último punto", () => {
    const first = sliceRange(pts, "YTD")[0];
    expect(dayKey(first.ts)).toBe(new Date(last * 1000).getUTCFullYear() + "-01-01");
  });
  it("MAX devuelve todo y nunca menos de dos puntos", () => {
    expect(sliceRange(pts, "MAX").length).toBe(400);
    expect(sliceRange(pts.slice(0, 3), "1M").length).toBeGreaterThanOrEqual(2);
  });
});

describe("rebase y change", () => {
  it("el índice arranca en el mismo valor que la serie", () => {
    const pts = [{ ts: day(0), v: 1000 }, { ts: day(1), v: 1100 }, { ts: day(2), v: 1050 }];
    const idx = rebase(rows([400, 440, 420]), pts);
    expect(idx.map((p) => Math.round(p.v))).toEqual([1000, 1100, 1050]);
  });
  it("change da la variación absoluta y porcentual del período", () => {
    const c = change([{ ts: 1, v: 200 }, { ts: 2, v: null }, { ts: 3, v: 150 }]);
    expect(c.abs).toBe(-50);
    expect(c.pct).toBeCloseTo(-0.25);
  });
});
