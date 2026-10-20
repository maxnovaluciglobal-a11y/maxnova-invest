// INV-N12: cuando /api/history falla para un símbolo (p. ej. SQM.SN da 502),
// el Comparador dibujaba una línea inventada con Math.random (genFallback).
// Ahora no hay serie para ese símbolo y se avisa "Sin historia disponible".
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as InvestDiv from "../app/lib/diversification.js";

const app = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");

function extractFn(name) {
  const re = new RegExp("(?:async\\s+)?function\\s+" + name + "\\s*\\(");
  const m = re.exec(app);
  if (!m) return "";
  let i = app.indexOf("{", m.index), depth = 0;
  for (let j = i; j < app.length; j++) {
    if (app[j] === "{") depth++;
    else if (app[j] === "}" && --depth === 0) return app.slice(m.index, j + 1);
  }
  throw new Error("sin cierre: " + name);
}

const DAY = 86400, T0 = 1790000000;
const real = (n, p0) => Array.from({ length: n }, (_, i) => ({ ts: T0 + i * DAY, close: p0 * (1 + 0.01 * Math.sin(i)) }));

function sandbox(failing) {
  const ctx = {
    COMP: { tickers: ["SPY", "SQM.SN", "VTI"], range: 90, data: {}, loading: false, spy: null, showSPY: true, missing: [] },
    LIVE: {}, LOC: "es-CL", InvestDiv, Math, Promise, console,
    fetchHistory: (t) => (failing.includes(t) ? Promise.reject(new Error("502")) : Promise.resolve(real(60, 100))),
    fetchQuote: () => Promise.resolve(null),
    getLivePrice: () => 100,
    renderComp() {}, showToast() {},
    esc: (s) => String(s), pxT: () => "", chgCell: () => "", icon: () => "",
    fmtPctN: (v, d) => Number(v).toFixed(d) + " %",
  };
  vm.createContext(ctx);
  for (const fn of ["genFallback", "compMissing", "compLoad", "renderCompSection"]) {
    const src = extractFn(fn);
    if (src) vm.runInContext(src, ctx);
  }
  return ctx;
}

describe("Comparador sin historia real (INV-N12)", () => {
  it("no queda ningún generador aleatorio de series en la app", () => {
    expect(app).not.toMatch(/Math\.random/);
    expect(app).not.toMatch(/function genFallback/);
    expect(app).not.toMatch(/_synthetic\s*:\s*true/);
  });

  it("un símbolo cuya historia falla no recibe una serie inventada", async () => {
    const ctx = sandbox(["SQM.SN"]);
    await vm.runInContext("compLoad()", ctx);
    expect(ctx.COMP.data["SQM.SN"]).toEqual([]);
    expect(ctx.COMP.missing).toEqual(["SQM.SN"]);
    expect(ctx.COMP.data.SPY.length).toBe(60);
  });

  it("el gráfico omite la línea y avisa 'Sin historia disponible para este símbolo'", async () => {
    const ctx = sandbox(["SQM.SN"]);
    await vm.runInContext("compLoad()", ctx);
    const html = vm.runInContext("renderCompSection()", ctx);
    expect(html).toContain("<b>SQM.SN</b>: Sin historia disponible para este símbolo");
    expect((html.match(/<polyline /g) || []).length).toBe(2); // SPY y VTI (SPY ya está, no hay referencia aparte)
    expect(html).not.toMatch(/ilustrativ/);
    // Las medidas solo traen columnas de los símbolos con historia.
    expect(html).not.toMatch(/<th>[^<]*<i class="cmp-sw"[^>]*><\/i>SQM\.SN<\/th>/);
  });

  it("si ningún símbolo tiene historia no se dibuja gráfico", async () => {
    const ctx = sandbox(["SPY", "SQM.SN", "VTI"]);
    await vm.runInContext("compLoad()", ctx);
    const html = vm.runInContext("renderCompSection()", ctx);
    expect(html).not.toContain("<svg");
    expect(html).toContain("No hay historia de precios para comparar en este período.");
    expect((html.match(/Sin historia disponible para este símbolo/g) || []).length).toBe(3);
  });
});
