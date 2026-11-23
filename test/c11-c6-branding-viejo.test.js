// Auditoría de branding viejo (23-nov-2026). C11: un 404 con marca moyiq (antes caía la página
// genérica de Vercel, sin <title>) y /favicon.ico servido con el ícono vigente (lupa sobre #3C2282).
// C6 (parcial): el <title> y el og:title de la landing ya no dicen "(antes MOY IQ Invest)".
// Los redirects de invest.moyiq.app hacia la app quedan para cuando se publique la sección nueva.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const vercel = JSON.parse(read("vercel.json"));

describe("C11: 404 con marca y favicon.ico", () => {
  it("404.html existe, tiene title de moyiq, noindex y usa la paleta y la fuente vigentes", () => {
    expect(existsSync(new URL("../404.html", import.meta.url))).toBe(true);
    const s = read("404.html");
    expect(s).toMatch(/<title>Página no encontrada — moyiq · Inversiones<\/title>/);
    expect(s).toContain('<meta name="robots" content="noindex"/>');
    expect(s).toContain('href="/tokens-v3.css?v=1"');
    expect(s).toContain('href="/fonts.css"');
    expect(s).toContain('<use href="#moyiq"/>');
    expect(s).toMatch(/href="\/"/);
    expect(s).toMatch(/href="\/app"/);
    expect(s).not.toMatch(/MOY IQ|FinanceOS|MAXNOVA Invest|Navy|Latón/);
    expect(s).not.toMatch(/fonts\.googleapis|IBM Plex|Instrument Sans/i);
  });

  it("404.html solo usa rutas absolutas (se sirve en cualquier ruta)", () => {
    const s = read("404.html");
    for (const m of s.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      expect(m[1], m[1]).toMatch(/^(\/|#|mailto:|https:\/\/)/);
    }
  });

  it("/favicon.ico se reescribe al ícono vigente", () => {
    const rw = vercel.rewrites.find((r) => r.source === "/favicon.ico");
    expect(rw).toEqual({ source: "/favicon.ico", destination: "/icon-32.png" });
    expect(existsSync(new URL("../icon-32.png", import.meta.url))).toBe(true);
  });
});

describe("C6 parcial: sin \"(antes MOY IQ Invest)\" en title y og:title", () => {
  it("index.html", () => {
    const s = read("index.html");
    const title = s.match(/<title>([^<]*)<\/title>/)[1];
    const og = s.match(/<meta property="og:title" content="([^"]*)"/)[1];
    for (const t of [title, og]) {
      expect(t).toMatch(/^moyiq · Inversiones/);
      expect(t).not.toMatch(/\(antes|MOY IQ/);
    }
  });
});
