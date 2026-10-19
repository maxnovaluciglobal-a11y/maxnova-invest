// A11Y-2 / A11Y-12 (auditoría 360): el texto de aviso y los pares del modo oscuro tienen que
// llegar a 4,5:1 (WCAG 1.4.3) en todas las superficies, incluidos los estados elevados.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(__dirname, '../app/index.html'), 'utf8');
const lightBlock = html.slice(0, html.indexOf('/* ── DARK MODE ── */'));
const darkBlock = html.slice(html.indexOf('[data-theme="dark"] {\n  --grn:'), html.indexOf('/* ── RESET'));
const tok = (block, name) => {
  const m = block.match(new RegExp('--' + name + ':\\s*(#[0-9A-Fa-f]{6})'));
  if (!m) throw new Error('token ' + name);
  return m[1];
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
  it('oscuro: texto secundario, pérdida y aviso llegan a 4,5:1 en el fondo y en card..card4', () => {
    for (const t of ['text2', 'red', 'neg', 'orange']) {
      for (const s of ['bg', 'card', 'card2', 'card3', 'card4']) {
        expect(ratio(tok(darkBlock, t), tok(darkBlock, s)), `${t} sobre ${s}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
