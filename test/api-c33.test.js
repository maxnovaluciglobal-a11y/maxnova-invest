// C-33 (auditoría 360): control de origen en las API de mercado, /api/earnings con una fuente
// que funcione (INV-7, INV-N3) y /api/health para el monitoreo. El newsletter diario llama a
// quote, fx-latam, fundamentals y earnings con curl, sin Origin: eso tiene que seguir pasando
// y con el mismo formato.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const load = async (name) => { vi.resetModules(); return (await import(`../api/${name}.js`)).default; };
const req = (path, origin) => new Request('https://invest.moyiq.app' + path, origin === undefined ? {} : { headers: { origin } });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let realFetch, fetchSpy, routes;
beforeEach(() => {
  vi.stubEnv('FINNHUB_API_KEY', 'finnhub-clave-secreta');
  vi.stubEnv('FMP_API_KEY', 'fmp-clave-secreta');
  realFetch = globalThis.fetch;
  routes = [];
  fetchSpy = vi.fn(async (url) => {
    const u = String(url);
    for (const [re, fn] of routes) if (re.test(u)) return fn(u);
    return json({}, 404);
  });
  globalThis.fetch = fetchSpy;
});
afterEach(() => { globalThis.fetch = realFetch; vi.unstubAllEnvs(); });

const YAHOO_CHART = (price = 100) => json({ chart: { result: [{ meta: { regularMarketPrice: price, chartPreviousClose: 99, regularMarketTime: Math.floor(Date.now() / 1000) - 60, currentTradingPeriod: { regular: {} } }, indicators: { quote: [{ close: [1, 2] }] } }] } });

const ENDPOINTS = [
  ['quote', '/api/quote?ticker=AAPL'],
  ['history', '/api/history?ticker=AAPL'],
  ['news', '/api/news?tickers=AAPL'],
  ['crypto', '/api/crypto?symbols=BTC'],
  ['fundamentals', '/api/fundamentals?ticker=AAPL'],
  ['earnings', '/api/earnings?ticker=AAPL'],
  ['fx', '/api/fx'],
  ['fx-latam', '/api/fx-latam'],
  ['marketbar', '/api/marketbar'],
  ['health', '/api/health'],
];

