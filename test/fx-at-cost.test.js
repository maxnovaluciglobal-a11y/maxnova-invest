// FIN-12 (auditoría 360): el resultado en USD usaba el tipo de cambio de HOY también para el
// costo. Caso de la auditoría: SQM comprada a CLP 60.000 con USD = 900 (US$66,67 por acción)
// que hoy vale CLP 60.000 con USD = 980 (US$61,22): la app mostraba 0 %; en USD es −8,2 %.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { portfolioTotals, convertHoldings, currencyOf } = require('../app/lib/fx.js');
const { applyTrade } = require('../app/lib/holdings.js');

const RATES = { CLP: 980 };
const ccy = (t) => currencyOf(t);

describe('portfolioTotals con el tipo de cambio de la compra', () => {
  const sqm = { t: 'SQM-B.SN', sh: 100, cost: 60000, fxCost: 900 };
  const live = { 'SQM-B.SN': { price: 60000, changePct: 0 } };
  it('el caso de la auditoría da −8,2 % en USD y el efecto cambiario aparte', () => {
    const T = portfolioTotals([sqm], (t) => live[t], ccy, RATES);
    expect(T.cost).toBeCloseTo(100 * 60000 / 900, 6);
    expect(T.value).toBeCloseTo(100 * 60000 / 980, 6);
    expect(T.totalPct).toBeCloseTo(900 / 980 - 1, 6);
    expect(Math.round(T.totalPct * 1000) / 10).toBe(-8.2);
    expect(T.fxEffect).toBeCloseTo(100 * 60000 / 980 - 100 * 60000 / 900, 6);
    expect(T.fxKnown).toBe(1);
    expect(T.fxUnknown).toBe(0);
  });
  it('sin fxCost se mantiene el cálculo anterior y se cuenta como desconocido', () => {
    const T = portfolioTotals([{ t: 'SQM-B.SN', sh: 100, cost: 60000 }], (t) => live[t], ccy, RATES);
    expect(T.totalPct).toBe(0);
    expect(T.fxEffect).toBe(0);
    expect(T.fxUnknown).toBe(1);
  });
  it('un portafolio en USD no cambia en nada (fxCost se ignora)', () => {
    const port = [{ t: 'AAPL', sh: 2, cost: 100, fxCost: 5 }];
    const T = portfolioTotals(port, () => ({ price: 110, changePct: 0 }), ccy, RATES);
    expect(T).toMatchObject({ cost: 200, value: 220, total: 20, fxEffect: 0, fxKnown: 0, fxUnknown: 0 });
  });
  it('fxCost inválido (0, negativo, texto) cuenta como desconocido', () => {
    for (const fxCost of [0, -1, 'x', null]) {
      const T = portfolioTotals([{ t: 'SQM-B.SN', sh: 1, cost: 1000, fxCost }], (t) => live[t], ccy, RATES);
      expect(T.fxUnknown).toBe(1);
    }
  });
});

describe('convertHoldings expone el costo en USD de la compra', () => {
  it('costUsdBuy con fxCost; null sin él o en USD', () => {
    const { rows } = convertHoldings([
      { t: 'SQM-B.SN', sh: 100, cost: 60000, fxCost: 900 },
      { t: 'SQM-B.SN', sh: 1, cost: 60000 },
      { t: 'AAPL', sh: 1, cost: 100 },
    ], ccy, RATES);
    expect(rows[0].costUsdBuy).toBeCloseTo(100 * 60000 / 900, 6);
    expect(rows[0].fxCost).toBe(900);
    expect(rows[1].costUsdBuy).toBe(null);
    expect(rows[2].costUsdBuy).toBe(null);
    expect(rows[0].cost).toBeCloseTo(60000 / 980, 9);
  });
});

