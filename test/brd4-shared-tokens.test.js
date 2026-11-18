// BRD-4: Invest usa una sola paleta, la de /tokens-v3.css (moyiq v3.1). Cada página la carga antes de
// su <style> y no redefine los primitivos; solo agrega nombres propios de Invest que apuntan a la paleta.
//
// 18-nov-2026: Invest pasa a la paleta violeta (revierte D9, que la había congelado en Navy/Latón en
// /tokens-v2.css). /tokens-v3.css es una COPIA LITERAL de financeos-app/src/styles/tokens.css con un
// comentario de 5 líneas arriba. La igualdad se comprueba de dos maneras:
//   1. siempre: el cuerpo (todo menos las 5 líneas de cabecera) tiene el SHA-256 de APP_TOKENS_SHA256.
//      invest-web no tiene CI y Vercel no corre tests: el hash hace que la comprobación valga también
//      fuera de la Mac de Walter, donde no está el repo hermano.
//   2. si el repo hermano está en el disco (../financeos-app, como en el árbol de trabajo principal),
//      el cuerpo es idéntico al archivo de la app.
// Para resincronizar cuando cambie la app:
//   { head -n 5 tokens-v3.css; cat ../financeos-app/src/styles/tokens.css; } > t && mv t tokens-v3.css
//   tail -n +6 tokens-v3.css | shasum -a 256      → pegar el resultado en APP_TOKENS_SHA256
// y subir ?v=N en el <link> de las 9 páginas y CACHE en sw.js (el SW sirve el CSS con caché primero).
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const PAGES = ["app/index.html", "index.html", "faq.html", "estado-mercado.html", "perfil-inversor.html",
  "privacy.html", "terms.html", "datos-y-licencias.html", "docs/novedades.html"];
const TOKENS = read("tokens-v3.css");
const HEADER_LINES = 5;
const BODY = TOKENS.split("\n").slice(HEADER_LINES).join("\n");
const APP_TOKENS_SHA256 = "38dfcda730dbd641b459601f3d924a260799a49c021e4d1d044d5d7f6d271f6d";
const APP_TOKENS = fileURLToPath(new URL("../../financeos-app/src/styles/tokens.css", import.meta.url));

const TOKEN_DEF = /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g;
const PALETTE = new Set([...TOKENS.matchAll(TOKEN_DEF)].map((m) => m[2].toUpperCase()));
// Primitivos de tokens-v3.css (capa 1): ninguna página los redefine.
const PRIMITIVES = (() => {
  const a = TOKENS.indexOf("1. PRIMITIVOS ═"), b = TOKENS.indexOf("2. SEMÁNTICOS · CLARO");
  return [...new Set([...TOKENS.slice(a, b).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))];
})();
// Semánticos y de componente (capas 2 y 3): una página puede leerlos, no pisarlos.
const SEMANTICS = (() => {
  const a = TOKENS.indexOf("2. SEMÁNTICOS · CLARO"), b = TOKENS.indexOf("COMPATIBILIDAD (Entrega 1");
  return [...new Set([...TOKENS.slice(a, b).matchAll(/^\s*(--(?:color|text|on-grad|chart|cat|btn|field|card|hero|action|tabbar|logo|meter|focus)[\w-]*)\s*:/gm)].map((m) => m[1]))];
})();

// Tonos propios de Invest fuera de la paleta, cada uno con su motivo. Con v3.1 no queda ninguno:
// los roles propios (franja oscura, CTA lima, barra lateral, series del Comparador) apuntan a
// primitivos o semánticos de /tokens-v3.css. Un hex nuevo se agrega acá con su razón.
const INVEST_ONLY = {};
// Hex sueltos permitidos fuera de definiciones: theme-color de las páginas públicas (= morado 900 de la
// franja del nav, como moyiq.app) y los respaldos de color en JS (todos de la paleta v3).
const APP_SHA = createHash("sha256").update(BODY).digest("hex");

