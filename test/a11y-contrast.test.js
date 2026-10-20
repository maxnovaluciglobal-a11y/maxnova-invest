// A11Y-2 / A11Y-12 (auditoría 360): el texto de aviso y los pares del modo oscuro tienen que
// llegar a 4,5:1 (WCAG 1.4.3) en todas las superficies, incluidos los estados elevados.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(__dirname, '../app/index.html'), 'utf8');
const lightBlock = html.slice(0, html.indexOf('/* ── DARK MODE ── */'));
const darkBlock = html.slice(html.indexOf('[data-theme="dark"] {\n  --grn:'), html.indexOf('/* ── RESET'));
// Los tokens de Invest apuntan a /tokens.css (BRD-4): se resuelve var(--x) primero en el
// bloque de Invest y después en tokens.css (claro: :root; oscuro: [data-theme="dark"] sobre :root).
const tokensCss = readFileSync(resolve(__dirname, '../tokens.css'), 'utf8');
const tkLight = tokensCss.slice(0, tokensCss.indexOf('[data-theme="dark"]'));
const tkDark = tokensCss.slice(tokensCss.indexOf('[data-theme="dark"]'));
const rawOf = (block, name) => {
  const m = block.match(new RegExp('--' + name + ':\\s*([^;]+);'));
  return m ? m[1].replace(/\/\*.*?\*\//g, '').trim() : null;
};
const tok = (block, name, base) => {
  const dark = block === darkBlock;
  const chain = dark ? [darkBlock, lightBlock, tkDark, tkLight] : [lightBlock, tkLight];
  let v = null;
  for (const b of chain) { v = rawOf(b, name); if (v) break; }
  if (!v) throw new Error('token ' + name);
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  if (ref) return tok(block, ref[1], base);
  const rgba = v.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (rgba) {
    const fg = '#' + [1, 2, 3].map(i => (+rgba[i]).toString(16).padStart(2, '0')).join('');
    return blend(fg, +rgba[4], base || tok(block, 'card'));
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(v)) throw new Error('token ' + name + ' = ' + v);
  return v;
};
const rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => {
  const c = rgb(h).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const blend = (fg, alpha, bg) => '#' + rgb(fg).map((v, i) => Math.round(alpha * v + (1 - alpha) * rgb(bg)[i]).toString(16).padStart(2, '0')).join('');

describe('contraste de los tokens', () => {
  it('claro: el aviso (--orange) sobre su fondo tintado en card, card2 y card4 llega a 4,5:1', () => {
    const fg = tok(lightBlock, 'orange');
    for (const s of ['card', 'card2', 'card3', 'card4']) {
      const bg = blend('#C97A3D', 0.12, tok(lightBlock, s));
      expect(ratio(fg, bg), s).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('oscuro: texto secundario, pérdida y aviso llegan a 4,5:1 en el fondo y en card..card3', () => {
    for (const t of ['text2', 'red', 'neg', 'orange']) {
      for (const s of ['bg', 'card', 'card2', 'card3']) {
        expect(ratio(tok(darkBlock, t), tok(darkBlock, s)), `${t} sobre ${s}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('card4 (veladura en oscuro, BRD-4) solo se usa sin texto encima: esqueletos, brillo de carga y pista de rango', () => {
    const lines = html.split('\n').filter(l => l.includes('var(--card4)')).map(l => l.trim());
    expect(lines).toHaveLength(4);
    for (const l of lines) {
      expect(l).toMatch(/^(\.spark-sk \{|\.mstrip-sk \{|\.li-range \{|background: linear-gradient\(90deg, var\(--card3\) 25%, var\(--card4\) 50%)/);
    }
  });
});
