// FIN-4: la matriz de Diversificación correlacionaba precios (dos series con
// tendencia salen "muy correlacionadas" aunque sus movimientos diarios sean
// opuestos) y alineaba por la cola, sin mirar las fechas.
import { describe, it, expect } from "vitest";
import { pearson, alignedReturns, returnCorrelation, MIN_RETURNS } from "../app/lib/diversification.js";

const DAY = 86400;
const T0 = 1790000000; // un día cualquiera, en segundos
const hist = (closes, skip = []) =>
  closes.map((c, i) => ({ ts: T0 + i * DAY + 48600, close: c })).filter((_, i) => !skip.includes(i));

describe("pearson", () => {
  it("casos conocidos", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12);
    // x = 1..5, y = 2,1,4,3,5: cov 2, var 2 y 2 => 0,8
    expect(pearson([1, 2, 3, 4, 5], [2, 1, 4, 3, 5])).toBeCloseTo(0.8, 12);
  });
  it("sin variación o con menos de 2 puntos no hay dato", () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(pearson([1], [1])).toBeNull();
  });
});

describe("returnCorrelation (FIN-4)", () => {
  // 31 cierres: A sube 1 % y 3 % alternados; B, con la misma tendencia, hace
  // lo contrario cada día (3 % y 1 %). Los precios suben juntos (precio contra
  // precio da casi 1) pero los movimientos diarios son opuestos (−1).
  const a = [100], b = [100];
  for (let i = 1; i <= 30; i++) {
    a.push(a[i - 1] * (i % 2 ? 1.01 : 1.03));
    b.push(b[i - 1] * (i % 2 ? 1.03 : 1.01));
  }
  it("precio contra precio daba ~1 (el error)", () => {
    expect(pearson(a, b)).toBeGreaterThan(0.99);
  });
  it("sobre retornos da −1", () => {
    expect(returnCorrelation(hist(a), hist(b))).toBeCloseTo(-1, 9);
  });
  it("alinea por fecha: un feriado en un solo mercado no corre la serie", () => {
    // B no cotiza el día 10 (feriado local). Alineado por fecha, los retornos
    // se calculan sobre los mismos días en ambas => queda claramente negativa
    // (el tramo de dos días de 9 a 11 pesa, por eso no es −1: da ≈ −0,75).
    // Alineado por la cola, los días previos al feriado quedan desfasados uno
    // y la correlación se diluye (≈ −0,40).
    const r = returnCorrelation(hist(a), hist(b, [10]));
    expect(r).toBeLessThan(-0.7);
    const ra = a.slice(1).map((c, i) => c / a[i] - 1);
    const bb = b.filter((_, i) => i !== 10);
    const rb = bb.slice(1).map((c, i) => c / bb[i] - 1);
    const n = Math.min(ra.length, rb.length);
    expect(pearson(ra.slice(-n), rb.slice(-n))).toBeGreaterThan(-0.5);
  });
  it("con menos de 20 retornos en común devuelve null (se muestra «—»)", () => {
    expect(MIN_RETURNS).toBe(20);
    expect(returnCorrelation(hist(a.slice(0, 20)), hist(b.slice(0, 20)))).toBeNull(); // 19 retornos
    expect(returnCorrelation(hist(a.slice(0, 21)), hist(b.slice(0, 21)))).toBeCloseTo(-1, 9); // 20
  });
  it("fechas sin cruce o historia vacía => null", () => {
    const late = hist(b).map((d) => ({ ...d, ts: d.ts + 100 * DAY }));
    expect(returnCorrelation(hist(a), late)).toBeNull();
    expect(returnCorrelation(null, hist(b))).toBeNull();
  });
  it("alignedReturns ignora cierres no positivos", () => {
    const h = hist([100, 0, 110, 121]);
    const { ra } = alignedReturns(h, h);
    expect(ra.map((r) => +r.toFixed(6))).toEqual([0.1, 0.1]);
  });
});

import { readFileSync } from "node:fs";
describe("la matriz de la app usa retornos alineados (FIN-4)", () => {
  const app = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");
  it("renderCorrelationMatrix llama a InvestDiv.returnCorrelation con la historia de 2 meses", () => {
    expect(app).toContain("InvestDiv.returnCorrelation(dHistCache[ta+'_60'],dHistCache[tb+'_60'])");
    expect(app).not.toMatch(/pearson\(closes\[/);
  });
  it("ya no rellena con precios sintéticos al calcular la correlación", () => {
    expect(app).not.toContain("loadCorrData");
  });
  it("el texto dice variaciones diarias, no precios", () => {
    expect(app).not.toContain("Cómo se movieron juntos sus precios");
    expect(app).toContain("Cómo se movieron juntas sus variaciones diarias");
  });
});

describe("la historia de la matriz usa un rango que /api/history acepta", () => {
  it("'2mo' devolvía 400 (la matriz nunca cargaba en producción)", () => {
    const app = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");
    const api = readFileSync(new URL("../api/history.js", import.meta.url), "utf8");
    const valid = JSON.parse(api.match(/validRanges\s*=\s*(\[[^\]]+\])/)[1].replace(/'/g, '"'));
    const m = app.match(/function portLoadCorr\(\)[\s\S]*?fetchHistory\(t,'([^']+)'\)/);
    expect(m).not.toBeNull();
    expect(valid).toContain(m[1]);
  });
});
