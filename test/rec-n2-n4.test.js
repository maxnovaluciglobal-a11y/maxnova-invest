// REC-N2 (links de noticias solo http/https), REC-N3 (fecha local al registrar una operación)
// y REC-N4 (borrar la cuenta no queda "Eliminando…" para siempre). Lee app/index.html y api/news.js.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withTimeout } from '../app/lib/async-guards.js';

const html = readFileSync(resolve(__dirname, '../app/index.html'), 'utf8');
const fnSrc = (name, async = false) => {
  const key = (async ? 'async function ' : 'function ') + name + '(';
  const a = html.indexOf(key);
  if (a < 0) throw new Error('no existe ' + name);
  const b = html.indexOf('\n', html.indexOf('\n}', a) + 1);
  return html.slice(a, b);
};
const fn = (name, ...deps) => new Function(...deps, fnSrc(name) + '\nreturn ' + name + ';');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

describe('REC-N2: links de noticias', () => {
  const safeLink = fn('safeLink')();
  it('solo deja pasar http y https', () => {
    expect(safeLink('https://finance.yahoo.com/news/x.html')).toBe('https://finance.yahoo.com/news/x.html');
    expect(safeLink('http://example.com/a')).toBe('http://example.com/a');
    for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<script>1</script>',
      'vbscript:x', 'file:///etc/passwd', '//evil.example/x', '/relativo', '', null, undefined]) {
      expect(safeLink(bad)).toBe('#');
    }
  });
  it('el panel de noticias de la ficha pasa los links por safeLink', () => {
    const LIVE_NEWS = [{ title: 'AAPL sube', link: 'java\tscript:window.__pwned=1', tickers: ['AAPL'], source: 'Y' },
      { title: 'AAPL baja', link: 'data:text/html,x', tickers: ['AAPL'], source: 'Y' }];
    const pane = new Function('LIVE_NEWS', 'esc', 'safeLink', fnSrc('drawerNewsPane') + '\nreturn drawerNewsPane;')(LIVE_NEWS, esc, safeLink);
    const out = pane('AAPL');
    expect(out).not.toMatch(/script:|data:/i);
    expect(out.match(/href="#"/g).length).toBe(2);
  });
  it('/api/news descarta links que no son http(s)', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ news: [
      { title: 'A', link: 'javascript:alert(1)', providerPublishTime: 1 },
      { title: 'B', link: 'https://finance.yahoo.com/b', providerPublishTime: 1 },
    ] }), { status: 200 }));
    try {
      vi.resetModules();
      const h = (await import('../api/news.js')).default;
      const body = await (await h(new Request('https://invest.moyiq.app/api/news?tickers=AAPL'))).json();
      expect(body.items.map((i) => i.link)).toEqual(['', 'https://finance.yahoo.com/b']);
    } finally { globalThis.fetch = realFetch; }
  });
});

describe('REC-N3: Registrar operación usa el día local', () => {
  const tz = process.env.TZ;
  afterEach(() => { process.env.TZ = tz; vi.useRealTimers(); });
  it('a las 22 h en Santiago sigue siendo hoy, no mañana (UTC)', () => {
    process.env.TZ = 'America/Santiago';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T01:30:00Z'));
    const localDay = fn('localDay')();
    expect(new Date().getHours()).toBe(22);
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-20');
    expect(localDay()).toBe('2026-10-19');
  });
  it('el formulario y el tipo de cambio de hoy no usan el día UTC', () => {
    expect(fnSrc('mTrade')).toContain('localDay()');
    expect(fnSrc('mTrade')).not.toContain('toISOString');
    const save = html.slice(html.indexOf('FIN-12: el tipo de cambio de hoy'), html.indexOf('FIN-12: el tipo de cambio de hoy') + 300);
    expect(save).toContain('date===localDay()');
    expect(save).not.toContain('toISOString');
  });
});

describe('REC-N4: borrar la cuenta con timeout', () => {
  afterEach(() => vi.useRealTimers());
  const setup = (sb, fetchImpl) => {
    const els = { 'da-btn': { disabled: false, textContent: '' }, 'da-err': { style: {}, textContent: '' } };
    const doc = { getElementById: (id) => els[id] };
    const daSync = () => { els['da-btn'].disabled = false; };
    const run = new Function('document', 'sb', 'fetch', 'withTimeout', 'S', 'stopBoot', 'window', 'daSync',
      fnSrc('confirmDeleteAccount', true).replace(/^async function/, 'return async function'))(
      doc, sb, fetchImpl, withTimeout, {}, () => {}, { location: {} }, daSync);
    return { els, run };
  };
  it('si getSession no responde, a los 8 s muestra el error y reactiva el botón', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    const { els, run } = setup({ auth: { getSession: () => new Promise(() => {}) } }, fetchSpy);
    const p = run();
    expect(els['da-btn'].textContent).toBe('Eliminando…');
    await vi.advanceTimersByTimeAsync(8000);
    await p;
    expect(els['da-err'].style.display).toBe('block');
    expect(els['da-err'].textContent).toMatch(/no respondió a tiempo/);
    expect(els['da-btn'].textContent).toBe('Eliminar mis datos de Invest');
    expect(els['da-btn'].disabled).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('el POST lleva señal de timeout y, si vence, el error es claro', async () => {
    let opts;
    const fetchImpl = vi.fn((url, o) => { opts = o; return Promise.reject(new DOMException('timed out', 'TimeoutError')); });
    const { els, run } = setup({ auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } }, fetchImpl);
    await run();
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    expect(els['da-err'].textContent).toMatch(/no respondió a tiempo/);
    expect(els['da-btn'].textContent).toBe('Eliminar mis datos de Invest');
  });
});
