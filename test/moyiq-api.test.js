// Ajustes de la API para que moyiq (web, demo y app nativa) use los datos de mercado de Invest:
// origen de la demo, /api/news por POST (los tickers no viajan en la URL) y el período 3A real.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const load = async (name) => { vi.resetModules(); return import(`../api/${name}.js`); };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const YAHOO_NEWS = json({ news: [{ title: 'Stocks rally', publisher: 'Reuters', link: 'https://example.com/a', providerPublishTime: Math.floor(Date.now() / 1000), relatedTickers: ['AAPL'] }] });
const post = (body, { origin = 'https://app.moyiq.app', type = 'application/json', raw } = {}) =>
  new Request('https://invest.moyiq.app/api/news', {
    method: 'POST',
    headers: { origin, ...(type ? { 'content-type': type } : {}) },
    body: raw !== undefined ? raw : JSON.stringify(body),
  });

let realFetch, fetchSpy;
beforeEach(() => {
  realFetch = globalThis.fetch;
  fetchSpy = vi.fn(async () => YAHOO_NEWS.clone());
  globalThis.fetch = fetchSpy;
});
afterEach(() => { globalThis.fetch = realFetch; });

describe('origen: demo y app nativa de moyiq', () => {
  it('acepta demo.moyiq.app, capacitor://native.moyiq.app y https://native.moyiq.app', async () => {
    const { isAllowedOrigin } = await import('../api/_lib/origin.js');
    for (const o of ['https://demo.moyiq.app', 'capacitor://native.moyiq.app', 'https://native.moyiq.app', 'https://app.moyiq.app', 'https://invest.moyiq.app']) {
      expect(isAllowedOrigin(o)).toBe(true);
    }
  });
  it('rechaza imitaciones y variantes', async () => {
    const { isAllowedOrigin } = await import('../api/_lib/origin.js');
    for (const o of ['http://demo.moyiq.app', 'https://demo.moyiq.app.evil.example', 'https://evil-demo.moyiq.app',
      'https://demo.moyiq.app:8443', 'http://localhost', 'http://localhost:5173', 'capacitor://evil', 'https://localhost:8443', 'capacitor://localhost', 'https://localhost', 'null', '']) {
      expect(isAllowedOrigin(o)).toBe(false);
    }
  });
  it('la demo recibe su propio Access-Control-Allow-Origin en history y news', async () => {
    fetchSpy.mockImplementation(async () => json({ chart: { result: [{ timestamp: [1, 2], indicators: { quote: [{ close: [1, 2] }] } }] } }));
    const history = (await load('history')).default;
    const res = await history(new Request('https://invest.moyiq.app/api/history?ticker=AAPL', { headers: { origin: 'https://demo.moyiq.app' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://demo.moyiq.app');
    fetchSpy.mockImplementation(async () => YAHOO_NEWS.clone());
    const news = (await load('news')).default;
    const r2 = await news(post({ tickers: ['AAPL'] }, { origin: 'https://demo.moyiq.app' }));
    expect(r2.status).toBe(200);
    expect(r2.headers.get('access-control-allow-origin')).toBe('https://demo.moyiq.app');
  });
});

describe('/api/news por POST', () => {
  it('lee los tickers del cuerpo y no los pone en la URL del pedido', async () => {
    const h = (await load('news')).default;
    const res = await h(post({ tickers: ['aapl', 'nvda'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].title).toBe('Stocks rally');
    expect(String(fetchSpy.mock.calls[0][0])).toContain(encodeURIComponent('AAPL,NVDA'));
  });
  it('acepta también una cadena separada por comas', async () => {
    const h = (await load('news')).default;
    await h(post({ tickers: 'msft, gld' }));
    expect(String(fetchSpy.mock.calls[0][0])).toContain(encodeURIComponent('MSFT,GLD'));
  });
  it('aplica el mismo filtro que el GET: regex y 12 como máximo', async () => {
    const { normalizeTickers, MAX_TICKERS } = await load('news');
    const many = Array.from({ length: 20 }, (_, i) => `T${i}`);
    expect(normalizeTickers(many).split(',')).toHaveLength(MAX_TICKERS);
    expect(normalizeTickers(['AAPL', 'bad ticker', '<script>', 42, null, 'BTC-USD', '^VIX'])).toBe('AAPL,BTC-USD,^VIX');
    expect(normalizeTickers('AAPL,bad ticker,GLD')).toBe(normalizeTickers(['AAPL', 'bad ticker', 'GLD']));
    expect(normalizeTickers([])).toBe('SPY,QQQ,NVDA,AAPL');
  });
  it('sin tickers usa la lista por defecto, igual que el GET', async () => {
    const h = (await load('news')).default;
    await h(post({}));
    expect(String(fetchSpy.mock.calls[0][0])).toContain(encodeURIComponent('SPY,QQQ,NVDA,AAPL,AMZN,META,MSFT,GLD'));
  });
  it.each([
    ['sin Content-Type JSON', { type: 'text/plain', raw: '{"tickers":["AAPL"]}' }, 415],
    ['JSON inválido', { raw: '{tickers' }, 400],
    ['cuerpo que no es objeto', { raw: '["AAPL"]' }, 400],
    ['tickers con tipo inválido', { raw: '{"tickers":42}' }, 400],
    ['cuerpo demasiado grande', { raw: JSON.stringify({ tickers: ['A'.repeat(3000)] }) }, 413],
  ])('%s → %i sin llamar a Yahoo', async (_n, opts, status) => {
    const h = (await load('news')).default;
    const res = await h(post(null, opts));
    expect(res.status).toBe(status);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('un Origin ajeno recibe 403 también por POST', async () => {
    const h = (await load('news')).default;
    const res = await h(post({ tickers: ['AAPL'] }, { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('la respuesta a POST es privada; la de GET sigue pública en el CDN', async () => {
    const h = (await load('news')).default;
    expect((await h(post({ tickers: ['AAPL'] }))).headers.get('cache-control')).toBe('private, max-age=600');
    const g = await h(new Request('https://invest.moyiq.app/api/news?tickers=MSFT'));
    expect(g.headers.get('cache-control')).toBe('public, s-maxage=600, stale-while-revalidate=1200');
  });
  it('GET y POST con los mismos tickers comparten la caché de 10 minutos', async () => {
    const h = (await load('news')).default;
    await h(post({ tickers: ['AAPL', 'NVDA'] }));
    await h(post({ tickers: 'AAPL,NVDA' }));
    await h(new Request('https://invest.moyiq.app/api/news?tickers=AAPL,NVDA'));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 601_000);
    await h(post({ tickers: ['AAPL', 'NVDA'] }));
    vi.useRealTimers();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
  it('no guarda en caché una respuesta vacía', async () => {
    fetchSpy.mockImplementation(async () => json({}, 500));
    const h = (await load('news')).default;
    await h(post({ tickers: ['AAPL'] }));
    const n = fetchSpy.mock.calls.length;
    await h(post({ tickers: ['AAPL'] }));
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(n);
  });
  it('el preflight permite POST con Content-Type', async () => {
    const h = (await load('news')).default;
    const res = await h(new Request('https://invest.moyiq.app/api/news', { method: 'OPTIONS', headers: { origin: 'capacitor://native.moyiq.app' } }));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-headers')).toContain('Content-Type');
    expect(res.headers.get('access-control-allow-origin')).toBe('capacitor://native.moyiq.app');
  });
  it('otros métodos reciben 405', async () => {
    const h = (await load('news')).default;
    const res = await h(new Request('https://invest.moyiq.app/api/news', { method: 'PUT', headers: { origin: 'https://app.moyiq.app' } }));
    expect(res.status).toBe(405);
  });
  it('la app de Invest pide noticias por POST, sin tickers en la URL', () => {
    const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
    expect(html).not.toMatch(/\/api\/news\?tickers=/);
    expect(html).toMatch(/fetchWithTimeout\('\/api\/news',8000,\{method:'POST'/);
  });
});

describe('período 3A (tres años reales)', () => {
  it('yahooSpan pide 3 años exactos por period1/period2', async () => {
    const { yahooSpan } = await load('history');
    const now = Date.UTC(2026, 10, 20, 12);
    const span = yahooSpan('3y', now);
    const p1 = Number(span.match(/period1=(\d+)/)[1]);
    const p2 = Number(span.match(/period2=(\d+)/)[1]);
    expect(p2).toBe(Math.floor(now / 1000));
    expect(new Date(p1 * 1000).toISOString().slice(0, 10)).toBe('2023-11-20');
    expect(yahooSpan('5y')).toBe('range=5y');
    expect(yahooSpan('1y')).toBe('range=1y');
  });
  it('/api/history acepta range=3y y no lo manda como range a Yahoo', async () => {
    fetchSpy.mockImplementation(async () => json({ chart: { result: [{ timestamp: [1700000000], indicators: { quote: [{ close: [10] }] } }] } }));
    const h = (await load('history')).default;
    const res = await h(new Request('https://invest.moyiq.app/api/history?ticker=AAPL&range=3y'));
    expect(res.status).toBe(200);
    expect((await res.json()).range).toBe('3y');
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toMatch(/period1=\d+&period2=\d+/);
    expect(url).not.toContain('range=3y');
  });
  it('sigue rechazando rangos desconocidos', async () => {
    const h = (await load('history')).default;
    expect((await h(new Request('https://invest.moyiq.app/api/history?ticker=AAPL&range=4y'))).status).toBe(400);
  });
  it('Comparar pide 3y para el período 3A (antes 5y)', () => {
    const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
    expect(html).toMatch(/1095:'3y'/);
    expect(html).not.toMatch(/1095:'5y'/);
  });
});