describe('control de origen', () => {
  it.each(ENDPOINTS)('%s: un Origin ajeno recibe 403 sin llamar a ningún proveedor', async (name, path) => {
    const h = await load(name);
    for (const o of ['https://evil.example', 'null', 'https://invest.moyiq.app.evil.example', 'http://invest.moyiq.app']) {
      const res = await h(req(path, o));
      expect(res.status).toBe(403);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect((await res.json()).error).toBe('origin_not_allowed');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it.each(ENDPOINTS)('%s: sin Origin (curl, newsletter) llega al proveedor', async (name, path) => {
    routes.push([/./, () => json({}, 500)]);
    const h = await load(name);
    const res = await h(req(path));
    expect(res.status).not.toBe(403);
    expect(fetchSpy).toHaveBeenCalled();
  });
  it('los orígenes propios y las vistas previas del team pasan', async () => {
    routes.push([/yahoo/, () => YAHOO_CHART()]);
    const h = await load('quote');
    for (const o of ['https://invest.moyiq.app', 'https://app.moyiq.app', 'https://invest.financeospro.com',
      'https://invest-moyiq-abc123-maxnovaluci-global.vercel.app', 'https://magnova-invest.vercel.app']) {
      expect((await h(req('/api/quote?ticker=AAPL', o))).status).toBe(200);
    }
  });
});

describe('formato sin cambios para el newsletter', () => {
  it('/api/quote conserva sus campos', async () => {
    routes.push([/yahoo/, () => YAHOO_CHART(190)]);
    const body = await (await (await load('quote'))(req('/api/quote?ticker=AAPL'))).json();
    expect(Object.keys(body.AAPL)).toEqual(['ticker', 'price', 'prevClose', 'change', 'changePct', 'volume', 'high52', 'low52', 'marketCap', 'currency', 'fetchedAt', 'marketTime', 'tradingStart', 'tradingEnd', 'delayedBy', 'timezone']);
  });
  it('/api/fx-latam conserva {rates, sources, updatedAt}', async () => {
    routes.push([/yahoo/, () => YAHOO_CHART(950)], [/mindicador/, () => json({ serie: [{ valor: 980, fecha: '2026-10-19T03:00:00.000Z' }] })]);
    const body = await (await (await load('fx-latam'))(req('/api/fx-latam'))).json();
    expect(Object.keys(body)).toEqual(['rates', 'sources', 'updatedAt']);
    expect(body.sources.CLP).toBe('mindicador');
  });
});

describe('/api/earnings', () => {
  const FH_EARN = [
    { actual: 1.85, estimate: 1.8, period: '2026-06-30', quarter: 3, year: 2026, symbol: 'AAPL' },
    { actual: 1.5, estimate: 1.6, period: '2026-03-31', quarter: 2, year: 2026, symbol: 'AAPL' },
  ];
  const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const later = new Date(Date.now() + 100 * 86400000).toISOString().slice(0, 10);

  it('usa Finnhub: trimestres, próxima fecha y source', async () => {
    routes.push([/finnhub.*stock\/earnings/, () => json(FH_EARN)],
      [/finnhub.*calendar\/earnings/, () => json({ earningsCalendar: [{ date: later, epsEstimate: 2 }, { date: future, epsEstimate: 1.9, symbol: 'AAPL' }] })]);
    const res = await (await load('earnings'))(req('/api/earnings?ticker=aapl'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Object.keys(body)).toEqual(['ticker', 'nextDate', 'nextEpsEst', 'quarters', 'source', 'fetchedAt']);
    expect(body).toMatchObject({ ticker: 'AAPL', nextDate: future, nextEpsEst: 1.9, source: 'finnhub' });
    expect(body.quarters[0]).toEqual({ date: '2026-06-30', fiscalEnd: '2026-06-30', eps: 1.85, epsEst: 1.8, revenue: null, revenueEst: null, beat: true });
    expect(body.quarters[1].beat).toBe(false);
    expect(fetchSpy.mock.calls.some(([u]) => /financialmodelingprep/.test(u))).toBe(false);
    const fhCall = fetchSpy.mock.calls.find(([u]) => /finnhub/.test(u));
    expect(fhCall[0]).not.toContain('finnhub-clave-secreta');
    expect(fhCall[1].headers['X-Finnhub-Token']).toBe('finnhub-clave-secreta');
  });

  it('si Finnhub no trae nada, usa FMP /stable/earnings', async () => {
    routes.push([/finnhub/, () => json({ error: 'You don\'t have access to this resource.' }, 403)],
      [/financialmodelingprep\.com\/stable\/earnings\?symbol=AAPL/, () => json([
        { symbol: 'AAPL', date: later, epsActual: null, epsEstimated: 2.1 },
        { symbol: 'AAPL', date: future, epsActual: null, epsEstimated: 1.95, revenueEstimated: 100 },
        { symbol: 'AAPL', date: '2026-07-30', epsActual: 1.85, epsEstimated: 1.8, revenueActual: 94e9, revenueEstimated: 93e9 },
      ])]);
    const body = await (await (await load('earnings'))(req('/api/earnings?ticker=AAPL'))).json();
    expect(body).toMatchObject({ nextDate: future, nextEpsEst: 1.95, source: 'fmp' });
    expect(body.quarters).toEqual([{ date: '2026-07-30', fiscalEnd: null, eps: 1.85, epsEst: 1.8, revenue: 94e9, revenueEst: 93e9, beat: true }]);
  });

  it('sin datos de ninguna fuente: mismo formato, source null y caché corta', async () => {
    routes.push([/finnhub.*stock\/earnings/, () => json([])], [/finnhub/, () => json({ earningsCalendar: [] })], [/financialmodelingprep/, () => json({ 'Error Message': 'Legacy Endpoint' })]);
    const res = await (await load('earnings'))(req('/api/earnings?ticker=AAPL'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ticker: 'AAPL', nextDate: null, nextEpsEst: null, quarters: [], source: null });
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=300');
  });

  it('ya no llama a los endpoints /api/v3 de FMP', async () => {
    routes.push([/finnhub/, () => json([], 500)], [/./, () => json([])]);
    await (await load('earnings'))(req('/api/earnings?ticker=AAPL'));
    expect(fetchSpy.mock.calls.some(([u]) => /\/api\/v3\//.test(u))).toBe(false);
  });
});

describe('/api/health', () => {
  const allOk = () => {
    const t = Math.floor(Date.now() / 1000);
    routes.push(
      [/yahoo.*\/search/, () => json({ news: [{ title: 'x', providerPublishTime: t - 600 }] })],
      [/yahoo.*\/chart/, () => YAHOO_CHART()],
      [/mindicador/, () => json({ serie: [{ valor: 980, fecha: new Date(Date.now() - 3600e3).toISOString() }] })],
      [/finnhub.*profile2/, () => json({ ticker: 'AAPL' })],
      [/finnhub.*stock\/earnings/, () => json([{ period: '2026-06-30', actual: 1 }])],
      [/coingecko/, () => json({ bitcoin: { usd: 1, last_updated_at: t - 30 } })],
    );
  };

  it('todo bien: 200, estado por API y proveedor, con antigüedad y sin claves', async () => {
    allOk();
    const res = await (await load('health'))(req('/api/health'));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toMatch(/clave-secreta|apikey|token|https?:\/\//i);
    const body = JSON.parse(text);
    expect(body.ok).toBe(true);
    expect(Object.keys(body.apis)).toEqual(['quote', 'news', 'fx', 'fundamentals', 'earnings', 'crypto']);
    expect(body.apis.quote.providers.yahoo).toMatchObject({ ok: true, status: 200 });
    expect(body.apis.quote.providers.yahoo.ageSeconds).toBeGreaterThanOrEqual(60);
    expect(body.apis.news.providers.yahoo.ageSeconds).toBeGreaterThanOrEqual(600);
    expect(body.apis.fx.providers.mindicador.ok).toBe(true);
    expect(body.apis.crypto.providers.coingecko.ok).toBe(true);
    // El respaldo no se consulta si la fuente principal responde: no gasta cuota de FMP.
    expect(body.apis.fundamentals.providers.fmp.status).toBe('not_checked');
    expect(body.apis.earnings.providers.fmp.status).toBe('not_checked');
    expect(fetchSpy.mock.calls.some(([u]) => /financialmodelingprep/.test(u))).toBe(false);
    expect(res.headers.get('cache-control')).toContain('s-maxage=900');
  });

  it('si cae Finnhub consulta FMP; si caen los dos responde 503', async () => {
    allOk();
    routes.unshift([/finnhub/, () => json({ error: 'limit' }, 429)], [/financialmodelingprep/, () => json({}, 401)]);
    const res = await (await load('health'))(req('/api/health'));
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.apis.fundamentals.providers).toMatchObject({ finnhub: { ok: false, status: 429 }, fmp: { ok: false, status: 401 } });
    expect(body.apis.quote.ok).toBe(true);
  });

  it('con parámetros responde 400 sin llamar a nadie (no se salta la caché)', async () => {
    const res = await (await load('health'))(req('/api/health?x=1'));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('cabeceras (SEG-14)', async () => {
  const { readFileSync } = await import('node:fs');
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const all = vercel.headers.find(h => h.source === '/(.*)').headers;
  const csp = all.find(h => h.key === 'Content-Security-Policy').value;
  it('la CSP no habilita llamadas del navegador a proveedores de mercado ni a jsDelivr (todo pasa por /api)', () => {
    expect(csp).not.toMatch(/yahoo|financialmodelingprep|mindicador|finnhub|coingecko|jsdelivr/);
  });
  it('HSTS con includeSubDomains', () => {
    expect(all.find(h => h.key === 'Strict-Transport-Security').value).toMatch(/max-age=\d{8,}; includeSubDomains/);
  });
});
