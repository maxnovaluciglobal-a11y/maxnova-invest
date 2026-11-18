// Rebrand Entrega 1 (D14, D18 mantenimiento, D19): las legales cambian con el despliegue de la marca.
// Términos 2.2 y privacidad 2.7 dicen el nombre nuevo, que el responsable y el tratamiento no cambian,
// y el texto preciso de dónde viven las posiciones. La fecha de vigencia es la del despliegue:
// Esa fecha vive en un solo lugar, tools/vigencia.json, y se fija con `node tools/set-vigencia.mjs AAAA-MM-DD`.
// En la rama main o con RELEASE=1, `npm test` falla mientras quede FECHA-DEL-DESPLIEGUE (B1, revisión 18-nov).
import { describe, it, expect } from "vitest";
import * as vig from "../tools/vigencia.mjs";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const NOTE = "MOY IQ Invest ahora es Inversiones de moyiq; el responsable y el tratamiento no cambian.";
const D19 = "Tus posiciones de inversión se guardan en nuestro servidor para que puedas verlas en cualquier dispositivo. Para traer precios solo se consultan los símbolos.";

describe("legales del rebrand", () => {
  it("términos 2.2 y privacidad 2.7 con la línea del cambio de nombre", () => {
    expect(read("terms.html")).toMatch(/Vigente desde: \S.* · Versión 2\.2/);
    expect(read("privacy.html")).toMatch(/Vigente desde: \S.* · Versión 2\.7/);
    for (const f of ["terms.html", "privacy.html"]) expect(read(f), f).toContain(NOTE);
  });

  it("privacidad dice dónde se guardan las posiciones (D19), en la política y en la app", () => {
    expect(read("privacy.html")).toContain(D19);
    expect(read("app/index.html")).toContain(D19);
  });

  it("el aviso 'no es bróker ni asesor' sigue en términos, landing y app, con el nombre nuevo", () => {
    expect(read("terms.html")).toContain("Inversiones de moyiq no ejecuta órdenes, no custodia dinero ni valores y no recomienda activos.");
    expect(read("app/index.html")).toContain("Inversiones de moyiq no es bróker ni asesor: no ejecuta operaciones ni custodia dinero.");
    expect(read("app/index.html")).toContain("Inversiones de moyiq no es un br\\u00f3ker");
  });

  it("cada <span data-vigencia> coincide con tools/vigencia.json", () => {
    const fecha = vig.leer();
    expect(fecha === null || vig.esFechaValida(fecha), `vigencia.json: ${fecha}`).toBe(true);
    for (const f of ["terms.html", "privacy.html", "app/index.html"]) expect(read(f), f).toMatch(new RegExp(vig.SPAN.source));
    for (const f of vig.publicados()) {
      for (const m of read(f).matchAll(vig.SPAN)) expect(m[0], f).toBe(vig.spanEsperado(fecha));
    }
  });

  it.skipIf(!vig.esPublicacion())("en main o con RELEASE=1: fecha fijada y ningún marcador FECHA-DEL-DESPLIEGUE", () => {
    expect(vig.leer(), "tools/vigencia.json sin fecha: node tools/set-vigencia.mjs AAAA-MM-DD").toBeTruthy();
    const quedan = vig.publicados().filter((f) => vig.MARCADORES.some((mk) => read(f).includes(mk)));
    expect(quedan).toEqual([]);
  });
});
