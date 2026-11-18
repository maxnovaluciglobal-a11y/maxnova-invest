// BRD-10 (parte Invest): colores fuera de la paleta. El rojo de Tailwind
// (#ef4444 / rgba(239,68,68)) en toasts y botones de quitar no cambiaba con
// el tema y no era el rojo de marca. Fuera de las definiciones de tokens
// (--x: #...) solo se aceptan valores de la paleta.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const FILES = ["app/index.html", "index.html", "estado-mercado.html", "perfil-inversor.html", "faq.html",
  "privacy.html", "terms.html", "datos-y-licencias.html", "docs/novedades.html"];

// Paleta moyiq v3.1 (18-nov-2026; CATALOGO-OPCIONES.md): morado 900/800/700 de marca, violeta de acción,
// lima, grafito y grises, y los textos de dato. Todos están además en /tokens-v3.css.
const BRAND = ["#1E1044", "#2D1964", "#3C2282", "#7A21FF", "#D0F06E", "#1C1D21", "#2A2C31", "#6B6F78",
  "#0E7A50", "#C2272D", "#9A5B00", "#FFFFFF", "#000000"];
// Logotipo de Google en el botón "Continuar con Google" (colores obligatorios de su marca).
const GOOGLE = ["#EA4335", "#4285F4", "#FBBC05", "#34A853"];

const norm = (h) => {
  h = h.toUpperCase();
  return h.length === 4 ? "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h;
};
const TOKEN_DEF = /--[\w-]+\s*:\s*#[0-9a-fA-F]{3,8}\b/g;
const HEX = /(?<![&\w])#[0-9a-fA-F]{6}\b|(?<![&\w])#[0-9a-fA-F]{3}\b(?![\w-])/g;

// BRD-4: la paleta vive en /tokens-v3.css (copia literal de la app): sus hex también valen.
const TOKENS_CSS = read("tokens-v3.css");
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

  it("sin la paleta Navy/Latón/Papel retirada (hex ni nombres de variable)", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src, f).not.toMatch(/#14213D|#B8863B|#8A6329|#CC9A52|#F1EEE6|#FAF8F2|#E4DFD1|#0E1628|#B9C0CF|#22355A/i);
      expect(src, f).not.toMatch(/var\(--(navy|laton|papel|accent-dark|verde|ceniza)[\w-]*\)/);
      expect(src, f).not.toMatch(/rgba\((20,33,61|241,238,230|184,134,59|204,154,82),/);
    }
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
