// FIN-5 (auditoría 360, 18-oct-2026): la ficha armaba el objeto de fundamentales sin `source`,
// así que normalizeFundamentals() caía en la heurística "módulo > 2 es %" y los valores de
// Finnhub (que vienen en %) entre -2 y 2 se mostraban 100 veces más grandes:
// VZ 1,38 % salía 138 %, PFE -0,22 % salía -22 %, MO -0,58 % salía -58 %.
//
// El test ejecuta el fetchFundamentals REAL de app/index.html (vm, con red y localStorage simulados)
// con las respuestas reales de producción del 19-oct-2026, y pasa el resultado por la misma
// normalizeFundamentals() que usa la ficha.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { normalizeFundamentals } from '../app/lib/market.js';

const html = readFileSync(resolve(__dirname, '../app/index.html'), 'utf8');

// Respuestas reales de https://invest.moyiq.app/api/fundamentals?ticker=<T> (Finnhub, en %).
const API = {
  VZ: { ticker: 'VZ', peRatio: 10.8587, forwardPE: 11.5315, priceToBook: 1.644, eps: 3.8398, grossMargin: 59.41, netMargin: 11.64, operatingMargin: 20.59, roe: 15.52, revenueGrowth: 1.38, beta: 0.2679969, debtToEquity: 1.514, dividendYield: 0.071104, marketCap: 186487099816.69943, price: null, sector: 'Telecommunication', industry: 'Telecommunication', description: null, website: 'https://www.verizon.com/', employees: null, country: 'US', analystRating: null, targetPrice: null, fetchedAt: 1792414348250, source: 'finnhub' },
  PFE: { ticker: 'PFE', peRatio: 21.6984, forwardPE: 38.9098, priceToBook: 1.6371, eps: 0.7554, grossMargin: 74.71, netMargin: 6.8, operatingMargin: 6.79, roe: 4.89, revenueGrowth: -0.22, beta: 0.30800542, debtToEquity: 0.7493, dividendYield: 0.0537705, marketCap: 168596340451.05365, price: null, sector: 'Pharmaceuticals', industry: 'Pharmaceuticals', description: null, website: 'https://www.pfizer.com/', employees: null, country: 'US', analystRating: null, targetPrice: null, fetchedAt: 1792414348672, source: 'finnhub' },
  MO: { ticker: 'MO', peRatio: 18.053, forwardPE: 15.7299, priceToBook: 26.8387, eps: 4.7606, grossMargin: 62.86, netMargin: 33.99, operatingMargin: 46.78, roe: 149.65, revenueGrowth: -0.58, beta: 0.49981797, debtToEquity: 10.3808, dividendYield: 0.0945262, marketCap: 125414457845.37132, price: null, sector: 'Tobacco', industry: 'Tobacco', description: null, website: 'https://www.altria.com/', employees: null, country: 'US', analystRating: null, targetPrice: null, fetchedAt: 1792414349060, source: 'finnhub' },
  JPM: { ticker: 'JPM', peRatio: 15.8295, forwardPE: 13.6868, priceToBook: 2.4202, eps: 24.373, grossMargin: null, netMargin: 33.26454, operatingMargin: 41.22809, roe: 17.91, revenueGrowth: 108.9793, beta: 1.0364068, debtToEquity: 2.55, dividendYield: 0.0273544, marketCap: 903039039517.7379, price: null, sector: 'Banking', industry: 'Banking', description: null, website: 'https://www.jpmorganchase.com/', employees: null, country: 'US', analystRating: null, targetPrice: null, fetchedAt: 1792414349441, source: 'finnhub' },
};

