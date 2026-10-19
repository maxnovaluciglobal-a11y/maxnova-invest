// D-04 / C-25 (auditoría 360, 19-oct-2026): PostHog en Invest sin correo ni datos personales.
// LEG-1, SEG-4 y VEN-4: la app hacía posthog.identify(id, {email, plan}) en cada login y alta,
// con persistencia en localStorage, mientras la política decía "anonimizado". Además la app
// traía un respaldo de desarrollo que mandaba tickers y la IP a un proxy CORS público.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { POSTHOG_OPTS, identify, scrubEvent } from '../app/lib/analytics.js';
import * as analytics from '../app/lib/analytics.js';

const html = readFileSync(resolve(__dirname, '../app/index.html'), 'utf8');
const vercel = readFileSync(resolve(__dirname, '../vercel.json'), 'utf8');
const between = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));
const has = (re) => re.test(html);
const fnSrc = (name) => { const i = html.indexOf('async function ' + name + '('); return html.slice(i, html.indexOf('\n}\n', i) + 2); };

const USER = { id: '0b3f6c1e-8d0a-4f5e-9a57-1c2f3e4d5a6b', email: 'ana.perez@example.com', name: 'Ana Pérez', plan: 'beta' };

describe('identify: solo el id interno de la cuenta', () => {
  it('manda un único argumento, el id, sin correo, nombre ni plan', () => {
    const ph = { identify: vi.fn() };
    expect(identify(ph, USER)).toBe(true);
    expect(ph.identify).toHaveBeenCalledTimes(1);
    expect(ph.identify.mock.calls[0]).toEqual([USER.id]);
    expect(JSON.stringify(ph.identify.mock.calls)).not.toMatch(/email|ana\.perez|Ana|beta/i);
  });
  it('sin id, sin usuario o sin PostHog no hace nada ni rompe', () => {
    const ph = { identify: vi.fn() };
    expect(identify(ph, { email: USER.email })).toBe(false);
    expect(identify(ph, null)).toBe(false);
    expect(identify(null, USER)).toBe(false);
    expect(identify({}, USER)).toBe(false);
    expect(ph.identify).not.toHaveBeenCalled();
  });
});

