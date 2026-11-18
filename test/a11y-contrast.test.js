// A11Y-2 / A11Y-12 (auditoría 360) y rebrand v3.1 (18-nov-2026): todo par de texto que introduce Invest
// llega a 4,5:1 (WCAG 1.4.3) y las marcas de interfaz a 3:1 (1.4.11), en claro y en oscuro, incluidos los
// estados elevados. Los tokens se resuelven como el navegador: primero el bloque de Invest, después
// /tokens-v3.css (claro: :root y [data-theme="light"]; oscuro: además [data-theme="dark"]).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (f) => readFileSync(resolve(__dirname, '..', f), 'utf8');
const html = read('app/index.html');
const tokensCss = read('tokens-v3.css').replace(/\/\*[\s\S]*?\*\//g, '');

// Declaraciones de un bloque CSS por selector (sin @media: la escala de escritorio no tiene colores).
function blocks(css) {
  const out = [];
  const flat = css.replace(/@media[^{]*\{([\s\S]*?\})\s*\}/g, '').replace(/@supports[^{]*\{[\s\S]*?\}\s*\}/g, '');
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decl = {};
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) decl[d[1]] = d[2].trim();
    out.push({ sel: m[1].trim(), decl });
  }
  return out;
}
function themeMap(css, dark) {
  const map = {};
  for (const b of blocks(css)) {
    const light = /:root|\[data-theme="light"\]/.test(b.sel);
    const isDark = /\[data-theme="dark"\]/.test(b.sel);
    if (light || (dark && isDark)) Object.assign(map, b.decl);
  }
  return map;
}
const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');
const APP = { light: { ...themeMap(tokensCss, false), ...themeMap(style, false) }, dark: { ...themeMap(tokensCss, true), ...themeMap(style, true) } };
// En oscuro, un :root de Invest que viene DESPUÉS de [data-theme="dark"] de tokens-v3 gana (misma especificidad).
const pub = (f) => {
  const s = read(f), st = s.slice(s.indexOf('<style>'), s.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');
  return { ...themeMap(tokensCss, false), ...themeMap(st, false) };
};

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (a) => '#' + a.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const blend = (fg, alpha, bg) => hex(rgb(fg).map((v, i) => alpha * v + (1 - alpha) * rgb(bg)[i]));
const lum = (h) => {
  const c = rgb(h).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

// Color opaco de un token; un color translúcido se compone sobre `base` (hex).
function color(map, name, base) {
  let v = map[name];
  if (!v) throw new Error('token ' + name);
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) return color(map, ref[1], base);
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v.toUpperCase();
  const m = v.match(/^rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)\s*(?:[/,]\s*([\d.]+))?\)$/);
  if (!m) throw new Error('token ' + name + ' = ' + v);
  const fg = hex([+m[1], +m[2], +m[3]]);
  const a = m[4] == null ? 1 : +m[4];
  if (a === 1) return fg;
  if (!base) throw new Error('token ' + name + ' es translúcido: falta el fondo');
  return blend(fg, a, base);
}