// Arma el fetchFundamentals de app/index.html con red, caché y localStorage simulados.
function setup({ payloads = API, store = {} } = {}) {
  const from = html.indexOf('// ── FUNDAMENTALES: caché versionada');
  const start = from >= 0 ? from : html.indexOf('async function fetchFundamentals(');
  const code = html.slice(start, html.indexOf('async function fetchEarningsData('));
  const ls = { ...store };
  const calls = [];
  const localStorage = {
    getItem: (k) => (k in ls ? ls[k] : null),
    setItem: (k, v) => { ls[k] = String(v); },
    removeItem: (k) => { delete ls[k]; },
    key: (i) => Object.keys(ls)[i] ?? null,
    get length() { return Object.keys(ls).length; },
  };
  // _cacheGet/_cacheSet de la app: caché de 20 min en localStorage con prefijo _apic_.
  const ctx = {
    localStorage, console, Date, JSON, Object, encodeURIComponent,
    _USE_EDGE: true,
    _cacheGet: (k) => { const raw = ls['_apic_' + k]; return raw ? JSON.parse(raw).data : null; },
    _cacheSet: (k, data) => { ls['_apic_' + k] = JSON.stringify({ ts: Date.now(), data }); },
    fetchWithTimeout: async (url) => {
      calls.push(url);
      const t = new URL(url, 'https://invest.moyiq.app').searchParams.get('ticker').toUpperCase();
      return { ok: true, json: async () => ({ [t]: payloads[t] }) };
    },
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.fetchFundamentals = fetchFundamentals;', ctx);
  return { fetchFundamentals: ctx.fetchFundamentals, ls, calls };
}

// Lo que ve la ficha: el objeto de fetchFundamentals pasado por normalizeFundamentals.
async function ficha(ticker, opts) {
  const { fetchFundamentals } = setup(opts);
  return normalizeFundamentals(await fetchFundamentals(ticker));
}

describe('FIN-5 · ROE, márgenes y crecimiento de Finnhub entre -2 % y 2 %', () => {
  it('VZ: crecimiento de ingresos 1,38 % queda en 0,0138 (no 138 %)', async () => {
    const f = await ficha('VZ');
    expect(f.revenueGrowth).toBeCloseTo(0.0138, 10);
    expect(f.roe).toBeCloseTo(0.1552, 10);
    expect(f.netMargin).toBeCloseTo(0.1164, 10);
    expect(f.grossMargin).toBeCloseTo(0.5941, 10);
  });
  it('PFE: crecimiento de ingresos -0,22 % queda en -0,0022 (no -22 %)', async () => {
    const f = await ficha('PFE');
    expect(f.revenueGrowth).toBeCloseTo(-0.0022, 10);
    expect(f.roe).toBeCloseTo(0.0489, 10);
    expect(f.netMargin).toBeCloseTo(0.068, 10);
  });
  it('MO: crecimiento de ingresos -0,58 % queda en -0,0058 (no -58 %); ROE 149,65 % sigue en 1,4965', async () => {
    const f = await ficha('MO');
    expect(f.revenueGrowth).toBeCloseTo(-0.0058, 10);
    expect(f.roe).toBeCloseTo(1.4965, 10);
  });
  it('JPM: crecimiento de 108,98 % se dividía bien por casualidad (módulo mayor que 2); sigue bien', async () => {
    const f = await ficha('JPM');
    expect(f.revenueGrowth).toBeCloseTo(1.089793, 10);
    expect(f.grossMargin).toBe(null);
  });
  it('FMP viene en fracción: un crecimiento de 250 % (2,5) no se divide por 100', async () => {
    const fmp = { ...API.VZ, ticker: 'ZZ', source: 'fmp', revenueGrowth: 2.5, netMargin: -0.0182, roe: 0.0153 };
    const f = await ficha('ZZ', { payloads: { ZZ: fmp } });
    expect(f.revenueGrowth).toBe(2.5);
    expect(f.netMargin).toBe(-0.0182);
    expect(f.roe).toBe(0.0153);
  });
  it('el objeto de la ficha conserva la fuente y la hora de la consulta (la ficha los muestra al pie)', async () => {
    const { fetchFundamentals } = setup();
    const raw = await fetchFundamentals('VZ');
    expect(raw.source).toBe('finnhub');
    expect(raw.fetchedAt).toBe(1792414348250);
  });
});

describe('FIN-5 · caché versionada: no se reutilizan los objetos viejos sin `source`', () => {
  const viejo = { revenueGrowth: 1.38, roe: 15.52, netMargin: 11.64 };
  it('una entrada vieja ff_<ticker> (1 h) no se lee: se consulta de nuevo y sale 1,38 %', async () => {
    const store = { ff_VZ: JSON.stringify({ ts: Date.now(), data: viejo }) };
    const { fetchFundamentals, calls } = setup({ store });
    const f = normalizeFundamentals(await fetchFundamentals('VZ'));
    expect(calls).toHaveLength(1);
    expect(f.revenueGrowth).toBeCloseTo(0.0138, 10);
  });
  it('una entrada vieja _apic_fund_<ticker> (20 min) tampoco se lee', async () => {
    const store = { _apic_fund_VZ: JSON.stringify({ ts: Date.now(), data: viejo }) };
    const { fetchFundamentals, calls } = setup({ store });
    const f = normalizeFundamentals(await fetchFundamentals('VZ'));
    expect(calls).toHaveLength(1);
    expect(f.revenueGrowth).toBeCloseTo(0.0138, 10);
  });
  it('lo que se guarda ahora lleva `source` y se reutiliza sin volver a consultar', async () => {
    const { fetchFundamentals, ls, calls } = setup();
    await fetchFundamentals('VZ');
    const guardado = Object.entries(ls).filter(([k]) => /^(ff|_apic_fund)/.test(k));
    expect(guardado.length).toBeGreaterThan(0);
    for (const [, v] of guardado) expect(JSON.parse(v).data.source).toBe('finnhub');
    await fetchFundamentals('VZ');
    expect(calls).toHaveLength(1);
  });
  it('al cargar, se borran las entradas de la versión anterior y se respetan las nuevas y las ajenas', () => {
    const store = {
      ff_VZ: '{}', ff_PFE: '{}', _apic_fund_VZ: '{}',
      ff2_VZ: '{"keep":1}', _apic_fund2_VZ: '{"keep":1}', _apic_q_VZ: '{"keep":1}', fh_VZ_126: '{"keep":1}',
    };
    const { ls } = setup({ store });
    expect(Object.keys(ls).sort()).toEqual(['_apic_fund2_VZ', '_apic_q_VZ', 'ff2_VZ', 'fh_VZ_126'].sort());
  });
});

describe('FIN-5 · el panel de la ficha lee la misma caché versionada', () => {
  it('ningún lector arma la clave vieja a mano', () => {
    expect(html).not.toMatch(/['"]ff_['"]\s*\+/);
    expect(html).not.toMatch(/['"]fund_['"]\s*\+/);
  });
  it('openDrawer usa fundLsKey() para la lectura previa de localStorage', () => {
    const open = html.slice(html.indexOf('function openDrawer('), html.indexOf('function closeDrawer('));
    expect(open).toContain('fundLsKey(ticker)');
  });
});
