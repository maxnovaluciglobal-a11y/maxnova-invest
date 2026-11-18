// BRD-4: Invest usa una sola paleta, la de /tokens-v2.css. Cada página la carga antes de su
// <style> y no redefine los colores de marca; solo quedan tonos propios de Invest con su motivo.
//
// D9 + D18 (17-nov-2026): CONGELADO POR MANTENIMIENTO. Hasta esta fecha /tokens.css era una copia
// literal de financeos-app/src/styles/tokens.css y este test exigía igualdad con la app. La app
// migra su tokens.css a la marca nueva y la medición del corte dio 0 cuentas externas con uso de
// Invest, así que Invest queda en mantenimiento con la paleta v2 (Navy/Latón) congelada en
// /tokens-v2.css. El test ya NO compara con la app: exige que la copia congelada no cambie (hash).
// Si Invest vuelve a desarrollarse, se migra a los tokens v3 en un despliegue propio
// (rebrand-startup-2026-11/validacion/03-revision-invest.md, A1) y este bloque se reescribe.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const PAGES = ["app/index.html", "index.html", "faq.html", "estado-mercado.html", "perfil-inversor.html",
  "privacy.html", "terms.html", "datos-y-licencias.html", "docs/novedades.html"];
const TOKENS = read("tokens-v2.css");
const FROZEN_SHA256 = "8f18672b69ca0762a433d4ba7607dc87341a874929d559b4c80cd2bc3babb38e";

const TOKEN_DEF = /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g;
const PALETTE = new Set([...TOKENS.matchAll(TOKEN_DEF)].map((m) => m[2].toUpperCase()));
// Primitivos de marca de tokens-v2.css (bloque "Paleta de marca"): ninguna página los redefine.
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

describe("BRD-4: paleta v2 congelada (D9, mantenimiento)", () => {
  it("tokens-v2.css es la copia congelada y no cambió", () => {
    expect(TOKENS).toContain("COPIA CONGELADA (D9 + D18");
    expect(TOKENS).toContain("Es el ÚNICO lugar de la app donde se");
    expect(TOKENS).toContain("--navy:        #14213D;");
    expect(createHash("sha256").update(TOKENS).digest("hex"), "tokens-v2.css está congelado: no se edita").toBe(FROZEN_SHA256);
  });

  it("ya no existe /tokens.css en Invest (evita sincronizar por error la paleta nueva de la app)", () => {
    expect(() => read("tokens.css")).toThrow();
  });

  it.each(PAGES)("%s carga /tokens-v2.css versionado antes de su primer <style>", (f) => {
    const s = read(f);
    const link = s.search(/<link rel="stylesheet" href="\/tokens-v2\.css\?v=\d+"\/>/);
    expect(link).toBeGreaterThan(-1);
    expect(link).toBeLessThan(s.indexOf("<style>"));
    expect(s).not.toContain('href="/tokens.css"');
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
      expect(s, f).not.toMatch(/#1A2A4A|#1F2E50|#213357|#2A3E66|#4A5368|#D4735F/i);
    }
  });

  it("el modo oscuro usa el fondo y las superficies de la app", () => {
    const app = read("app/index.html");
    const dark = app.slice(app.indexOf('[data-theme="dark"] {\n  --grn:'), app.indexOf("/* ── RESET"));
    expect(dark).toContain("--bg:        #0E1628;");
    expect(TOKENS).toMatch(/\[data-theme="dark"\] \{[\s\S]*--bg:\s*#0E1628;/);
    for (const [k, v] of [["card", "sur"], ["card2", "sur2"], ["card3", "sur3"]]) expect(dark).toMatch(new RegExp(`--${k}:\\s+var\\(--${v}\\);`));
    expect(app).toContain("dark?'#0E1628':'#14213D'");
  });

  // Entrega 1 (rebrand): el CACHE sube para que el SW nuevo borre el caché con la marca vieja.
  it("el service worker guarda /tokens-v2.css para que la app no pierda los colores sin conexión", () => {
    const sw = read("sw.js");
    expect(sw).toContain("path === '/tokens-v2.css'");
    expect(sw).toMatch(/const CACHE = 'moyiq-invest-v(\d+)'/);
    expect(+sw.match(/moyiq-invest-v(\d+)/)[1]).toBeGreaterThanOrEqual(12);
  });
});
