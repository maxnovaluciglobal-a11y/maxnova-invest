// Tanda INV-3 (auditoría 360): INV-N8 (amplitud del S&P 500 sin fuente) e INV-N9
// (mindicador.cl no responde desde el edge: timeout corto, en paralelo y sin reintentos seguidos).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('INV-N8: Mercado sin la cifra de amplitud', () => {
  const html = readFileSync(resolve(__dirname, '../app/index.html'), 'utf8');
  it('no pide ^SPXA200R (Yahoo da 404) ni símbolos ya codificados a fetchHistory', () => {
    expect(html).not.toMatch(/SPXA200R/);
    expect(html).not.toMatch(/fetchHistory\('%/);
    expect(html).not.toContain('deGetBreadth');
  });
  it('la banda de contexto ya no muestra "Amplitud" con un "sin dato" permanente', () => {
    expect(html).not.toMatch(/Amplitud del S&amp;P 500/);
    expect(html).not.toMatch(/amplitud/i);
    expect(html).toContain("['Volatilidad (VIX)'");
    expect(html).toContain("['SPY frente a su media de 200 días'");
  });
});

const load = async (name) => { vi.resetModules(); return (await import(`../api/${name}.js`)).default; };
const req = (path) => new Request('https://invest.moyiq.app' + path);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const YAHOO = (price) => json({ chart: { result: [{ meta: { regularMarketPrice: price } }] } });
// mindicador que nunca responde: solo termina cuando se aborta por timeout.
const hang = (init) => new Promise((_, rej) => {
  init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('timeout'), { name: 'TimeoutError' })));
});

let realFetch, calls, mind;
beforeEach(() => {
  realFetch = globalThis.fetch;
  calls = [];
  mind = (url, init) => hang(init);
  globalThis.fetch = vi.fn(async (url, init) => {
    const u = String(url);
    calls.push(u);
    if (/mindicador/.test(u)) return mind(u, init);
    if (/USDCLP/.test(u)) return YAHOO(950.5);
    if (/USDMXN/.test(u)) return YAHOO(18.47);
    return YAHOO(1);
  });
});
afterEach(() => { globalThis.fetch = realFetch; });

describe('INV-N9: /api/fx-latam con mindicador caído', () => {
  it('antes esperaba Yahoo y DESPUÉS hasta 4 s a mindicador; ahora va en paralelo y corta a los 2,5 s', async () => {
    const h = await load('fx-latam');
    const t0 = Date.now();
    const body = await (await h(req('/api/fx-latam'))).json();
    const ms = Date.now() - t0;
    expect(ms).toBeGreaterThanOrEqual(2400);
    expect(ms).toBeLessThan(3500);
    expect(body.rates.CLP).toBe(950.5);
    expect(body.sources.CLP).toBe('yahoo');
    expect(body.rates.MXN).toBe(18.47);
    expect(Object.keys(body)).toEqual(['rates', 'sources', 'updatedAt']);
  }, 10000);

  it('tras un fallo no vuelve a consultar mindicador por 10 min: la siguiente respuesta no espera', async () => {
    const h = await load('fx-latam');
    await h(req('/api/fx-latam'));
    const before = calls.filter(u => /mindicador/.test(u)).length;
    const t0 = Date.now();
    const body = await (await h(req('/api/fx-latam'))).json();
    expect(Date.now() - t0).toBeLessThan(500);
    expect(calls.filter(u => /mindicador/.test(u)).length).toBe(before);
    expect(body.sources.CLP).toBe('yahoo');
  }, 10000);

  it('si mindicador responde, el CLP oficial reemplaza al de Yahoo (980 en vez de 950,5)', async () => {
    mind = () => json({ serie: [{ valor: 980, fecha: '2026-10-17T03:00:00.000Z' }] });
    const body = await (await (await load('fx-latam'))(req('/api/fx-latam'))).json();
    expect(body.rates.CLP).toBe(980);
    expect(body.sources.CLP).toBe('mindicador');
  });
});

describe('INV-N9 / FIN-17: /api/fx', () => {
  it('con dato: la fecha es la de la fuente, no la de la consulta', async () => {
    mind = () => json({ serie: [{ valor: 980, fecha: '2026-10-17T03:00:00.000Z' }] });
    const body = await (await (await load('fx'))(req('/api/fx'))).json();
    expect(body).toEqual({ usdClp: 980, date: '2026-10-17T03:00:00.000Z', source: 'Banco Central de Chile' });
  });
  it('el respaldo fijo (950) va sin fecha: antes salía con la fecha de hoy', async () => {
    mind = () => json({}, 502);
    const body = await (await (await load('fx'))(req('/api/fx'))).json();
    expect(body.usdClp).toBe(950);
    expect(body.source).toBe('fallback');
    expect(body.date).toBeNull();
  });
});