describe("BRD-4: paleta v3.1 compartida con la app (/tokens-v3.css)", () => {
  it("tokens-v3.css es copia literal de la app (hash del cuerpo)", () => {
    expect(TOKENS.split("\n")[0]).toContain("COPIA LITERAL de financeos-app/src/styles/tokens.css");
    expect(BODY).toContain("tokens de diseño de moyiq v3.1");
    expect(BODY).toContain("--purple-700: #3C2282;");
    expect(APP_SHA, "tokens-v3.css cambió: copiar de nuevo desde la app y actualizar APP_TOKENS_SHA256").toBe(APP_TOKENS_SHA256);
  });

  it.runIf(existsSync(APP_TOKENS))("si el repo de la app está al lado, el cuerpo es idéntico a su tokens.css", () => {
    expect(BODY).toBe(readFileSync(APP_TOKENS, "utf8"));
  });

  it("ya no existen /tokens.css ni /tokens-v2.css (la paleta Navy/Latón se retiró)", () => {
    expect(() => read("tokens.css")).toThrow();
    expect(() => read("tokens-v2.css")).toThrow();
  });

  it.each(PAGES)("%s carga /tokens-v3.css versionado antes de su primer <style>", (f) => {
    const s = read(f);
    const link = s.search(/<link rel="stylesheet" href="\/tokens-v3\.css\?v=\d+"\/>/);
    expect(link).toBeGreaterThan(-1);
    expect(link).toBeLessThan(s.indexOf("<style>"));
    expect(s).not.toMatch(/href="\/tokens(-v2)?\.css/);
  });

  it.each(PAGES)("%s no redefine primitivos ni semánticos v3 y no define hex fuera de la paleta", (f) => {
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const p of [...PRIMITIVES, ...SEMANTICS]) {
      expect(s, `${f} redefine ${p}`).not.toMatch(new RegExp("[{;\\s]" + p.replace(/-/g, "\\-") + "\\s*:"));
    }
    const off = [...s.matchAll(TOKEN_DEF)].map((m) => m[2].toUpperCase())
      .filter((h) => !PALETTE.has(h) && !INVEST_ONLY[h]);
    expect(off).toEqual([]);
  });

  it("la lista de primitivos y semánticos se leyó del archivo (la guarda no está vacía)", () => {
    expect(PRIMITIVES).toEqual(expect.arrayContaining(["--purple-700", "--lime-400", "--gray-900", "--gr-impulso"]));
    expect(SEMANTICS).toEqual(expect.arrayContaining(["--color-bg", "--text-primary", "--color-action", "--chart-net"]));
  });

  it("el modo oscuro es el grafito de la app: Invest no define superficies oscuras propias", () => {
    const app = read("app/index.html");
    const dark = app.slice(app.indexOf("/* ── DARK MODE ── */"), app.indexOf("/* ── RESET"));
    expect(dark).not.toMatch(/--(bg|card\d?|bg2):\s*#/);
    expect(dark).not.toMatch(/#0E1628|#14213D/i);
    const light = app.slice(app.indexOf("/* ── TOKENS ── */"), app.indexOf("/* ── DARK MODE ── */"));
    expect(light).toMatch(/--bg:\s+var\(--color-bg\);/);
    expect(light).toMatch(/--card:\s+var\(--color-surface-raised\);/);
    expect(app).toContain("dark?'#1C1D21':'#3C2282'");
  });

  it("el service worker guarda /tokens-v3.css y su CACHE subió para soltar la marca vieja", () => {
    const sw = read("sw.js");
    expect(sw).toContain("path === '/tokens-v3.css'");
    expect(sw).not.toContain("tokens-v2");
    expect(sw).toMatch(/const CACHE = 'moyiq-invest-v(\d+)'/);
    expect(+sw.match(/moyiq-invest-v(\d+)/)[1]).toBeGreaterThanOrEqual(13);
  });
});
