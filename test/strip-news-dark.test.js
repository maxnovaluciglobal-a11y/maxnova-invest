// Guardas de la tanda "cinta, noticias con foto y modo oscuro" (oct-2026).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(__dirname, '../app/index.html'), 'utf8');
const css = html.slice(0, html.indexOf('</style>'));
const stripJs = html.slice(html.indexOf('// ── CINTA DE MERCADO (oct-2026)'), html.indexOf('// ── MERCADO (reestructura v3, fase 4)'));
const fn = (name) => { const i = html.indexOf('function ' + name + '('); return html.slice(i, html.indexOf('\nfunction ', i + 10)); };

describe('cinta de mercado', () => {
  it('existe bajo la franja del buscador en el marco (todas las páginas de escritorio)', () => {
    const top = html.indexOf('<header class="topbar" id="topbar"></header>');
    const strip = html.indexOf('<div class="mstrip-wrap" id="mstrip"></div>');
    expect(top).toBeGreaterThan(0);
    expect(strip).toBeGreaterThan(top);
    expect(strip).toBeLessThan(html.indexOf('<main class="main" id="main">'));
    expect(fn('renderMain')).toContain('stripEnsure()');
  });
  it('se ve en escritorio y, en el móvil, solo arriba de Hoy y Mercado', () => {
    expect(css).toMatch(/@media \(min-width: 1024px\) \{\s*body:not\(\.no-auth\) \.mstrip-wrap \{ display:block;/);
    expect(css).toMatch(/\.mstrip-wrap \{ display:none; \}/);
    expect(fn('renderDash')).toContain('mstrip-in');
    expect(fn('renderMercado')).toContain('mstrip-in');
    const others = ['renderPort', 'renderWatch', 'renderPBBody', 'renderCapital', 'renderBitacora'];
    for (const o of others) expect(fn(o)).not.toContain('mstrip-in');
  });
  it('no se anima ni se desplaza sola', () => {
    const stripCss = css.slice(css.indexOf('/* ── CINTA DE MERCADO'), css.indexOf('/* Noticias con foto'));
    expect(stripCss.length).toBeGreaterThan(100);
    expect(stripCss).not.toMatch(/animation|@keyframes|marquee/);
    expect(stripJs).not.toMatch(/setInterval|requestAnimationFrame|scrollBy|scrollLeft\s*\+=/);
    expect(stripCss).toMatch(/scroll-snap-type/);
  });
  it('alto fijo (sin salto de contenido) y historia una vez por sesión', () => {
    expect(css).toMatch(/\.mstrip \{ position:relative; height:36px; \}/);
    expect(stripJs).toContain('STRIP.spark[sym]');
    expect(stripJs).toMatch(/!STRIP\.spark\[s\]&&!STRIP\.failed\[s\]&&!STRIP\.loading\[s\]/);
  });
});

describe('noticias con foto', () => {
  const news = fn('mktNewsHtml');
  it('miniatura liviana y sin filtrar el origen', () => {
    for (const a of ['loading="lazy"', 'decoding="async"', 'referrerpolicy="no-referrer"', 'alt=""', 'onerror="this.remove()"', 'width="72"', 'height="54"']) {
      expect(news).toContain(a);
    }
  });
  it('sin imagen no hay hueco', () => {
    expect(news).toMatch(/var img=n\.image&&/);
    expect(news).toContain(":'';");
  });
});

describe('modo oscuro en dos niveles', () => {
  it('la barra lateral oscura usa la superficie, no Navy', () => {
    const dark = css.slice(css.indexOf('[data-theme="dark"] {\n  /* Dos niveles'));
    const block = dark.slice(0, dark.indexOf('}'));
    expect(block).toContain('--side-bg: var(--card);');
    expect(block).not.toContain('#14213D');
  });
  it('en claro la barra sigue en Navy', () => {
    expect(css).toMatch(/:root \{\s*--side-w: 232px;\s*--side-wc: 64px;\s*--side-bg: #14213D;/);
  });
});

describe('matriz de correlación', () => {
  it('sin rojo/amarillo/verde de estado: una escala Navy/pizarra', () => {
    const c = fn('corrColor');
    expect(c).not.toMatch(/239,68,68|234,179,8|34,197,94|--neg|--red|--amber/);
    expect(c).toContain('var(--blue)');
  });
});
