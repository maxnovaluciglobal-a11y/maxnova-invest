// Experimento interno: solo para las cuentas de lab-gate.js. Estas guardas fallan si el texto
// llega al código que descarga cualquier persona o si la puerta se abre para otra cuenta.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const gate = require("../app/lib/lab-gate.js");
const lab = require("../app/lib/lab-sugerido.js");

const read = (f) => readFileSync(resolve(__dirname, "..", f), "utf8");
const IDS = ["2667fd4a-f89b-4ef7-b2e9-153ea93795df", "8cf37241-3e65-400c-925c-aece074d561f"];

describe("puerta", () => {
  it("deja pasar las dos cuentas de Walter", () => {
    for (const id of IDS) expect(gate.allowed(id)).toBe(true);
    expect(gate.allowed(IDS[0].toUpperCase())).toBe(true);
  });
  it("rechaza cualquier otra cuenta y valores vacíos", () => {
    for (const id of ["00000000-0000-4000-8000-000000000000", IDS[0].slice(0, -1), "", null, undefined, 1, {}, [IDS[0]]]) {
      expect(gate.allowed(id)).toBe(false);
    }
  });
  it("a otra cuenta no le carga el módulo", () => {
    const doc = { createElement: vi.fn(), getElementById: vi.fn(), head: { appendChild: vi.fn() } };
    expect(gate.load("00000000-0000-4000-8000-000000000000", doc)).toBe(false);
    expect(doc.createElement).not.toHaveBeenCalled();
  });
  it("a las cuentas permitidas se lo carga una vez", () => {
    const el = {};
    const doc = { createElement: vi.fn(() => el), getElementById: vi.fn(() => null), head: { appendChild: vi.fn() } };
    expect(gate.load(IDS[1], doc)).toBe(true);
    expect(el.src).toBe("/app/lib/lab-sugerido.js");
    expect(doc.head.appendChild).toHaveBeenCalledOnce();
  });
  it("la lista de cuentas vive en un solo archivo", () => {
    for (const f of ["app/index.html", "app/lib/lab-sugerido.js", "app/lib/ledger.js"]) {
      for (const id of IDS) expect(read(f), f).not.toContain(id);
    }
  });
});

describe("el código público no lo contiene", () => {
  const shell = read("app/index.html");
  it("la app no trae sus textos, su archivo ni su pestaña", () => {
    for (const s of ["Monto sugerido", "monto sugerido", "Experimento interno", "No está publicado", "lab-sugerido", "Laboratorio", "InvestLab."]) {
      expect(shell).not.toContain(s);
    }
  });
  it("el módulo no se carga con una etiqueta fija ni en el service worker", () => {
    expect(shell).not.toMatch(/<script[^>]+lab-sugerido/);
    expect(read("sw.js")).not.toContain("lab-");
  });
  it("la app solo lo pide por la puerta y limpia las pestañas al cambiar de cuenta", () => {
    expect(shell).toContain("InvestLabGate.load(S.user.id)");
    expect(shell.indexOf("clearExtraTabs();\n    if(window.InvestLabGate)")).toBeGreaterThan(0);
  });
  it("sitios públicos, novedades y ayuda no lo anuncian", () => {
    for (const f of ["index.html", "faq.html", "llms.txt", "sitemap.xml", "robots.txt", "privacy.html", "terms.html"]) {
      expect(read(f), f).not.toMatch(/laboratorio|monto sugerido|experimento interno/i);
    }
  });
  it("sin registro, la hoja no resuelve: cae en Hoy", () => {
    const fn = shell.slice(shell.indexOf("function resolvePage"), shell.indexOf("// {dest, tab} de una hoja"));
    expect(fn).not.toContain("lab");
    expect(shell.slice(shell.indexOf("var DEST=["), shell.indexOf("var EXTRA_PAGES"))).not.toMatch(/page:'lab'/);
  });
  it("el módulo repite la comprobación al iniciar, al dibujar y al registrar", () => {
    const src = read("app/lib/lab-sugerido.js");
    expect(src.match(/gateOk\(\)/g).length).toBeGreaterThanOrEqual(4);
    expect(src).toContain("Experimento interno: solo visible para tu cuenta. No está publicado.");
  });
});

describe("carga en el navegador", () => {
  const src = read("app/lib/lab-sugerido.js");
  it("usa S y fmtD por nombre: son const del script de la app, no propiedades de window", () => {
    expect(read("app/index.html")).toMatch(/^const S=\{/m);
    expect(src).not.toMatch(/root\.(S|fmtD|DEST)\b/);
  });
});

describe("cálculo", () => {
  const rules = lab.DEFAULT_RULES;
  it("reglas iniciales: 200 50 %, 100 25 %, 50 15 %, 20 10 %", () => {
    expect(rules).toEqual([{ sma: 200, pct: 50 }, { sma: 100, pct: 25 }, { sma: 50, pct: 15 }, { sma: 20, pct: 10 }]);
  });
  it("detecta la media más larga con el precio en o bajo ella", () => {
    const smas = { 200: 100, 100: 110, 50: 120, 20: 130 };
    expect(lab.detectLevel(95, smas, rules).sma).toBe(200);
    expect(lab.detectLevel(100, smas, rules).sma).toBe(200);
    expect(lab.detectLevel(105, smas, rules).sma).toBe(100);
    expect(lab.detectLevel(125, smas, rules).sma).toBe(20);
    expect(lab.detectLevel(140, smas, rules)).toBeNull();
  });
  it("sin dato de una media pasa a la siguiente", () => {
    expect(lab.detectLevel(95, { 200: null, 100: 110 }, rules).sma).toBe(100);
    expect(lab.detectLevel(null, { 200: 100 }, rules)).toBeNull();
  });
  it("fondo = capital × peso; monto = fondo × porcentaje del nivel", () => {
    const f = lab.fundOf(10000, 12.5);
    expect(f).toBe(1250);
    expect(lab.suggestedAmount(f, { sma: 200, pct: 50 })).toBe(625);
    expect(lab.estimatedUnits(625, 125)).toBe(5);
    expect(lab.fundOf(0, 10)).toBe(0);
    expect(lab.suggestedAmount(1000, null)).toBe(0);
  });
  it("reglas inválidas vuelven a las iniciales; la zona de RSI se valida", () => {
    expect(lab.normalizeRules([{ sma: 0, pct: 10 }])).toEqual(rules);
    expect(lab.normalizeRules([{ sma: 20, pct: 30 }, { sma: 90, pct: 70 }]).map((r) => r.sma)).toEqual([90, 20]);
    expect(lab.normalizeRsi({ min: 60, max: 40 })).toEqual(lab.DEFAULT_RSI);
    expect(lab.rsiInZone(35, { min: 30, max: 50 })).toBe(true);
    expect(lab.rsiInZone(70, { min: 30, max: 50 })).toBe(false);
    expect(lab.rsiInZone(null, { min: 30, max: 50 })).toBeNull();
  });
});
