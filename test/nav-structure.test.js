// Reestructura v3 (fase 1): 5 destinos en 2 niveles. Lee app/index.html y
// comprueba la configuracion de navegacion y el codigo del marco (barra
// lateral, buscador, barra inferior).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(__dirname, '../app/index.html'), 'utf8');
const shellStart = html.indexOf('// ── NAV SHELL');
const shellEnd = html.indexOf('// ── /NAV SHELL');
const shell = html.slice(shellStart, shellEnd);
const destBlock = shell.slice(shell.indexOf('var DEST=['), shell.indexOf('var DEST_ACCOUNT'));
const mobBar = shell.slice(shell.indexOf('function renderMobBar'), shell.indexOf('function updateMobTabs'));

describe('estructura de navegacion', () => {
  it('el marco existe en el archivo', () => {
    expect(shellStart).toBeGreaterThan(0);
    expect(shellEnd).toBeGreaterThan(shellStart);
  });

  it('tiene los 5 destinos, en orden', () => {
    const labels = [...destBlock.matchAll(/\{id:'[a-z]+',\s*label:'([^']+)'/g)].map(m => m[1]);
    expect(labels).toEqual(['Hoy', 'Portafolio', 'Lista', 'Planificar', 'Mercado']);
  });

  it('tiene las pestañas decididas', () => {
    for (const t of ['Posiciones', 'Movimientos', 'Dividendos', 'Objetivos', 'Mi lista', 'Alertas', 'Descubrir', 'Comparar', 'Calculadora', 'Aportes']) {
      expect(destBlock).toContain(`label:'${t}'`);
    }
  });

  it('los rotulos viejos ya no son rotulos de navegacion', () => {
    for (const old of ['Investigar', 'Analizar', 'Decidir', 'Seguir', 'Panorama']) {
      expect(destBlock).not.toContain(old);
      expect(html).not.toMatch(new RegExp(`label:\\s*['"]${old}['"]`));
    }
    expect(html).not.toContain('var NAV_C=');
  });

  it('la barra inferior no tiene "Más" ni menu hamburguesa', () => {
    expect(mobBar).not.toMatch(/M[aá]s/);
    expect(html).not.toContain('id="mbt-more"');
    expect(html).not.toContain('class="hbg-btn"');
    expect(html).toMatch(/<nav id="mob-tab-bar"[^>]*><\/nav>/);
  });

  it('cada id viejo tiene su hoja nueva', () => {
    for (const alias of ["news:'dash'", "back:'bitacora'", "sig:'watch'", "ind:'watch'", "sentiment:'decision'", "radar:'decision'"]) {
      expect(shell).toContain(alias);
    }
  });

  it('el marco no usa anglicismos ni voseo en textos visibles', () => {
    const strings = [...shell.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'/g)].map(m => m[1]).join('\n');
    expect(strings).not.toMatch(/watchlist|portfolio\b/i);
    expect(strings).not.toMatch(/¡/);
    expect(strings).not.toMatch(/\b(sos|tenés|podés|querés|buscá|seguí)\b/i);
  });
});
