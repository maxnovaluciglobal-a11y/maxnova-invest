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
  it('la barra lateral oscura usa la superficie (grafito), no un color de marca', () => {
    const dark = css.slice(css.indexOf('[data-theme="dark"] {\n  /* Oscuro (grafito, D6): la barra'));
    const block = dark.slice(0, dark.indexOf('}'));
    expect(block).toContain('--side-bg: var(--card);');
    expect(block).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });
  it('en claro la barra va en la franja de marca (morado 800) con lima para "dónde estás"', () => {
    expect(css).toMatch(/--side-bg: var\(--color-brand-solid\);/);
    expect(css).toMatch(/--side-mark: var\(--color-accent\);/);
  });
});

describe('matriz de correlación', () => {
  it('sin rojo/amarillo/verde de estado: una sola escala de marca', () => {
    const c = fn('corrColor');
    expect(c).not.toMatch(/239,68,68|234,179,8|34,197,94|--neg|--red|--amber/);
    expect(c).toContain('var(--blue)');
  });
});

describe('tanda Hoy, Aportes y tema (oct-2026)', () => {
  const tokBlock = css.slice(css.indexOf('/* ── TOKENS ── */'), css.indexOf('/* ── RESET'));
  it('pérdida y superficies por semántico v3: el oscuro (grafito) sale de /tokens-v3.css (BRD-4)', () => {
    expect(tokBlock).toContain('--neg:       var(--color-over-text);');
    expect(tokBlock).toContain('--red:       var(--color-over-text);');
    expect(tokBlock).toContain('--bg:        var(--color-bg);');
    expect(tokBlock).toContain('--card:      var(--color-surface-raised);');
    expect(tokBlock).toContain('--card2:     var(--color-fill);');
    expect(tokBlock).not.toMatch(/#C96856|#E59580|#0E1628/);
  });
  it('botón de tema en la franja, con aria-pressed, entre frescura y cuenta', () => {
    const tb = fn('renderTopbar');
    const iFresh = tb.indexOf('tb-fresh'), iTheme = tb.indexOf('id="tb-theme"'), iAcct = tb.indexOf('class="acct"');
    expect(iTheme).toBeGreaterThan(iFresh);
    expect(iAcct).toBeGreaterThan(iTheme);
    expect(tb).toMatch(/aria-label="Tema oscuro" aria-pressed=/);
    expect(fn('updateThemeBtn')).toContain("setAttribute('aria-pressed'");
  });
  it('sin elección guardada sigue al sistema y escucha sus cambios', () => {
    expect(fn('applyTheme')).toMatch(/t\?t==='dark':themeSystemDark\(\)/);
    expect(fn('initTheme')).toContain("prefers-color-scheme: dark");
    expect(fn('initTheme')).toContain('if(!themeStored())');
    expect(fn('setThemeMode')).toContain("removeItem('mv_theme')");
    expect(fn('themeChanged')).toContain('renderDrawerBody()');
    expect(fn('applyTheme')).toContain('meta-theme');
  });
  it('Hoy en una fila solo desde 1200 px', () => {
    expect(css).toMatch(/@media \(min-width: 1200px\) \{\s*\.hoy-top \{ grid-template-columns: minmax\(0, 1\.3fr\) minmax\(0, 1fr\) minmax\(0, 1fr\);/);
    expect(css).not.toMatch(/\.hoy-top \{ display: grid; grid-template-columns: minmax\(0, 1\.3fr\)/);
    expect(fn('renderDash')).toContain('<div class="hoy-top">');
  });
  it('Aportes: un solo formulario con el monto, los tickers y Calcular', () => {
    const cap = fn('renderCapital');
    expect((cap.match(/'<form /g) || []).length).toBe(1);
    const f = cap.slice(cap.indexOf("'<form "), cap.indexOf("'</form>'"));
    expect(f).toContain('id="cap-monthly"');
    expect(f).toContain('cap-tks');
    expect(f).toContain('Calcular el reparto');
    expect(f).toContain('type="submit"');
    expect(f).toContain('<details class="capx-opt"');
  });
});
