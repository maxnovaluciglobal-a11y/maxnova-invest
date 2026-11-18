// Rebrand Entrega 1 (D14, D18 mantenimiento, D19): las legales cambian con el despliegue de la marca.
// Términos 2.2 y privacidad 2.7 dicen el nombre nuevo, que el responsable y el tratamiento no cambian,
// y el texto preciso de dónde viven las posiciones. La fecha de vigencia es la del despliegue:
// `PREDEPLOY=1 npx vitest run test/legal-rebrand.test.js` falla mientras quede FECHA-DEL-DESPLIEGUE.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const NOTE = "MOY IQ Invest ahora es Inversiones de moyiq; el responsable y el tratamiento no cambian.";
const D19 = "Tus posiciones de inversión se guardan en nuestro servidor para traer precios y verlas en cualquier dispositivo.";

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

  it.runIf(process.env.PREDEPLOY)("antes de desplegar: no queda FECHA-DEL-DESPLIEGUE", () => {
    for (const f of ["terms.html", "privacy.html", "app/index.html"]) expect(read(f), f).not.toContain("FECHA-DEL-DESPLIEGUE");
  });
});
