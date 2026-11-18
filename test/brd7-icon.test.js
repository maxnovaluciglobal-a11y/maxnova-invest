// BRD-7 → rebrand Entrega 1 (17-nov-2026): el ícono de Inversiones de moyiq es el oficial de la
// marca nueva, la lupa (isotipo) blanca al 44 % del lado sobre morado #3C2282, centrada ópticamente.
// Antes era el dial Navy con aguja en Latón. Los archivos se copian del set de
// financeos-workspace/branding/rebrand-2026-11/iconos-app/ con tools/icons/build.sh; el maskable
// deja la lupa dentro de la zona segura (círculo de radio 40 % del lado).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const buf = (f) => readFileSync(new URL("../" + f, import.meta.url));
const read = (f) => buf(f).toString("utf8");

// Decodificador mínimo de PNG RGB/RGBA de 8 bits sin entrelazado.
function decodePng(b) {
  let p = 8, w, h, ct, idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString("ascii", p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; expect(d[8]).toBe(8); expect(d[12]).toBe(0); }
    if (type === "IDAT") idat.push(d);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp, raw = inflateSync(Buffer.concat(idat)), px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, up = y ? px[(y - 1) * stride + x] : 0, c = y && x >= bpp ? px[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, at: (x, y) => [0, 1, 2].map((i) => px[y * stride + x * bpp + i]) };
}

const MORADO = [60, 34, 130];
const PNGS = [["icon-32.png", 32], ["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512],
  ["icon-maskable-192.png", 192], ["icon-maskable-512.png", 512]];
const near = (a, b, t = 30) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) <= t;

describe("Ícono de Inversiones de moyiq (lupa sobre morado)", () => {
  it.each(PNGS)("%s: tamaño exacto, fondo morado, lupa blanca, sin Navy, Latón ni verde", (f, size) => {
    const img = decodePng(buf(f));
    expect([img.w, img.h]).toEqual([size, size]);
    expect(near(img.at(0, 0), MORADO, 6)).toBe(true);
    let white = 0, old = 0, green = 0;
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const px = img.at(x, y), [r, g, b] = px;
      if (r > 245 && g > 245 && b > 245) white++;
      if (near(px, [20, 33, 61], 12) || near(px, [184, 134, 59], 24)) old++;
      if (g > r + 25 && g > b + 10) green++;
    }
    expect(white).toBeGreaterThan(0);
    expect(old).toBe(0);
    expect(green).toBe(0);
  });

  it.each(["icon-maskable-192.png", "icon-maskable-512.png"])("%s: toda la lupa queda dentro de la zona segura", (f) => {
    const img = decodePng(buf(f));
    const c = img.w / 2, safe = 0.4 * img.w;
    let far = 0;
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      if (!near(img.at(x, y), MORADO) && Math.hypot(x + 0.5 - c, y + 0.5 - c) > safe * 0.9) far++;
    }
    expect(far).toBe(0);
  });

  it("los SVG son los de la marca nueva y el manifest separa any y maskable, con ?v= y el nombre nuevo", () => {
    for (const f of ["icon.svg", "favicon.svg"]) {
      const s = read(f);
      expect(s, f).toContain("#3C2282");
      expect(s, f).not.toMatch(/#B8863B|#14213D|#5FA98C|#356E57|#74C2A3/i);
    }
    expect(read("icon.svg")).toContain('aria-label="moyiq"');
    const m = JSON.parse(read("manifest.webmanifest"));
    expect(m.name).toBe("moyiq Inversiones");
    expect(m.short_name).toBe("Inversiones");
    const mask = m.icons.filter((i) => i.purpose === "maskable").map((i) => i.src);
    expect(mask).toEqual(["/icon-maskable-192.png?v=2", "/icon-maskable-512.png?v=2"]);
    for (const i of m.icons) {
      expect(i.src).toMatch(/\?v=\d+$/);
      if (i.purpose === "any") expect(i.src).not.toMatch(/maskable/);
    }
  });

  it("en las páginas, el logotipo es el SVG moyiq (currentColor), sin el dial ni la placa IQ", () => {
    for (const f of ["index.html", "faq.html", "estado-mercado.html", "perfil-inversor.html", "privacy.html", "terms.html", "datos-y-licencias.html", "docs/novedades.html"]) {
      const s = read(f);
      expect(s, f).toContain('<symbol id="moyiq" viewBox="87.94 136.94 547.16 189.52">');
      expect(s, f).toContain('<g fill="currentColor">');
      expect(s, f).toMatch(/class="lockup on-dark" aria-label="Inversiones de moyiq, inicio"><svg class="logo"[^>]*><use href="#moyiq"\/><\/svg><span class="suffix">Inversiones<\/span>/);
      expect(s, f).toContain(".lockup.on-dark{color:#FFFFFF}");
      expect(s, f).not.toMatch(/id="dial"|href="#dial"|class="iq"/);
    }
    const app = read("app/index.html");
    expect(app).toContain("const MOYIQ_LOGO='<svg class=\"moyiq-logo\"");
    expect(app).not.toMatch(/MOY IQ <b>Invest<\/b>/);
  });
});
