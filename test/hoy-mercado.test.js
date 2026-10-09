// Reestructura v3, fase 4: Hoy y Mercado. Lee app/index.html.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(__dirname, '../app/index.html'), 'utf8');
const fnBody = (name) => {
  const a = html.indexOf('function ' + name + '(');
  if (a < 0) return '';
  const b = html.indexOf('\nfunction ', a + 10);
  return html.slice(a, b);
};

describe('Hoy', () => {
  const dash = fnBody('renderDash');
  it('existe y usa la banda de resumen de Posiciones', () => {
    expect(dash).toContain('class="pband"');
    expect(dash).toContain('dashRiskCard(');
    expect(dash).toContain('dashFocoCard(');
    expect(dash).toContain('dashTopPositions(');
    expect(dash).toContain('dashAporteCard()');
  });
  it('ya no lleva noticias, índices, mini-lista ni asignación', () => {
    for (const s of ['mercadoHoyBody', 'indicesCard', 'moversCard', 'dashWatchCard', 'dashAllocBar', 'resp2']) {
      expect(dash).not.toContain(s);
    }
  });
  it('"Mayores movimientos" desapareció de la app', () => {
    expect(html).not.toContain('Mayores movimientos');
    expect(html).not.toMatch(/function moversCard|function indicesCard|function dashWatchCard/);
  });
  it('Repartir valida en línea y calcula el reparto al llegar a Aportes', () => {
    const go = fnBody('aporteGo');
    expect(go).toContain('aporte-err');
    expect(go).toContain("setPage('capital')");
    expect(go).toContain('loadCapitalData()');
    expect(go).not.toContain('showToast');
  });
});

describe('Mercado', () => {
  const mk = fnBody('renderMercado');
  it('ya no delega en el motor viejo', () => {
    expect(mk).not.toContain('renderDecisionEngineBody');
    expect(mk).toContain('mktIndicesHtml()');
    expect(mk).toContain('mktNewsHtml()');
  });
  it('los índices de la cinta vienen en español', () => {
    for (const n of ['S&P 500', 'Dow 30', 'Nasdaq', 'Russell 2000', 'Petróleo (WTI)', 'Oro', 'Plata', 'Euro/dólar', 'Bono EE. UU. 10 años', 'Bitcoin']) {
      expect(html).toContain(`'${n}']`);
    }
    expect(html).not.toMatch(/'Crude Oil'|'10-Yr Bond'|'Russell 2K'/);
  });
  it('el tono de una noticia tiene respaldo para valores desconocidos', () => {
    const NEWS_IMPACT = { bullish: 'tono positivo', bearish: 'tono negativo', critical: 'urgente' };
    // eslint-disable-next-line no-new-func
    const f = new Function('NEWS_IMPACT', fnBody('newsImpactLabel') + '\nreturn newsImpactLabel;')(NEWS_IMPACT);
    expect(f('medio')).toBe('');
    expect(f(undefined)).toBe('');
    expect(f('bearish')).toBe('tono negativo');
    expect(html).not.toMatch(/impLabel\[/);
  });
  it('las categorías de noticias están en español', () => {
    for (const c of ['Reserva Federal', 'Resultados', 'Geopolítica', 'Macro', 'IA y tecnología']) expect(html).toContain(`'${c}']`);
    expect(fnBody('mktNewsHtml')).not.toMatch(/Bullish|Bearish|BREAKING|favicons/);
  });
  it('sin SMA200 ni "VIX Normal" en los rótulos nuevos', () => {
    const ctx = fnBody('mktCtxHtml');
    expect(ctx).not.toMatch(/SMA200|SMA50/);
    expect(html).not.toContain("'VIX Normal'");
  });
});
