// INV-N11: el Comparador correlacionaba los rendimientos alineados por la
// cola (los últimos n de cada serie), no por fecha. Con un feriado en un solo
// mercado, todo lo anterior al feriado quedaba desfasado un día.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { pairCorrelations, pearson } from "../app/lib/diversification.js";

const DAY = 86400, T0 = 1790000000;
const hist = (closes, skip = []) =>
  closes.map((c, i) => ({ ts: T0 + i * DAY + 48600, close: c })).filter((_, i) => !skip.includes(i));
// 41 cierres; A y B se mueven igual cada día (rendimientos idénticos, sin patrón alternado).
const rets = Array.from({ length: 40 }, (_, i) => Math.sin(i * 1.7) * 0.02);
const path = (r) => r.reduce((acc, x) => (acc.push(acc[acc.length - 1] * (1 + x)), acc), [100]);
const A = path(rets), B = path(rets);

describe("pairCorrelations (INV-N11)", () => {
  it("dos activos que se mueven igual dan 1 aunque uno no cotice un día (feriado local)", () => {
    const [p] = pairCorrelations(["SPY", "SQM.SN"], { SPY: hist(A), "SQM.SN": hist(B, [30]) });
    expect(p.a).toBe("SPY");
    expect(p.b).toBe("SQM.SN");
    expect(p.r).toBeGreaterThan(0.95);
  });
  it("el método anterior (por la cola) se diluía con el mismo feriado", () => {
    const ra = A.slice(1).map((c, i) => c / A[i] - 1);
    const Bh = B.filter((_, i) => i !== 30);
    const rb = Bh.slice(1).map((c, i) => c / Bh[i] - 1);
    const n = Math.min(ra.length, rb.length);
    expect(pearson(ra.slice(-n), rb.slice(-n))).toBeLessThan(0.5);
  });
  it("solo pares distintos, en orden, y '—' (null) sin historia real con fecha", () => {
    const synthetic = A.map((c) => ({ close: c, _synthetic: true }));
    const ps = pairCorrelations(["A", "B", "C"], { A: hist(A), B: hist(B), C: synthetic });
    expect(ps.map((p) => p.a + "-" + p.b)).toEqual(["A-B", "A-C", "B-C"]);
    expect(ps[0].r).toBeCloseTo(1, 9);
    expect(ps[1].r).toBeNull();
    expect(ps[2].r).toBeNull();
  });
});

describe("el Comparador usa la alineación por fecha", () => {
  const app = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");
  it("renderCompSection llama a InvestDiv.pairCorrelations con la historia de COMP.data", () => {
    expect(app).toContain("InvestDiv.pairCorrelations(st.map(function(s){return s.t;}),COMP.data)");
    expect(app).not.toMatch(/var a=st\[i\]\.rets,b=st\[j\]\.rets/);
  });
});
