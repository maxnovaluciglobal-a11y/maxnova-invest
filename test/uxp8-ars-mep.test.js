// UXP-8: dólar MEP para Argentina (DolarApi) con selector Oficial / MEP, MEP por defecto,
// fuente y hora visibles, caché de 3 h en el edge y vuelta al oficial si falla.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { arsRate, convertHoldings, portfolioTotals } from '../app/lib/fx.js';
import { parseDolar } from '../api/_lib/dolarapi.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const MEP = { moneda: 'USD', casa: 'bolsa', nombre: 'Bolsa', compra: 1536.7, venta: 1544.1, fechaActualizacion: '2026-10-19T21:00:00.000Z' };
const OFI = { moneda: 'USD', casa: 'oficial', nombre: 'Oficial', compra: 1490, venta: 1540, fechaActualizacion: '2026-10-19T18:00:00.000Z' };

describe('parseDolar', () => {
  it('usa la venta como tasa y conserva compra y fecha', () => {
    expect(parseDolar(MEP)).toEqual({ rate: 1544.1, buy: 1536.7, sell: 1544.1, date: '2026-10-19T21:00:00.000Z' });
  });
  it('sin venta válida no hay dato', () => {
    for (const d of [null, {}, { venta: 0 }, { venta: -5 }, { venta: 'abc' }]) expect(parseDolar(d)).toBeNull();
  });
  it('sin fecha legible, date null (nunca se inventa una hora)', () => {
    expect(parseDolar({ venta: 1500, compra: 1490, fechaActualizacion: 'x' }).date).toBeNull();
  });
});

describe('arsRate', () => {
  const mep = { rate: 1544.1, date: '2026-10-19T21:00:00.000Z' };
  it('MEP por defecto cuando hay dato', () => {
    expect(arsRate('MEP', mep, 1510)).toEqual({ rate: 1544.1, kind: 'MEP', fallback: false, date: mep.date });
    expect(arsRate(undefined, mep, 1510).kind).toBe('MEP');
  });
  it('Oficial cuando se elige', () => {
    expect(arsRate('Oficial', mep, 1510)).toEqual({ rate: 1510, kind: 'Oficial', fallback: false, date: null });
  });
  it('sin MEP vuelve al oficial y lo marca', () => {
    expect(arsRate('MEP', null, 1510)).toEqual({ rate: 1510, kind: 'Oficial', fallback: true, date: null });
    expect(arsRate('MEP', { rate: 0 }, 1510).kind).toBe('Oficial');
  });
  it('sin oficial y con MEP, usa el MEP marcado como respaldo; sin ninguno, null', () => {
    expect(arsRate('Oficial', mep, null)).toMatchObject({ rate: 1544.1, kind: 'MEP', fallback: true });
    expect(arsRate('MEP', null, null)).toBeNull();
  });
});

describe('cifras con el MEP', () => {
  it('USD 1.000 se ven como ARS 1.544.100 con el MEP y 1.510.000 con el oficial', () => {
    expect(1000 * arsRate('MEP', { rate: 1544.1 }, 1510).rate).toBeCloseTo(1544100, 6);
    expect(1000 * arsRate('Oficial', { rate: 1544.1 }, 1510).rate).toBeCloseTo(1510000, 6);
  });
  it('una posición de .BA vuelve a su monto en pesos (ida a USD y vuelta con la misma tasa)', () => {
    const r = arsRate('MEP', { rate: 1544.1 }, 1510).rate;
    const port = [{ t: 'GGAL.BA', sh: 100, cost: 5000, cur: 6176.4 }];
    const { rows } = convertHoldings(port, () => 'ARS', { ARS: r });
    expect(rows[0].cur).toBeCloseTo(4, 10); // 6176,4 / 1544,1 = USD 4
    expect(rows[0].cur * r * 100).toBeCloseTo(617640, 6);
    const tot = portfolioTotals(port, () => ({ price: 6176.4, changePct: 0 }), () => 'ARS', { ARS: r });
    expect(tot.value).toBeCloseTo(400, 10);
    expect(tot.cost).toBeCloseTo(500000 / 1544.1, 10);
  });
});

describe('/api/fx-ars', () => {
  let realFetch, calls;
  const load = async () => { vi.resetModules(); return (await import('../api/fx-ars.js')).default; };
  const req = (origin) => new Request('https://invest.moyiq.app/api/fx-ars', origin ? { headers: { origin } } : {});
  beforeEach(() => { realFetch = globalThis.fetch; calls = []; });
  afterEach(() => { globalThis.fetch = realFetch; });

  it('devuelve MEP y oficial de DolarApi, con la fuente y 3 h de caché en el edge', async () => {
    globalThis.fetch = vi.fn(async (u) => { calls.push(String(u)); return String(u).endsWith('/bolsa') ? json(MEP) : json(OFI); });
    const res = await (await load())(req('https://invest.moyiq.app'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(calls.sort()).toEqual(['https://dolarapi.com/v1/dolares/bolsa', 'https://dolarapi.com/v1/dolares/oficial']);
    expect(body.mep).toEqual({ rate: 1544.1, buy: 1536.7, sell: 1544.1, date: '2026-10-19T21:00:00.000Z' });
    expect(body.oficial.rate).toBe(1540);
    expect(body.source).toBe('DolarApi (dolarapi.com)');
    expect(body.sourceUrl).toBe('https://dolarapi.com');
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=10800, stale-while-revalidate=21600');
  });
  it('si DolarApi falla responde mep null con caché corta (la app usa el oficial)', async () => {
    globalThis.fetch = vi.fn(async () => json({}, 503));
    const res = await (await load())(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.mep).toBeNull();
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=300');
  });
  it('un Origin ajeno recibe 403 sin llamar a DolarApi', async () => {
    globalThis.fetch = vi.fn();
    const res = await (await load())(req('https://evil.example'));
    expect(res.status).toBe(403);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('app y textos', () => {
  const app = read('app/index.html');
  it('MEP por defecto, selector Oficial / MEP solo con cifras en ARS, fuente y hora visibles', () => {
    expect(app).toContain("localStorage.getItem('mv_ars_kind')==='Oficial'?'Oficial':'MEP'");
    expect(app).toContain("if(USER_CURRENCY==='ARS') return arsNote();");
    expect(app).toContain('aria-label="Tipo de cambio del peso argentino"');
    expect(app).toContain("['Oficial','MEP']");
    expect(app).toContain('fuente: DolarApi (dolarapi.com)');
    expect(app).toContain('El dólar MEP no está disponible ahora: se usa el oficial.');
    expect(app).toContain("fetchWithTimeout('/api/fx-ars',6000)");
  });
  it('la FAQ ya no dice que el MEP no está disponible', () => {
    for (const f of ['faq.html', 'index.html']) {
      const s = read(f);
      expect(s).not.toContain('el dólar MEP todavía no está disponible');
      expect(s.match(/puedes elegir el dólar MEP/g)).toHaveLength(2);
    }
  });
  it('Datos y licencias cita DolarApi como pide su página de uso', () => {
    expect(read('datos-y-licencias.html')).toContain('DolarApi https://dolarapi.com');
  });
  it('la llamada va por el servidor: la CSP no abre dolarapi.com al navegador', () => {
    expect(read('vercel.json')).not.toContain('dolarapi');
  });
});
