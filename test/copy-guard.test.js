// Guardas de copy sobre app/index.html (auditoría UX oct-2026, I05 y T18).
// Fallan si vuelve lenguaje o estructuras que el relanzamiento retiró:
// cestas de tickers por perfil, montos "sugeridos" y afirmaciones de frescura
// que no se sostienen.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const html = readFileSync(fileURLToPath(new URL("../app/index.html", import.meta.url)), "utf8");

// lab-sugerido.js es la única excepción: experimento interno que solo carga para las cuentas
// de lab-gate.js mientras Walter decide (PRODUCT.md, LEG-10). Ningún otro archivo de app/lib
// puede usar este lenguaje; lab-gate.js solo nombra la ruta de ese archivo.
const libDir = fileURLToPath(new URL("../app/lib", import.meta.url));
const COPY_GUARD_EXCLUDED = ["lab-sugerido.js"];
const libs = readdirSync(libDir)
  .filter((f) => f.endsWith(".js") && !COPY_GUARD_EXCLUDED.includes(f))
  .map((f) => [f, readFileSync(resolve(libDir, f), "utf8").replace("/app/lib/lab-sugerido.js", "")]);

describe("I05 · sin asignación por perfil ni 'Sugerido hoy'", () => {
  it("no hay columna ni leyenda 'Sugerido hoy'", () => {
    expect(html).not.toMatch(/Sugerido hoy/i);
  });
  it("no existe cestaDePerfil ni tablas de cestas por perfil", () => {
    expect(html).not.toMatch(/cestaDePerfil/);
    expect(html).not.toMatch(/var cestas\s*=/);
    expect(html).not.toMatch(/capUsarCesta/);
  });
  it("no presenta zonas de RSI como 'entrada favorable'", () => {
    expect(html).not.toMatch(/zona de entrada favorable/i);
    expect(html).not.toMatch(/RSI favorable/i);
  });
});

describe("Monto sugerido fuera de lo publicado", () => {
  it("la excepción es un solo archivo", () => {
    expect(COPY_GUARD_EXCLUDED).toEqual(["lab-sugerido.js"]);
    expect(libs.length).toBeGreaterThan(10);
  });
  it("ningún archivo de app/lib lo menciona", () => {
    for (const [f, src] of libs) {
      expect(src, f).not.toMatch(/monto sugerido|sugerido hoy|experimento interno/i);
    }
  });
});

describe("T18 · afirmaciones retiradas", () => {
  it("no promete tiempo real, sin retraso, notas 0-100 ni funciones inexistentes", () => {
    expect(html).not.toMatch(/tiempo real|sin retraso|78\/100|Q3 2026|AI Advisor/i);
  });
});

describe("I12 · sin capital ficticio por defecto", () => {
  it("el estado inicial no trae 100.000 de capital", () => {
    expect(html).not.toMatch(/capital:\s*100000/);
    expect(html).not.toMatch(/DEFAULT_CAPITAL\s*=\s*100000/);
    expect(html).not.toMatch(/:\s*100000;/);
  });
  it("no queda la etiqueta 'Position Builder' visible", () => {
    expect(html).not.toMatch(/'Position Builder'/);
  });
});

describe("I10 · idioma, marca y cifras", () => {
  it("sin emoji en la interfaz", () => {
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B06}\u{2B07}]/u);
  });
  it("fuentes self-hosted, nunca Google Fonts", () => {
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(html).toMatch(/href="\/fonts\.css"/);
  });
  it("radios de marca de 12 px como máximo", () => {
    expect(html).not.toMatch(/--r-(lg|xl):\s*(1[3-9]|[2-9]\d)px/);
    expect(html).not.toMatch(/border-radius:\s*999px/);
  });
  it("sin rótulos en inglés retirados", () => {
    for (const w of ["Portfolio Manager", "Market Movers", "Mkt Cap", "Export CSV", "Shares inválido", "'Screener'", "label:\"Watchlist\"", "label:\"Dashboard\"", "✓ Beat", "✗ Miss"]) {
      expect(html).not.toContain(w);
    }
  });
});