describe('app: contraste de los tokens en claro y oscuro', () => {
  for (const theme of ['light', 'dark']) {
    const T = APP[theme];
    const bg = color(T, '--bg'), card = color(T, '--card', bg);
    const surfaces = { bg, card, card2: color(T, '--card2', card), card3: color(T, '--card3', card) };

    it(`${theme}: texto secundario, marca, ganancia, pérdida y aviso llegan a 4,5:1 en bg y card..card3`, () => {
      for (const t of ['--text', '--text2', '--bright', '--grn', '--pos', '--neg', '--red', '--orange', '--amber']) {
        for (const [s, sv] of Object.entries(surfaces)) {
          expect(ratio(color(T, t, sv), sv), `${theme} ${t} sobre ${s}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
    it(`${theme}: el aviso, la pérdida y la ganancia sobre su propio tinte llegan a 4,5:1`, () => {
      for (const [fg, tint] of [['--orange', '--orange-bg'], ['--red', '--red-bg'], ['--pos', '--color-income-bg'], ['--grn', '--grn-bg']]) {
        for (const [s, sv] of Object.entries(surfaces)) {
          const b = color(T, tint, sv);
          expect(ratio(color(T, fg, b), b), `${theme} ${fg} sobre ${tint} en ${s}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
    it(`${theme}: acción sólida, etiqueta "Ejemplo" y anillo de foco`, () => {
      expect(ratio(color(T, '--grn-solid-fg'), color(T, '--grn-solid'))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(color(T, '--text-on-accent'), color(T, '--color-accent'))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(color(T, '--color-focus'), bg)).toBeGreaterThanOrEqual(3);
      expect(ratio(color(T, '--tabbar-pill'), bg)).toBeGreaterThanOrEqual(3);
      expect(ratio(color(T, '--border3'), bg)).toBeGreaterThanOrEqual(3);
    });
    it(`${theme}: barra lateral (texto, "dónde estás", ganancia y pérdida) llega a 4,5:1`, () => {
      const side = color(T, '--side-bg', bg);
      const act = color(T, '--side-act', side);
      for (const t of ['--side-fg', '--side-fg-strong', '--side-mark', '--side-pos', '--side-neg']) {
        expect(ratio(color(T, t, side), side), `${theme} ${t}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(ratio(color(T, '--side-fg-strong', act), act)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${theme}: series de gráfico y medias a 3:1 sobre la ficha (1.4.11)`, () => {
      for (const t of ['--chart-net', '--chart-ma', '--color-income', '--color-over', '--cmp2', '--cmp3', '--cmp4']) {
        expect(ratio(color(T, t, card), card), `${theme} ${t}`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('card4 (veladura) solo se usa sin texto encima: esqueletos, brillo de carga y pista de rango', () => {
    const lines = html.split('\n').filter((l) => l.includes('var(--card4)')).map((l) => l.trim());
    expect(lines).toHaveLength(4);
    for (const l of lines) {
      expect(l).toMatch(/^(\.spark-sk \{|\.mstrip-sk \{|\.li-range \{|background: linear-gradient\(90deg, var\(--card3\) 25%, var\(--card4\) 50%)/);
    }
  });
});

describe('páginas públicas: franjas oscuras, héroe Impulso y CTA lima', () => {
  const PAGES = ['index.html', 'faq.html', 'estado-mercado.html', 'perfil-inversor.html', 'privacy.html', 'terms.html', 'datos-y-licencias.html', 'docs/novedades.html'];
  it.each(PAGES)('%s: texto sobre la franja (morado 900) y CTA lima con tinta', (f) => {
    const T = pub(f);
    const deep = color(T, '--deep');
    for (const t of ['--on-deep', '--on-deep-2', '--on-deep-accent', '--on-deep-pos']) {
      expect(ratio(color(T, t, deep), deep), `${f} ${t}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(color(T, '--cta-fg'), color(T, '--cta-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(T['--cta-fg']).not.toMatch(/gray-0|FFF/i);
    const body = color(T, '--color-bg'), surf = color(T, '--color-surface');
    for (const t of ['--text', '--text2', '--accent-text']) {
      for (const s of [body, surf]) expect(ratio(color(T, t), s), `${f} ${t}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('sobre los degradados: blanco 78 % en Profundidad, blanco 92 % y lima en todo Impulso', () => {
    const T = pub('index.html');
    for (const stop of ['--profundidad-0', '--profundidad-100']) {
      const b = color(T, stop);
      expect(ratio(color(T, '--on-deep-2', b), b), stop).toBeGreaterThanOrEqual(4.5);
      expect(ratio(color(T, '--on-deep-accent'), b), stop).toBeGreaterThanOrEqual(4.5);
    }
    for (const stop of ['--impulso-0', '--impulso-59', '--impulso-100']) {
      const b = color(T, stop);
      expect(ratio(color(T, '--on-grad-text-2', b), b), stop).toBeGreaterThanOrEqual(4.5);
      expect(ratio('#FFFFFF', b), stop).toBeGreaterThanOrEqual(4.5);
      expect(ratio(color(T, '--lime-400'), b), stop).toBeGreaterThanOrEqual(3);   // lima: solo texto grande
    }
    const idx = read('index.html');
    expect(idx).toMatch(/\.hero\.dk\{background:var\(--gr-impulso\);--on-deep-2:var\(--on-grad-text-2\)\}/);
  });
});
