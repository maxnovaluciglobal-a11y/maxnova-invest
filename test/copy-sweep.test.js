// Barrido de copy (reestructura v3, fase 5). Extrae el texto visible de
// app/index.html: nodos de texto del HTML, y de cada literal de string del JS
// el texto entre etiquetas más title/aria-label/placeholder/alt. Así no se
// confunden identificadores de código (S.portfolio, 'watchlist' como tabla)
// con texto de la interfaz. Los valores de código de una sola palabra que no
// se muestran van en ALLOWED.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseAst } from 'rollup/parseAst';

const html = readFileSync(resolve(__dirname, '../app/index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

function htmlText(src) {
  return src.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]*>/g, '\n').split('\n').map(x => x.trim()).filter(Boolean);
}
function jsStrings(src) {
  const out = [];
  const re = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(src))) {
    let ast; try { ast = parseAst(m[1]); } catch { continue; }
    (function walk(n) {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n.type === 'Literal' && typeof n.value === 'string') out.push(n.value);
      if (n.type === 'TemplateElement') out.push(n.value.cooked || '');
      for (const k in n) if (k !== 'type' && k !== 'start' && k !== 'end') walk(n[k]);
    })(ast);
  }
  return out;
}
function visible(str) {
  const vis = [];
  str.replace(/(?:title|aria-label|placeholder|alt)="([^"]*)"/g, (_, x) => { vis.push(x); return ''; });
  str.replace(/<[^>]*>?/g, '\n').replace(/^[^<]*>/, '').split('\n').forEach(x => { x = x.trim(); if (x) vis.push(x); });
  return vis;
}
const texts = htmlText(html).concat(...jsStrings(html).map(visible));
const ALLOWED = new Set(['Earnings', 'Free', 'Teams', 'Trial', 'Pro', 'watchlist', 'ALL', 'Stock', 'Crypto',
  'Vanguard Total Stock Market', 'iShares 20+ Year Treasury', 'Health Care Select Sector']);
const shown = texts.filter(t => t.length > 1 && !ALLOWED.has(t));
const offenders = (re) => [...new Set(shown.filter(t => re.test(t)))];

describe('barrido de copy', () => {
  it('extrae una cantidad razonable de texto', () => {
    expect(shown.length).toBeGreaterThan(1000);
  });
  it('sin palabras de interfaz en inglés', () => {
    const re = /\b(portfolio|watchlist|Earnings|Performance|Win rate|WIN RATE|Profit factor|Drawdown|Equity curve|Buy|Sell|Custom|Shares|Benchmark|head-to-head|Market Movers|Screener|Export CSV|Quick fill|Stop Loss|Fundamentals|Upgrade|Dashboard|Bullish|Bearish|Loading|Settings|Password|Search|Overbought|Oversold|Breaking|BREAKING|Watch)\b/;
    expect(offenders(re)).toEqual([]);
  });
  it('sin voseo ni signos de exclamación', () => {
    expect(offenders(/\b(sos|tenés|podés|querés|hacé|mirá|elegí|probá|ingresá|escribí|tocá|buscá|seguí|agregá|fijate|andá|vení)\b/i)).toEqual([]);
    expect(offenders(/[¡!](?!=)/).filter(t => !/!==?|!\w/.test(t))).toEqual([]);
  });
  it('sin prefijos "//" ni barras de título', () => {
    expect(offenders(/^\/\/|▍/)).toEqual([]);
  });
  it('sin glifos unicode como íconos', () => {
    expect(offenders(/[⚠✅✓✗✔✘▲▼★☆●○◷↻↗↘→←↩⌨⊕⋮▸▾]/u)).toEqual([]);
  });
  it('sin rótulos en mayúsculas con espaciado (salvo siglas)', () => {
    const caps = shown.filter(t => /^[A-ZÁÉÍÓÚÑ ]{8,}$/.test(t) && t.split(' ').length > 1 && t.split(' ').some(w => w.length > 5));
    expect(caps).toEqual([]);
  });
});
