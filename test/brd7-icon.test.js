// BRD-7: el diferenciador del ícono de Invest es la aguja en Latón (#B8863B sobre Navy,
// #8A6329 sobre fondo claro), nunca verde. Los PNG se regeneran con tools/icons/build.sh
// desde icon.svg y tools/icons/icon-maskable.svg; el maskable deja el dial dentro de la
// zona segura (círculo de radio 40 % del lado).
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

const NAVY = [20, 33, 61];
const PNGS = ["icon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-192.png", "icon-maskable-512.png"];

describe("BRD-7: ícono de Invest con aguja en Latón", () => {
  it.each(PNGS)("%s: fondo Navy, ningún píxel verde y la aguja en Latón", (f) => {
    const img = decodePng(buf(f));
    expect(img.at(0, 0)).toEqual(NAVY);
    let green = 0, brass = 0;
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const [r, g, b] = img.at(x, y);
      if (g > r + 25 && g > b + 10) green++;
      if (Math.abs(r - 184) < 12 && Math.abs(g - 134) < 12 && Math.abs(b - 59) < 12) brass++;
    }
    expect(green).toBe(0);
    expect(brass).toBeGreaterThan(0);
  });

  it.each(["icon-maskable-192.png", "icon-maskable-512.png"])("%s: todo el dial queda dentro de la zona segura", (f) => {
    const img = decodePng(buf(f));
    const c = img.w / 2, safe = 0.4 * img.w;
    let far = 0;
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const d = img.at(x, y).reduce((s, v, i) => s + Math.abs(v - NAVY[i]), 0);
      if (d > 30 && Math.hypot(x + 0.5 - c, y + 0.5 - c) > safe * 0.9) far++;
    }
    expect(far).toBe(0);
  });

  it("los SVG llevan la aguja en Latón y el manifest separa any y maskable", () => {
    for (const f of ["icon.svg", "favicon.svg", "tools/icons/icon-maskable.svg"]) {
      const s = read(f);
      expect(s, f).toMatch(/L 72\.52 37 L 48 46\.54 Z" fill="#B8863B"/);
      expect(s, f).not.toMatch(/#5FA98C|#356E57|#74C2A3/i);
    }
    const m = JSON.parse(read("manifest.webmanifest"));
    const mask = m.icons.filter((i) => i.purpose === "maskable").map((i) => i.src);
    expect(mask).toEqual(["/icon-maskable-192.png", "/icon-maskable-512.png"]);
    for (const i of m.icons) if (i.purpose === "any") expect(i.src).not.toMatch(/maskable/);
  });

  it("en las páginas, la aguja del logotipo es Latón base sobre Navy y Latón 700 sobre fondo claro", () => {
    for (const f of ["index.html", "faq.html", "estado-mercado.html", "perfil-inversor.html", "privacy.html", "terms.html", "datos-y-licencias.html", "docs/novedades.html"]) {
      const s = read(f);
      expect(s.match(/style="fill:var\(--needle,#B8863B\)"/g), f).toHaveLength(2);
      expect(s, f).toContain(".lockup:not(.on-dark) .dial{--needle:var(--laton-700)}");
    }
  });
});
