// A11Y-10 (parte Invest): el nombre accesible debe empezar por el texto
// visible (control por voz, WCAG 2.5.3). El logotipo decía "MOYIQInvest" en
// texto y "MOY IQ Invest, inicio" en aria-label; el botón de la contraseña
// mostraba "ver" con el nombre "Mostrar contraseña".
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const PAGES = ["index.html", "estado-mercado.html", "perfil-inversor.html", "faq.html", "privacy.html", "terms.html", "datos-y-licencias.html"];
const text = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

describe("A11Y-10: aria-label empieza por el texto visible", () => {
  it.each(PAGES)("%s: cada logotipo con aria-label", (f) => {
    const tags = [...read(f).matchAll(/<(a|span) [^>]*class="lockup[^"]*"[^>]*aria-label="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)];
    expect(tags.length).toBeGreaterThan(0);
    for (const [, , label, inner] of tags) expect(label.toLowerCase().startsWith(text(inner).toLowerCase()), label + " / " + text(inner)).toBe(true);
  });
  it("botón de la contraseña: el texto visible es el inicio del nombre", () => {
    const app = read("app/index.html");
    expect(app).not.toMatch(/aria-label="Mostrar contraseña"[^>]*>ver</);
    expect((app.match(/aria-label="Mostrar contraseña"[^>]*>mostrar</g) || []).length).toBe(2);
    expect(app).toContain("btn.textContent='mostrar'");
  });
});
