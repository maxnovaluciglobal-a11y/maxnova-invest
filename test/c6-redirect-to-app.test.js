// C6 de la auditoría de branding (23-nov-2026): Inversiones ya vive dentro de la
// app (app.moyiq.app/app/?open=invest-*). invest.moyiq.app redirige ahí con 308
// la landing, la app vieja y las páginas de marketing, y deja vivas las que la
// app usa (/api/*, /datos-y-licencias.html) y las legales. El sw.js viejo se
// reemplaza por uno que borra sus cachés, se desregistra y lleva a la app.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const vercel = JSON.parse(read("vercel.json"));
const APP = "https://app.moyiq.app/app/?open=";

// Traduce un source de Vercel (literales, "\\." escapado y grupos "(.*)") a RegExp.
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRe = (src) => new RegExp("^" + src.replace(/\\\./g, ".").split("(.*)").map(esc).join("(.*)") + "$");
// El primer redirect que matchea gana (Vercel los evalúa en orden, antes que los archivos).
const redirectFor = (path) => vercel.redirects.find((r) => toRe(r.source).test(path)) || null;

describe("C6: invest.moyiq.app redirige a Inversiones dentro de la app", () => {
  const cases = [
    ["/", "invest-resumen"],
    ["/index.html", "invest-resumen"],
    ["/landing", "invest-resumen"],
    ["/app", "invest-resumen"],
    ["/app/", "invest-resumen"],
    ["/app/index.html", "invest-resumen"],
    ["/app/lib/market.js", "invest-resumen"],
    ["/faq.html", "invest-resumen"],
    ["/perfil-inversor.html", "invest-resumen"],
    ["/estado-mercado.html", "invest-mercado"],
    ["/docs", "invest-resumen"],
    ["/docs/novedades.html", "invest-resumen"],
  ];
  for (const [path, tab] of cases) {
    it(`${path} → 308 a ?open=${tab}`, () => {
      const r = redirectFor(path);
      expect(r, path).not.toBeNull();
      expect(r.destination).toBe(APP + tab);
      expect(r.permanent).toBe(true);
    });
  }

  const alive = [
    "/api/quote", "/api/marketbar", "/api/fx", "/api/health",
    "/datos-y-licencias.html", "/terms.html", "/privacy.html", "/404.html",
    "/sw.js", "/robots.txt", "/sitemap.xml", "/llms.txt", "/manifest.webmanifest",
    "/favicon.ico", "/favicon.svg", "/icon.svg", "/icon-32.png", "/icon-192.png", "/icon-512.png",
    "/apple-touch-icon.png", "/og-invest.png", "/fonts.css", "/fonts/InterVariable-latin.woff2", "/tokens-v3.css",
  ];
  for (const path of alive) {
    it(`${path} sigue vivo (sin redirect)`, () => {
      expect(redirectFor(path), path).toBeNull();
    });
  }

  it("ya no quedan rewrites a la app ni a la landing vieja", () => {
    const srcs = vercel.rewrites.map((r) => r.source);
    expect(srcs).not.toContain("/app");
    expect(srcs).not.toContain("/landing");
  });

  it("los redirects viejos (_pausa, *.md) van directo a la app, sin cadena", () => {
    for (const r of vercel.redirects) expect(r.destination.startsWith(APP), r.source).toBe(true);
  });

  it("sw.js mantiene Cache-Control: no-cache", () => {
    const h = vercel.headers.find((x) => x.source === "/sw.js");
    expect(h.headers).toContainEqual({ key: "Cache-Control", value: "no-cache" });
  });
});

describe("C6: sitemap sin páginas redirigidas", () => {
  const s = read("sitemap.xml");
  const locs = [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  it("solo lista páginas que siguen vivas", () => {
    expect(locs.sort()).toEqual(["/datos-y-licencias.html", "/privacy.html", "/terms.html"]);
    for (const p of locs) expect(redirectFor(p), p).toBeNull();
  });
});

describe("C6: sw.js es un kill switch", () => {
  const sw = read("sw.js");
  it("se instala sin esperar, borra todas las cachés, se desregistra y lleva a la app", () => {
    expect(sw).toMatch(/addEventListener\('install'[\s\S]*skipWaiting\(\)/);
    expect(sw).toMatch(/caches\.keys\(\)[\s\S]*caches\.delete\(k\)/);
    expect(sw).toContain("self.registration.unregister()");
    expect(sw).toContain("clients.matchAll(");
    expect(sw).toContain(".navigate(TARGET)");
    expect(sw).toContain("var TARGET = 'https://app.moyiq.app/app/?open=invest-resumen'");
  });
  it("no intercepta peticiones ni precachea nada", () => {
    expect(sw).not.toMatch(/addEventListener\('fetch'/);
    expect(sw).not.toMatch(/cache\.addAll|caches\.open/);
  });
  it("no mueve las pestañas abiertas en páginas que siguen vivas", () => {
    expect(sw).toContain("'/datos-y-licencias.html'");
  });
});
