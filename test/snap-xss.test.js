// REC-N1: el link compartido ?snap= de estado-mercado.html es contenido no confiable.
// Ejecuta el script de la página con un DOM mínimo y revisa lo que termina en innerHTML.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const page = readFileSync(resolve(__dirname, '../estado-mercado.html'), 'utf8');
const script = page.slice(page.lastIndexOf('<script>') + 8, page.lastIndexOf('</script>'));

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function run(search) {
  const els = {};
  const el = (id) => (els[id] ||= { id, innerHTML: '', textContent: '', style: {}, classList: { add() {}, remove() {} }, addEventListener() {} });
  let fetched = 0;
  const win = { location: { search, pathname: '/estado-mercado.html', href: 'https://invest.moyiq.app/estado-mercado.html' + search } };
  const fetchStub = () => { fetched++; return new Promise(() => {}); };
  const atob = (s) => Buffer.from(s, 'base64').toString('binary');
  const btoa = (s) => Buffer.from(s, 'binary').toString('base64');
  new Function('window', 'document', 'fetch', 'atob', 'btoa', 'navigator', 'URL', 'URLSearchParams', script)(
    win, { getElementById: el }, fetchStub, atob, btoa, {}, URL, URLSearchParams);
  const html = Object.values(els).map((e) => e.innerHTML + '\n' + e.textContent).join('\n');
  return { els, html, fetched };
}

const PAYLOADS = ['<img src=x onerror=window.__pwned=1>', '"><svg/onload=window.__pwned=1>', 'javascript:window.__pwned=1'];
const RAW = /<img|<svg|onerror|onload|javascript:/i;

describe('estado-mercado ?snap= (REC-N1)', () => {
  for (const p of PAYLOADS) {
    it('no inserta HTML desde el precio, el cambio, la etiqueta ni el tipo de cambio: ' + p.slice(0, 12), () => {
      const snap = {
        t: Date.now(),
        items: [
          { s: '^GSPC', l: p, p: p, c: p },
          { s: p, l: p, p: 1, c: 1 },
          { s: '^VIX', l: 'VIX', p: p, c: 0 },
        ],
        fx: { CLP: p, MXN: p, [p]: p },
        fs: { CLP: p, MXN: 'yahoo' },
      };
      const { html } = run('?snap=' + b64url(snap));
      expect(html).not.toMatch(RAW);
    });
  }

  it('un t que no es número no rompe el banner ni inyecta', () => {
    const { html } = run('?snap=' + b64url({ t: PAYLOADS[0], items: [], fx: {}, fs: {} }));
    expect(html).not.toMatch(RAW);
  });

  it('un snap legítimo se sigue viendo con sus cifras', () => {
    const snap = {
      t: Date.UTC(2026, 9, 19, 15, 0),
      items: [
        { s: '^GSPC', l: 'S&P 500', p: 5800.12, c: 0.42 },
        { s: '^VIX', l: 'VIX', p: 14.3, c: -1.1 },
      ],
      fx: { CLP: 950.1, MXN: 18.2 },
      fs: { CLP: 'mindicador', MXN: 'yahoo' },
    };
    const { els, fetched } = run('?snap=' + b64url(snap));
    expect(fetched).toBe(0);
    expect(els.grid.innerHTML).toContain('S&amp;P 500');
    expect(els.grid.innerHTML).toMatch(/5\.800/);
    expect(els.grid.innerHTML).toContain('+0,42 %');
    expect(els.fxGrid.innerHTML).toMatch(/950,10/);
    expect(els.fxGrid.innerHTML).toContain('mindicador.cl');
    expect(els.vixVal.textContent).toBe('14,3');
    expect(els.snapBanner.innerHTML).toContain('estado compartido');
  });

  it('un snap que no es un objeto vuelve al estado en vivo', () => {
    expect(run('?snap=' + b64url(PAYLOADS[0])).fetched).toBe(2);
    expect(run('?snap=' + b64url([1, 2])).fetched).toBe(2);
  });
});