describe('trackIdentify de app/index.html (el código real)', () => {
  const src = html.slice(html.indexOf('function trackIdentify('), html.indexOf('// Observabilidad: registra fallos de API/red'));
  function run(user) {
    const ph = { identify: vi.fn() };
    const ctx = { window: { posthog: ph }, InvestAnalytics: analytics };
    vm.createContext(ctx);
    vm.runInContext(src + '\nthis.trackIdentify = trackIdentify;', ctx);
    ctx.trackIdentify(user);
    return ph.identify.mock.calls;
  }
  it('al identificar solo viaja el id de la cuenta: sin email, sin nombre, sin plan', () => {
    const calls = run(USER);
    expect(calls).toEqual([[USER.id]]);
    expect(JSON.stringify(calls)).not.toMatch(/email|ana\.perez|Ana P|beta/i);
  });
  it('el código fuente no vuelve a pasar propiedades a identify', () => {
    expect(has(/\.identify\(\s*user\.id\s*,/)).toBe(false);
    expect(has(/identify\([^)]*email/)).toBe(false);
  });
});

describe('opciones del SDK', () => {
  it('perfil solo para quien se identifica, sin guardar nada en el dispositivo', () => {
    expect(POSTHOG_OPTS.person_profiles).toBe('identified_only');
    expect(POSTHOG_OPTS.persistence).toBe('memory');
    expect(POSTHOG_OPTS.ip).toBe(false);
  });
  it('sin autocaptura, sin grabación de sesiones, sin mapas de calor, encuestas ni errores automáticos', () => {
    expect(POSTHOG_OPTS.autocapture).toBe(false);
    expect(POSTHOG_OPTS.capture_pageview).toBe(false);
    expect(POSTHOG_OPTS.disable_session_recording).toBe(true);
    expect(POSTHOG_OPTS.capture_heatmaps).toBe(false);
    expect(POSTHOG_OPTS.capture_dead_clicks).toBe(false);
    expect(POSTHOG_OPTS.capture_performance).toBe(false);
    expect(POSTHOG_OPTS.capture_exceptions).toBe(false);
    expect(POSTHOG_OPTS.disable_surveys).toBe(true);
    expect(POSTHOG_OPTS.advanced_disable_flags).toBe(true);
  });
  it('texto de campos enmascarado y respeta "No rastrear"', () => {
    expect(POSTHOG_OPTS.mask_all_text).toBe(true);
    expect(POSTHOG_OPTS.mask_all_element_attributes).toBe(true);
    expect(POSTHOG_OPTS.respect_dnt).toBe(true);
  });
  it('el último filtro de cada evento es scrubEvent', () => {
    expect(POSTHOG_OPTS.before_send).toBe(scrubEvent);
  });
  it('app/index.html inicia PostHog con esas opciones y carga la librería antes del script principal', () => {
    expect(has(/posthog\.init\(POSTHOG_KEY,\s*Object\.assign\(\{api_host:POSTHOG_HOST\},\s*InvestAnalytics\.POSTHOG_OPTS\)\)/)).toBe(true);
    expect(has(/persistence:\s*'localStorage'/)).toBe(false);
    const lib = html.indexOf('<script src="/app/lib/analytics.js"></script>');
    expect(lib).toBeGreaterThan(0);
    expect(lib).toBeLessThan(html.indexOf('var POSTHOG_KEY'));
  });
});

describe('scrubEvent', () => {
  const ev = () => ({
    event: '$identify',
    properties: {
      $current_url: 'https://invest.moyiq.app/app/?aporte=500#access_token=abc.def&refresh_token=xyz',
      $referrer: 'https://app.moyiq.app/app/?ref=1',
      $browser: 'Chrome',
      message: 'rechazado para ana.perez@example.com',
      module: 'dash',
      email: 'ana.perez@example.com',
    },
    $set: { email: 'ana.perez@example.com', name: 'Ana', plan: 'beta', $browser: 'Chrome' },
    $set_once: { $initial_current_url: 'https://invest.moyiq.app/app/#access_token=zzz', $initial_referrer: '$direct' },
  });
  it('quita correo, nombre y plan del evento y de lo que fija en la persona', () => {
    const s = scrubEvent(ev());
    expect(s.properties).not.toHaveProperty('email');
    expect(s.$set).toEqual({ $browser: 'Chrome' });
    expect(JSON.stringify(s)).not.toMatch(/ana\.perez|"name"|"plan"/);
  });
  it('las direcciones quedan en origen y ruta: sin token del #hash ni montos de la consulta', () => {
    const s = scrubEvent(ev());
    expect(s.properties.$current_url).toBe('https://invest.moyiq.app/app/');
    expect(s.properties.$referrer).toBe('https://app.moyiq.app/app/');
    expect(s.$set_once.$initial_current_url).toBe('https://invest.moyiq.app/app/');
    expect(JSON.stringify(s)).not.toMatch(/access_token|refresh_token|aporte/);
  });
  it('tacha un correo escrito dentro de un mensaje de error y deja el resto', () => {
    const s = scrubEvent(ev());
    expect(s.properties.message).toBe('rechazado para [correo]');
    expect(s.properties.module).toBe('dash');
    expect(s.$set_once.$initial_referrer).toBe('$direct');
  });
  it('pide a PostHog que no derive la ubicación de la IP', () => {
    expect(scrubEvent(ev()).properties.$geoip_disable).toBe(true);
  });
  it('un evento nulo pasa sin romper', () => {
    expect(scrubEvent(null)).toBe(null);
    expect(scrubEvent({ event: 'login' })).toEqual({ event: 'login' });
  });
});

describe('quien vuelve con la sesión abierta también se identifica (la persistencia es en memoria)', () => {
  it('boot() llama a onSessionReady después de cargar la cuenta y antes de pintar', () => {
    const boot = between('(async function boot(){', '// ── Retorno post-pago de Stripe');
    const load = boot.indexOf('await sbLoadUserData(sess.data.session.user);');
    const ready = boot.indexOf('onSessionReady()');
    expect(load).toBeGreaterThan(0);
    expect(ready).toBeGreaterThan(load);
    expect(ready).toBeLessThan(boot.indexOf('render();'));
  });
  it('la entrada de otra pestaña o de Google (SIGNED_IN) también llama a onSessionReady', () => {
    const cb = html.slice(html.indexOf('sb.auth.onAuthStateChange(function(event,session){'));
    expect(cb).toMatch(/sbLoadUserData\(session\.user\)\.then\(function\(\)\{\s*onSessionReady\(\);/);
  });
  it('onSessionReady identifica la cuenta en PostHog', () => {
    expect(between('function onSessionReady(){', '\n}\n')).toContain('trackIdentify(S.user)');
  });
});

describe('eventos sin datos de la cartera', () => {
  it('alert_triggered manda el tipo de alerta, no el activo', () => {
    expect(has(/track\('alert_triggered',\{type:a\.type\}\)/)).toBe(true);
    expect(has(/track\('alert_triggered',\{[^}]*asset/)).toBe(false);
  });
});

describe('sin proxies CORS de terceros', () => {
  it('ni la app ni la CSP nombran allorigins ni corsproxy', () => {
    expect(has(/allorigins|corsproxy/i)).toBe(false);
    expect(/allorigins|corsproxy/i.test(vercel)).toBe(false);
  });
  it('sin preconexión a jsDelivr (la app no carga nada de ahí)', () => {
    expect(has(/<link rel="preconnect" href="https:\/\/cdn\.jsdelivr\.net"/)).toBe(false);
  });
  it('sin /api (localhost) las consultas de mercado no salen a ningún tercero', async () => {
    const code = ['fetchQuote', '_fetchHistoryImpl', 'fetchEarningsData', 'deGetEarnings'].map(fnSrc).join('\n');
    const calls = [];
    const ctx = {
      _USE_EDGE: false, console, Date, JSON, encodeURIComponent, AbortSignal, dEarnCache: {},
      fetchStats: { ok: 0, fail: 0 },
      _cacheGet: () => null, _cacheSet: () => {},
      localStorage: { getItem: () => null, setItem: () => {} },
      fetchWithTimeout: async (url) => { calls.push(url); return { ok: false, status: 500 }; },
      fetch: async (url) => { calls.push(url); return { ok: false, status: 500 }; },
    };
    vm.createContext(ctx);
    vm.runInContext(code + '\nthis.fq = fetchQuote; this.fh = _fetchHistoryImpl; this.fe = deGetEarnings;', ctx);
    expect(await ctx.fq('AAPL')).toBe(null);
    expect(await ctx.fh('AAPL', '3mo')).toBe(null);
    expect((await ctx.fe('AAPL')).unavailable).toBe(true);
    expect(calls).toEqual([]);
  });
  it('con /api las tres consultas siguen yendo a la ruta propia', async () => {
    const code = ['fetchQuote', '_fetchHistoryImpl', 'fetchEarningsData', 'deGetEarnings'].map(fnSrc).join('\n');
    const calls = [];
    const day = (d) => ({ date: '2026-10-' + d, open: 1, high: 2, low: 1, close: 1.5, volume: 10 });
    const ctx = {
      _USE_EDGE: true, console, Date, JSON, encodeURIComponent,
      fetchStats: { ok: 0, fail: 0 },
      _cacheGet: () => null, _cacheSet: () => {},
      localStorage: { getItem: () => null, setItem: () => {} },
      fetchWithTimeout: async (url) => {
        calls.push(url);
        if (url.startsWith('/api/quote?')) return { ok: true, json: async () => ({ AAPL: { price: 190, prevClose: 188, change: 2, changePct: 0.01 } }) };
        if (url.startsWith('/api/history?')) return { ok: true, json: async () => ({ data: ['01', '02', '03', '04', '05', '06'].map(day) }) };
        return { ok: false, status: 404 };
      },
      AbortSignal, dEarnCache: {},
      fetch: async (url) => {
        calls.push(url);
        return { ok: true, json: async () => ({ ticker: 'AAPL', nextDate: '2026-10-29', nextEpsEst: 1.8, quarters: [], source: 'finnhub' }) };
      },
    };
    vm.createContext(ctx);
    vm.runInContext(code + '\nthis.fq = fetchQuote; this.fh = _fetchHistoryImpl; this.fe = deGetEarnings;', ctx);
    expect((await ctx.fq('AAPL')).price).toBe(190);
    expect((await ctx.fh('AAPL', '3mo')).length).toBe(6);
    const e = await ctx.fe('AAPL');
    expect(e.ticker).toBe('AAPL');
    expect(e.date.toISOString().slice(0, 10)).toBe('2026-10-29');
    expect(calls).toEqual([
      '/api/quote?ticker=AAPL',
      '/api/history?ticker=AAPL&range=3mo&interval=1d',
      '/api/earnings?ticker=AAPL',
    ]);
  });
});