describe('applyTrade lleva el tipo de cambio de la compra', () => {
  it('crea la posición con el tipo de cambio de la operación', () => {
    expect(applyTrade(null, { type: 'buy', qty: 10, price: 1000, fx: 950 })).toMatchObject({ action: 'create', sh: 10, cost: 1000, fxCost: 950 });
  });
  it('una compra más promedia el costo en USD', () => {
    const r = applyTrade({ sh: 10, cost: 1000, fxCost: 900 }, { type: 'buy', qty: 10, price: 1200, fx: 1000 });
    const usd = 10 * 1000 / 900 + 10 * 1200 / 1000;
    expect(r.cost).toBe(1100);
    expect(r.fxCost).toBeCloseTo(20 * 1100 / usd, 9);
    expect(20 * r.cost / r.fxCost).toBeCloseTo(usd, 9);
  });
  it('sin tipo de cambio conocido de alguna compra, queda desconocido', () => {
    expect(applyTrade({ sh: 10, cost: 1000 }, { type: 'buy', qty: 1, price: 1000, fx: 950 }).fxCost).toBe(null);
    expect(applyTrade({ sh: 10, cost: 1000, fxCost: 900 }, { type: 'buy', qty: 1, price: 1000 }).fxCost).toBe(null);
    expect(applyTrade(null, { type: 'buy', qty: 1, price: 1 }).fxCost).toBe(null);
  });
  it('una venta no cambia el tipo de cambio de la compra', () => {
    expect(applyTrade({ sh: 10, cost: 1000, fxCost: 900 }, { type: 'sell', qty: 4, price: 1100 })).toMatchObject({ action: 'update', sh: 6, cost: 1000, fxCost: 900 });
  });
});

describe('la app guarda y lee fx_at_cost (portfolio_holdings)', async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  const src = (sig) => { const i = html.indexOf(sig); return html.slice(i, html.indexOf('\n}\n', i) + 2); };

  it('rowToHolding lee fx_at_cost como fxCost (y null si no es positivo)', () => {
    const ctx = {}; vm.createContext(ctx);
    vm.runInContext(src('function rowToHolding(') + '\nthis.f = rowToHolding;', ctx);
    expect(ctx.f({ id: 1, ticker: 'SQM-B.SN', asset_type: 'Stock', shares: '100', avg_cost: '60000', fx_at_cost: '900' }).fxCost).toBe(900);
    expect(ctx.f({ id: 1, ticker: 'AAPL', asset_type: 'Stock', shares: '1', avg_cost: '1', fx_at_cost: null }).fxCost).toBe(null);
  });

  it('sbAddHolding manda fx_at_cost y reintenta sin él si la columna no existe', async () => {
    const calls = [];
    const sb = { from: () => ({ insert: (row) => { calls.push({ ...row }); return { select: () => ({ single: async () => (calls.length === 1 ? { error: { message: 'column "fx_at_cost" does not exist' } } : { data: { id: 7 } }) }) }; } }) };
    const ctx = { S: { demoMode: false, user: { id: 'u' } }, sb, HOLDINGS_STOP: false, HOLDINGS_FX: true, console };
    vm.createContext(ctx);
    vm.runInContext(src('function _isFxColumnError(') + '\n' + src('async function sbAddHolding(') + '\nthis.f = sbAddHolding;', ctx);
    expect(await ctx.f({ t: 'SQM-B.SN', type: 'Stock', sh: 1, cost: 60000, fxCost: 900 })).toBe(7);
    expect(calls[0].fx_at_cost).toBe(900);
    expect('fx_at_cost' in calls[1]).toBe(false);
  });

  it('fxCostNote informa el efecto y las posiciones sin tipo de cambio de compra', () => {
    const ctx = { money: (v) => (v < 0 ? '-' : '+') + '$' + Math.abs(Math.round(v)) }; vm.createContext(ctx);
    vm.runInContext(src('function fxCostNote(') + '\nthis.f = fxCostNote;', ctx);
    expect(ctx.f(-545, 1, 0)).toContain('incluye <span class="num">-$545</span> por la variación del tipo de cambio');
    expect(ctx.f(0, 0, 2)).toContain('2 posiciones en otra moneda no tienen el tipo de cambio de la compra');
    expect(ctx.f(0, 0, 0)).toBe('');
  });

  it('los totales se rotulan "Resultado no realizado"', () => {
    expect(html.match(/\['Resultado no realizado'/g).length).toBe(2);
  });
});
