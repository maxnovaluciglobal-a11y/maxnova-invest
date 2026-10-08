// Guardas de copy sobre app/index.html (auditoría UX oct-2026, I05 y T18).
// Fallan si vuelve lenguaje o estructuras que el relanzamiento retiró:
// cestas de tickers por perfil, montos "sugeridos" y afirmaciones de frescura
// que no se sostienen.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../app/index.html", import.meta.url)), "utf8");

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
