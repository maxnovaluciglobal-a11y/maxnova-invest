// BRD-4: Invest usa la misma paleta que la app. /tokens.css es una copia literal de
// financeos-app/src/styles/tokens.css (no se edita aquí: se edita allá y se vuelve a copiar,
// ver financeos-app/docs/tokens-de-diseno.md). Cada página la carga antes de su <style> y
// ya no redefine los colores de marca; solo quedan tonos propios de Invest con su motivo.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const PAGES = ["app/index.html", "index.html", "faq.html", "estado-mercado.html", "perfil-inversor.html",
  "privacy.html", "terms.html", "datos-y-licencias.html", "docs/novedades.html"];
const TOKENS = read("tokens.css");
const APP_TOKENS = new URL("../../financeos-app/src/styles/tokens.css", import.meta.url);

const TOKEN_DEF = /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g;
const PALETTE = new Set([...TOKENS.matchAll(TOKEN_DEF)].map((m) => m[2].toUpperCase()));
// Primitivos de marca de tokens.css (bloque "Paleta de marca"): ninguna página los redefine.
const PRIMITIVES = (() => {
  const a = TOKENS.indexOf("Paleta de marca"), b = TOKENS.indexOf("Light theme");
  return [...TOKENS.slice(a, b).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
})();

// Tonos propios de Invest (no están en la paleta de la app), cada uno con su motivo.
const INVEST_ONLY = {
  "#E59580": "rojo de pérdida en oscuro: el de la app (#C96856) da 4,2:1 sobre --sur2 (A11Y-12)",
  "#F3DAD5": "tinte de error (hover de quitar) en claro",
  "#4A2A22": "tinte de error (hover de quitar) en oscuro",
  "#F0A493": "pérdida sobre la barra lateral Navy: #C96856 da 4,3:1",
  "#B9C0CF": "sufijo \"Invest\" del logotipo sobre Navy en las páginas públicas",
  "#22355A": "hover de botones sobre Navy en la landing",
  "#6F8FB3": "serie 2 del Comparador (claro)",
  "#8A8676": "serie 3 del Comparador (claro)",
  "#C7D3E0": "serie 4 del Comparador (oscuro)",
};

describe("BRD-4: tokens compartidos con la app", () => {
  it("tokens.css es la copia literal de financeos-app (si el repo hermano está disponible)", () => {
    expect(TOKENS).toContain("Es el ÚNICO lugar de la app donde se");
    if (existsSync(APP_TOKENS)) expect(TOKENS).toBe(readFileSync(APP_TOKENS, "utf8"));
  });

  it.each(PAGES)("%s carga /tokens.css antes de su primer <style>", (f) => {
    const s = read(f);
    const link = s.indexOf('<link rel="stylesheet" href="/tokens.css"/>');
    expect(link).toBeGreaterThan(-1);
    expect(link).toBeLessThan(s.indexOf("<style>"));
  });

  // En oscuro, Invest puede apuntar un primitivo a otro de la paleta (--laton: var(--accent-dark)),
  // pero nunca darle un hex propio.
  it.each(PAGES)("%s no redefine los colores de marca y solo define hex de la paleta o propios", (f) => {
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const p of PRIMITIVES) expect(s, `${f} redefine ${p}`).not.toMatch(new RegExp(p.replace(/-/g, "\\-") + "\\s*:\\s*#"));
    const off = [...s.matchAll(TOKEN_DEF)].map((m) => m[2].toUpperCase())
      .filter((h) => !PALETTE.has(h) && !INVEST_ONLY[h]);
    expect(off).toEqual([]);
  });

  it("sin la deriva medida en la auditoría", () => {
    for (const f of [...PAGES, "tools/og/og-invest.html"]) {
      const s = read(f);
      expect(s, f).not.toMatch(/#1A2A4A|#1F2E50|#0E1628|#213357|#2A3E66|#4A5368|#D4735F/i);
    }
  });

  it("el modo oscuro usa el fondo y las superficies de la app", () => {
    const app = read("app/index.html");
    const dark = app.slice(app.indexOf('[data-theme="dark"] {\n  --grn:'), app.indexOf("/* ── RESET"));
    expect(dark).toContain("--bg:        #12161F;");
    expect(TOKENS).toMatch(/\[data-theme="dark"\] \{[\s\S]*--bg:\s*#12161F;/);
    for (const [k, v] of [["card", "sur"], ["card2", "sur2"], ["card3", "sur3"]]) expect(dark).toMatch(new RegExp(`--${k}:\\s+var\\(--${v}\\);`));
    expect(app).toContain("dark?'#12161F':'#14213D'");
  });

  it("el service worker guarda /tokens.css para que la app no pierda los colores sin conexión", () => {
    const sw = read("sw.js");
    expect(sw).toContain("path === '/tokens.css'");
    expect(sw).toMatch(/const CACHE = 'maxnova-v(\d+)'/);
    expect(+sw.match(/maxnova-v(\d+)/)[1]).toBeGreaterThanOrEqual(9);
  });
});
