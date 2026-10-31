// Entrada desde MOY IQ (módulo Inversiones): token de un solo uso en el fragmento.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFragment, plan, aporteUsd, capture } from '../app/lib/handoff.js';

const html = readFileSync(resolve(__dirname, '../app/index.html'), 'utf8');
const TOKEN = 'a'.repeat(56);
const UID = '11111111-2222-3333-4444-555555555555';

describe('parseFragment', () => {
  it('lee token, cuenta y aporte', () => {
    expect(parseFragment(`#handoff=${TOKEN}&uid=${UID}&aporte=150000&ccy=CLP&n=2&usd=157.89`)).toEqual({
      token: TOKEN, uid: UID, aporte: { amount: 150000, ccy: 'CLP', n: 2, usd: 157.89 },
    });
  });
  it('un fragmento ajeno no se toca', () => {
    expect(parseFragment('')).toBeNull();
    expect(parseFragment('#access_token=abc&type=recovery')).toBeNull();
  });
  it('descarta valores que no tienen la forma esperada', () => {
    const r = parseFragment('#handoff=<script>&uid=x&aporte=-5');
    expect(r).toEqual({ token: null, uid: null, aporte: null });
    expect(parseFragment(`#handoff=${TOKEN}&aporte=10&ccy=<b>&n=9999`).aporte).toEqual({ amount: 10, ccy: null, n: 1, usd: null });
    expect(parseFragment(`#aporte=Infinity`).aporte).toBeNull();
  });
  it('el aporte puede venir sin token', () => {
    expect(parseFragment('#aporte=25&ccy=USD&n=1')).toMatchObject({ token: null, aporte: { amount: 25 } });
  });
});

describe('plan', () => {
  it('sin sesión, canjea', () => { expect(plan(null, UID)).toBe('verify'); });
  it('misma cuenta, no hace falta', () => { expect(plan(UID, UID)).toBe('skip'); });
  it('otra cuenta, cambia', () => { expect(plan('otra', UID)).toBe('switch'); });
  it('sin saber de quién es, conserva la sesión', () => { expect(plan('otra', null)).toBe('skip'); });
});

describe('aporteUsd', () => {
  const toUsd = (v, c) => (c === 'CLP' ? v / 950 : null);
  it('prefiere el monto en USD que calculó MOY IQ', () => {
    expect(aporteUsd({ amount: 9500, ccy: 'CLP', usd: 11 }, toUsd)).toBe(11);
  });
  it('USD va directo', () => { expect(aporteUsd({ amount: 10, ccy: 'USD' }, toUsd)).toBe(10); });
  it('convierte con la tasa de Invest', () => { expect(aporteUsd({ amount: 9500, ccy: 'CLP' }, toUsd)).toBe(10); });
  it('sin tasa no inventa: nunca 1:1', () => {
    expect(aporteUsd({ amount: 10, ccy: 'VES' }, toUsd)).toBeNull();
    expect(aporteUsd({ amount: 10, ccy: null }, toUsd)).toBeNull();
    expect(aporteUsd(null, toUsd)).toBeNull();
  });
});

describe('capture', () => {
  const win = (hash) => ({
    location: { hash, pathname: '/app/', search: '?x=1' },
    history: { state: null, replaceState: vi.fn() },
  });
  it('saca el token de la URL', () => {
    const w = win(`#handoff=${TOKEN}&uid=${UID}`);
    expect(capture(w).token).toBe(TOKEN);
    expect(w.history.replaceState).toHaveBeenCalledWith(null, '', '/app/?x=1');
  });
  it('también limpia un token inválido', () => {
    const w = win('#handoff=corto');
    expect(capture(w).token).toBeNull();
    expect(w.history.replaceState).toHaveBeenCalled();
  });
  it('deja en paz los enlaces de Auth', () => {
    const w = win('#access_token=abc');
    expect(capture(w)).toBeNull();
    expect(w.history.replaceState).not.toHaveBeenCalled();
  });
});

describe('integración en app/index.html', () => {
  const pos = (s) => html.indexOf(s);
  it('handoff.js carga antes que Supabase y PostHog', () => {
    expect(pos('src="/app/lib/handoff.js"')).toBeGreaterThan(0);
    expect(pos('src="/app/lib/handoff.js"')).toBeLessThan(pos('src="/vendor-supabase.js"'));
    expect(pos('src="/app/lib/handoff.js"')).toBeLessThan(pos('window.posthog.init('));
  });
  it('canjea con verifyOtp antes del arranque normal', () => {
    const boot = html.slice(html.indexOf('(async function boot(){'));
    expect(html).toContain("sb.auth.verifyOtp({token_hash:h.token,type:'magiclink'})");
    expect(boot.indexOf('await consumeHandoff()')).toBeLessThan(boot.indexOf('sb.auth.getSession()'));
    expect(boot.indexOf('await consumeHandoff()')).toBeGreaterThan(0);
  });
  it('cambia de cuenta solo en este navegador: un signOut global cerraría MOY IQ', () => {
    const fn = html.slice(html.indexOf('async function consumeHandoff'), html.indexOf('// ── STARTUP'));
    expect(fn).toContain("sb.auth.signOut({scope:'local'})");
    expect(fn).not.toMatch(/sb\.auth\.signOut\(\)/);
  });
  it('el listener de sesión no recarga en medio del canje', () => {
    const start = html.indexOf('sb.auth.onAuthStateChange(function(event,session){');
    expect(html.slice(start, start + 120)).toContain('if(_handoffBusy) return;');
  });
  it('el token no se escribe en un evento ni en la consola', () => {
    const fn = html.slice(html.indexOf('async function consumeHandoff'), html.indexOf('// ── STARTUP'));
    expect(fn).not.toMatch(/track\([^)]*token/);
    expect(fn).not.toMatch(/console\./);
  });
  it('nada se guarda sin que la persona lo pida: el aviso solo escribe en "Ir a Aportes"', () => {
    const banner = html.slice(html.indexOf('function handoffAporteBanner'), html.indexOf('function handoffAporteClose'));
    expect(banner).not.toContain('setAporte');
    const close = html.slice(html.indexOf('function handoffAporteClose'), html.indexOf('function handoffAporteGo'));
    expect(close).not.toContain('setAporte');
  });
  it('la vuelta a MOY IQ entra a la app, no a la landing', () => {
    expect(html).not.toMatch(/href[=:]["']https:\/\/app\.moyiq\.app["']/);
    expect(html.match(/https:\/\/app\.moyiq\.app\/app\//g).length).toBeGreaterThanOrEqual(3);
  });
});
