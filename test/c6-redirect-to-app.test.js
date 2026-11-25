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
// Coherencia web (25-nov-2026, opción b2 aprobada por Walter): la portada y las páginas viejas
// van a la página indexable de la función en moyiq.app; /app y /app/* siguen yendo a la app
// (marcadores y la PWA vieja).
const PAGE = "https://moyiq.app/inversiones";

// Traduce un source de Vercel (literales, "\\." escapado y grupos "(.*)") a RegExp.
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRe = (src) => new RegExp("^" + src.replace(/\\\./g, ".").split("(.*)").map(esc).join("(.*)") + "$");
// El primer redirect que matchea gana (Vercel los evalúa en orden, antes que los archivos).
const redirectFor = (path) => vercel.redirects.find((r) => toRe(r.source).test(path)) || null;

describe("C6: /app sigue yendo a Inversiones dentro de la app", () => {
  for (const path of ["/app", "/app/", "/app/index.html", "/app/lib/market.js"]) {
    it(`${path} → 308 a ?open=invest-resumen`, () => {
      const r = redirectFor(path);
      expect(r, path).not.toBeNull();
      expect(r.destination).toBe(APP + "invest-resumen");
      expect(r.permanent).toBe(true);
    });
  }
});

describe("b2: la portada y las páginas viejas van a moyiq.app/inversiones", () => {
  const cases = ["/", "/index.html", "/landing", "/faq.html", "/perfil-inversor.html", "/estado-mercado.html",
    "/docs", "/docs/novedades.html", "/_pausa", "/_pausa/index.full.html", "/README.md", "/docs/relaunch-email.md"];
  for (const path of cases) {
    it(`${path} → 308 a ${PAGE}`, () => {
      const r = redirectFor(path);
      expect(r, path).not.toBeNull();
      expect(r.destination).toBe(PAGE);
      expect(r.permanent).toBe(true);
    });
  }
});

describe("C6: invest.moyiq.app deja vivo lo que la app usa", () => {

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

  it("todo redirect va directo a su destino final (la app o la página de la función), sin cadena", () => {
    for (const r of vercel.redirects) {
      expect(r.destination.startsWith(APP) || r.destination === PAGE, r.source).toBe(true);
      expect(r.permanent, r.source).toBe(true);
    }
  });

  it("los legales históricos se sirven con X-Robots-Tag noindex, follow", () => {
    for (const src of ["/privacy.html", "/terms.html"]) {
      const h = vercel.headers.find((x) => x.source === src);
      expect(h, src).toBeTruthy();
      expect(h.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, follow" });
    }
  });

  it("/api/* no tiene redirects", () => {
    for (const r of vercel.redirects) expect(r.source.startsWith("/api"), r.source).toBe(false);
  });

  it("sw.js mantiene Cache-Control: no-cache", () => {
    const h = vercel.headers.find((x) => x.source === "/sw.js");
    expect(h.headers).toContainEqual({ key: "Cache-Control", value: "no-cache" });
  });
});

describe("C6: sitemap sin páginas redirigidas", () => {
  const s = read("sitemap.xml");
  const locs = [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  it("solo lista la página indexable que sigue viva (los legales históricos van con noindex)", () => {
    expect(locs.sort()).toEqual(["/datos-y-licencias.html"]);
    for (const p of locs) expect(redirectFor(p), p).toBeNull();
  });
  it("robots.txt deja rastrear los redirects y declara solo el sitemap de este host", () => {
    const r = read("robots.txt");
    expect(r).toMatch(/^User-agent: \*\nAllow: \//m);
    expect(r).not.toMatch(/Disallow: \/\s*$/m);
    expect([...r.matchAll(/^Sitemap: (.+)$/gm)].map((m) => m[1])).toEqual(["https://invest.moyiq.app/sitemap.xml"]);
  });
  it("llms.txt es una ficha corta que remite a moyiq.app (sin una segunda versión de los hechos)", () => {
    const l = read("llms.txt");
    expect(l).toContain("https://moyiq.app/inversiones");
    expect(l).toContain("https://moyiq.app/llms.txt");
    expect(l).not.toMatch(/Chile first|trade journal|each app keeps its data separately|Language: Spanish/);
    expect(l.split("\n").length).toBeLessThan(25);
  });
});

describe("c2: los legales de invest.moyiq.app quedan como versión histórica", () => {
  const cases = [["privacy.html", "https://moyiq.app/privacy", "La política vigente está en"], ["terms.html", "https://moyiq.app/terms", "Los términos vigentes están en"]];
  for (const [f, current, lead] of cases) {
    it(`${f}: aviso visible arriba, noindex y enlaces a moyiq.app`, () => {
      const s = read(f);
      expect(s).toContain('<meta name="robots" content="noindex, follow"/>');
      const body = s.slice(s.indexOf("<main"));
      const aviso = body.indexOf("Versión histórica de cuando Inversiones era un producto aparte (MOY IQ Invest).");
      expect(aviso, f).toBeGreaterThan(-1);
      expect(aviso, `${f}: el aviso va antes del título`).toBeLessThan(body.indexOf("<h1>"));
      expect(body).toContain(`${lead} <a href="${current}">`);
      expect(s).toContain('href="https://moyiq.app/inversiones"');
      for (const dead of ['href="/"', 'href="/faq.html"', 'href="/app"', 'href="/docs/novedades.html"']) expect(s, `${f}: ${dead}`).not.toContain(dead);
    });
  }
  it("datos-y-licencias.html sigue indexable y ya no enlaza a páginas redirigidas", () => {
    const s = read("datos-y-licencias.html");
    expect(s).not.toMatch(/name="robots" content="noindex/);
    for (const dead of ['href="/"', 'href="/faq.html"', 'href="/app"', 'href="/docs/novedades.html"']) expect(s, dead).not.toContain(dead);
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
