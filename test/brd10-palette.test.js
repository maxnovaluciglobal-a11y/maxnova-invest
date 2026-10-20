// BRD-10 (parte Invest): colores fuera de la paleta. El rojo de Tailwind
// (#ef4444 / rgba(239,68,68)) en toasts y botones de quitar no cambiaba con
// el tema y no era el rojo de marca. Fuera de las definiciones de tokens
// (--x: #...) solo se aceptan valores de la paleta.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const FILES = ["app/index.html", "index.html", "estado-mercado.html", "perfil-inversor.html", "faq.html",
  "privacy.html", "terms.html", "datos-y-licencias.html"];

// Paleta "El Instrumento" (moyiq-newsletter-proxy/lib/brand.js y DESIGN.md) + neutros.
const BRAND = ["#14213D", "#B8863B", "#8A6329", "#CC9A52", "#F1EEE6", "#FAF8F2", "#E4DFD1", "#4A4739",
  "#63604F", "#356E57", "#A23E2E", "#FFFFFF", "#000000"];
// Logotipo de Google en el botón "Continuar con Google" (colores obligatorios de su marca).
const GOOGLE = ["#EA4335", "#4285F4", "#FBBC05", "#34A853"];

const norm = (h) => {
  h = h.toUpperCase();
  return h.length === 4 ? "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h;
};
const TOKEN_DEF = /--[\w-]+\s*:\s*#[0-9a-fA-F]{3,8}\b/g;
const HEX = /(?<![&\w])#[0-9a-fA-F]{6}\b|(?<![&\w])#[0-9a-fA-F]{3}\b(?![\w-])/g;

// BRD-4: la paleta compartida vive en /tokens.css (copia de financeos-app): sus hex también valen.
const TOKENS_CSS = read("tokens.css");
function allowedFor(src) {
  const set = new Set([...BRAND, ...GOOGLE].map(norm));
  for (const m of TOKENS_CSS.matchAll(TOKEN_DEF)) set.add(norm(m[0].split(":")[1].trim()));
  for (const m of src.matchAll(TOKEN_DEF)) set.add(norm(m[0].split(":")[1].trim()));
  return set;
}
function offPalette(f) {
  const src = read(f);
  const allowed = allowedFor(src);
  const out = [];
  const noComments = src.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "));
  noComments.split("\n").forEach((line, i) => {
    const code = line.replace(TOKEN_DEF, "");
    if (/^\s*(\/\/|\*|\/\*)/.test(code)) return;
    for (const m of code.matchAll(HEX)) if (!allowed.has(norm(m[0]))) out.push(f + ":" + (i + 1) + " " + m[0]);
  });
  return out;
}

describe("BRD-10: sin colores fuera de la paleta en Invest", () => {
  it.each(FILES)("%s solo usa colores de la paleta o tokens", (f) => {
    expect(offPalette(f)).toEqual([]);
  });

  it("sin el rojo de Tailwind ni el gris pizarra en ningún lado", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src, f).not.toMatch(/#ef4444|rgba\(239,\s*68,\s*68/i);
      expect(src, f).not.toMatch(/#f1f5f9/i);
      expect(src, f).not.toMatch(/#A3402F/i);
    }
  });

  it("toasts y botones de quitar usan el rojo de estado del tema", () => {
    const app = read("app/index.html");
    expect(app).toContain(".toast.error { background:var(--neg); }");
    expect(app).toMatch(/\.mx:hover \{[^}]*color: var\(--red\)/);
    expect(app).toMatch(/\.btn-r \{[^}]*color: var\(--red\)/);
  });
});
