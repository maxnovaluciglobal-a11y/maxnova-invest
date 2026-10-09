// Fase 3: Lista (Mi lista, Descubrir, Comparar) y ficha del activo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(__dirname, '../app/index.html'), 'utf8');
const between = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));

describe('Lista y ficha (fase 3)', () => {
  it('Descubrir: una sola fila de 6 presets con texto, sin banderas emoji', () => {
    const presets = between('var SCR_PRESETS=[', '];');
    const labels = [...presets.matchAll(/\['[a-z]+','([^']+)'/g)].map(m => m[1]);
    expect(labels).toEqual(['EE. UU.', 'ETF', 'LatAm ADR', 'Brasil', 'México', 'Chile']);
    expect(presets).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
  });
  it('Descubrir no permite corridas simultaneas', () => {
    expect(between('function screenerRun(){', '\n}\n')).toContain('if(S.screenerRunning) return;');
  });
  it('Mi lista no tiene chips fijos ni el campo CUSTOM', () => {
    const w = between('function renderWatch(){', '// ── LISTA › ALERTAS');
    expect(w).not.toMatch(/Custom|CUSTOM|wtag/);
    expect(w).toContain('Seguir un activo');
  });
  it('Comparar en español, sin "head-to-head" ni ticker "NEW" vacío', () => {
    const c = between('function renderCompSection(){', 'async function compLoad(){');
    expect(c).not.toMatch(/head-to-head|Benchmark|Performance|Sharpe ratio/);
    expect(c).toMatch(/Rendimiento \(base 0[ \u202f]%\)/);
    expect(c).toContain('Referencia: SPY');
    expect(between('function compAddTicker(){', '\n}\n')).not.toContain('"NEW"');
  });
  it('la ficha no inventa la bolsa (sin "NASDAQ" por defecto)', () => {
    expect(between('function renderDrawerHead(', '\n}\n')).not.toContain('NASDAQ');
  });
});
