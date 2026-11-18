// Rebrand v3.1 de Inversiones (18-nov-2026): paleta violeta y tipografía Inter. Guardas para que no vuelvan
// Navy/Latón/Papel ni IBM Plex / Instrument Sans a lo que se publica.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const PAGES = ["app/index.html", "index.html", "faq.html", "estado-mercado.html", "perfil-inversor.html",
  "privacy.html", "terms.html", "datos-y-licencias.html", "docs/novedades.html"];
const SERVED = [...PAGES, "fonts.css", "sw.js", "manifest.webmanifest", "app/lib/market.js", "tools/og/og-invest.html"];
const OLD_VARS = /--(navy|laton|papel|accent-dark|verde|ceniza)\b[\w-]*/;
// Solo el código: los comentarios y el texto del registro de novedades pueden nombrar la historia.
const code = (s) => s.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/.*$/gm, "");

describe("sin la paleta Navy/Latón/Papel", () => {
  it.each(SERVED)("%s no nombra variables de la marca vieja", (f) => {
    expect(code(read(f))).not.toMatch(OLD_VARS);
  });
  it("manifest y theme-color en la paleta nueva (como financeos-app y moyiq.app)", () => {
    const m = JSON.parse(read("manifest.webmanifest"));
    expect(m.theme_color).toBe("#3C2282");
    expect(m.background_color).toBe("#3C2282");
    for (const f of PAGES.slice(1)) expect(read(f), f).toContain('<meta name="theme-color" content="#1E1044"/>');
    expect(read("app/index.html")).toContain('<meta name="theme-color" content="#3C2282" id="meta-theme"/>');
  });
  it("las páginas públicas usan la franja morada, el CTA lima con tinta y el héroe en Impulso", () => {
    for (const f of PAGES.slice(1)) {
      const s = read(f);
      expect(s, f).toContain(".btn-cta{background:var(--cta-bg);color:var(--cta-fg)}");
      expect(s, f).toMatch(/--cta-bg:var\(--lime-400\);--cta-fg:var\(--text-on-accent\);/);
      expect(s, f).toMatch(/\.nav\{[^}]*background:var\(--deep\)/);
      expect(s, f).toContain("--deep:var(--purple-900)");
    }
    expect(read("index.html")).toContain(".hero.dk{background:var(--gr-impulso)");
  });
});

describe("tipografía Inter (una sola familia, D2)", () => {
  it("fonts.css solo declara InterVariable y sus archivos existen", () => {
    const css = read("fonts.css");
    const fams = [...css.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(new Set(fams)).toEqual(new Set(["InterVariable"]));
    const files = readdirSync(new URL("../fonts/", import.meta.url));
    for (const u of css.matchAll(/url\(\/fonts\/([^)]+)\)/g)) expect(files).toContain(u[1]);
    expect(files).toContain("Inter-LICENSE.txt");
    expect(files.filter((x) => /plex|^-F6|^pxi/i.test(x))).toEqual([]);
  });
  // En las páginas se mira el CSS y el JS (font-family, fontFamily y rutas de archivos): el texto del
  // registro de novedades nombra la tipografía de entonces y eso es historia, no estilo.
  it.each(SERVED)("%s no usa IBM Plex ni Instrument Sans", (f) => {
    const s = code(read(f));
    expect(s).not.toMatch(/font-family[^;"}]*(Plex|Instrument)|fontFamily[^,}]*(Plex|Instrument)|ibm-plex/i);
    if (!f.endsWith(".html")) expect(s).not.toMatch(/IBM Plex|Instrument Sans/i);
  });
  it("la app precarga el subset latin de Inter y las cifras siguen tabulares", () => {
    const app = read("app/index.html");
    expect(app).toContain('<link rel="preload" href="/fonts/InterVariable-latin.woff2" as="font" type="font/woff2" crossorigin/>');
    expect(app).toMatch(/--num:\s+var\(--font-sans\);/);
    expect(app).toMatch(/\.num[^{]*\{[^}]*tabular-nums/);
  });
});

describe("gráficos en la paleta v3", () => {
  const app = read("app/index.html");
  const fn = (name) => { const i = app.indexOf("function " + name + "("); return app.slice(i, app.indexOf("\nfunction ", i + 10)); };
  it("lightweight-charts lee los colores por rol y normalizados (cssColor)", () => {
    const lw = fn("renderLWCharts");
    for (const t of ["'--chart-axis'", "'--chart-grid'", "'--color-income'", "'--color-over'", "'--chart-net'", "'--chart-ma'"]) expect(lw).toContain(t);
    expect(lw).toContain("var _tok=cssColor;");
    expect(fn("cssColor")).toContain("getComputedStyle(p).color");
  });
  it("hexAlpha acepta rgb() (lo que devuelve cssColor)", () => {
    const src = fn("hexAlpha");
    const hexAlpha = new Function(src + "; return hexAlpha;")();
    expect(hexAlpha("rgb(23, 151, 95)", 0.32)).toBe("rgba(23,151,95,0.32)");
    expect(hexAlpha("#17975F", 0.5)).toBe("rgba(23,151,95,0.5)");
  });
});
