// INV-6 / SEG-14 (auditoría 360, parte barata de C-33): /api/fundamentals y /api/earnings no validaban
// el ticker (quote, history, news y crypto sí). Un texto cualquiera llegaba tal cual a Finnhub y FMP,
// y cada pedido gasta cuota del plan gratuito. Ahora solo pasan tickers con el formato de Yahoo.
// (La validación es higiene: no frena a quien manda tickers válidos; para eso hace falta límite de uso.)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const req = (path) => new Request('https://invest.moyiq.app' + path, { headers: { origin: 'https://invest.moyiq.app' } });
const load = async (name) => { vi.resetModules(); return (await import(`../api/${name}.js`)).default; };

const INVALID = [
  'AAPL;DROP TABLE', 'A B', '../../etc/passwd', 'AAPL%0d%0aSet-Cookie:x', 'X'.repeat(13), '<script>alert(1)</script>',
  '$AAPL', 'AAPL/../x', 'AAPL?apikey=1', 'AAPL#frag', 'AÁPL', 'AAPL\\x',
];
const VALID = ['AAPL', 'aapl', '^GSPC', 'BRK-B', 'BTC-USD', 'EURUSD=X', 'FALABELLA.SN', 'SQM-B.SN', 'X'.repeat(12)];

let realFetch, fetchSpy;
beforeEach(() => {
  vi.stubEnv('FINNHUB_API_KEY', 'finnhub-de-prueba');
  vi.stubEnv('FMP_API_KEY', 'fmp-de-prueba');
  realFetch = globalThis.fetch;
  fetchSpy = vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  globalThis.fetch = fetchSpy;
});
afterEach(() => { globalThis.fetch = realFetch; vi.unstubAllEnvs(); });

describe('/api/fundamentals', () => {
  it.each(INVALID)('rechaza %j con 400 invalid_ticker y no llama a ningún proveedor', async (t) => {
    const h = await load('fundamentals');
    const res = await h(req('/api/fundamentals?ticker=' + encodeURIComponent(t)));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_ticker');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('rechaza el lote si uno solo de los tickers es inválido', async () => {
    const h = await load('fundamentals');
    const res = await h(req('/api/fundamentals?ticker=AAPL,MSFT,BAD%20TICKER'));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('rechaza un parámetro larguísimo antes de partirlo', async () => {
    const h = await load('fundamentals');
    const res = await h(req('/api/fundamentals?ticker=' + 'A,'.repeat(150)));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('sin ticker sigue respondiendo ticker_required', async () => {
    const h = await load('fundamentals');
    const res = await h(req('/api/fundamentals'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('ticker_required');
  });
  it.each(VALID)('deja pasar %j y consulta al proveedor', async (t) => {
    const h = await load('fundamentals');
    const res = await h(req('/api/fundamentals?ticker=' + encodeURIComponent(t)));
    expect(res.status).not.toBe(400);
    expect(fetchSpy).toHaveBeenCalled();
  });
  it('un lote de hasta 10 tickers válidos sigue funcionando', async () => {
    const h = await load('fundamentals');
    const res = await h(req('/api/fundamentals?ticker=AAPL,MSFT,NVDA,VZ,PFE,MO,JPM,KO,PEP,XOM'));
    expect(res.status).not.toBe(400);
    expect(fetchSpy).toHaveBeenCalled();
  });
});

describe('/api/earnings', () => {
  it.each(INVALID)('rechaza %j con 400 invalid_ticker y no llama a FMP', async (t) => {
    const h = await load('earnings');
    const res = await h(req('/api/earnings?ticker=' + encodeURIComponent(t)));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_ticker');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('sin ticker sigue respondiendo ticker_required', async () => {
    const h = await load('earnings');
    const res = await h(req('/api/earnings'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('ticker_required');
  });
  it.each(VALID)('deja pasar %j y consulta a FMP', async (t) => {
    const h = await load('earnings');
    const res = await h(req('/api/earnings?ticker=' + encodeURIComponent(t)));
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();
  });
});

describe('todos los endpoints que reciben un ticker lo validan', () => {
  const src = (n) => readFileSync(resolve(__dirname, '../api/' + n + '.js'), 'utf8');
  it.each(['quote', 'history', 'fundamentals', 'earnings', 'crypto', 'news'])('api/%s.js tiene una expresión regular de ticker', (n) => {
    expect(/\.test\(/.test(src(n)) && /\^\\?\[?.*\{1,\d+\}\$/.test(src(n))).toBe(true);
  });
});
