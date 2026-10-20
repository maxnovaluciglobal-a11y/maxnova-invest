// Limpieza #2 (parte Invest, 20-oct-2026): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
// STRIPE_PRICE_INVEST_PRO y STRIPE_PRICE_INVEST_PRO_ANNUAL se quitan de Vercel. Con el cobro
// pausado ninguna API las lee: importar cada módulo y atender un pedido no toca esas
// variables, y el webhook sigue respondiendo 200 a Stripe (si respondiera 500, Stripe
// acumularía fallos y deshabilitaría el endpoint).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const STRIPE_VARS = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_INVEST_PRO', 'STRIPE_PRICE_INVEST_PRO_ANNUAL'];
let realEnv, reads, realFetch;
beforeEach(() => {
  realEnv = process.env; reads = [];
  const base = { ...realEnv, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'service' };
  for (const k of STRIPE_VARS) delete base[k];
  process.env = new Proxy(base, { get(t, k) { if (typeof k === 'string' && k.startsWith('STRIPE_')) reads.push(k); return t[k]; } });
  realFetch = globalThis.fetch;
});
afterEach(() => { process.env = realEnv; globalThis.fetch = realFetch; });
const load = async (n) => { vi.resetModules(); return (await import(`../api/${n}.js`)).default; };

describe('sin variables de Stripe en Invest', () => {
  it('stripe-webhook responde 200 "billing_paused" sin leer el secreto', async () => {
    const h = await load('stripe-webhook');
    const res = await h(new Request('https://invest.moyiq.app/api/stripe-webhook', { method: 'POST', body: '{}', headers: { 'stripe-signature': 't=1,v1=x' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, ignored: 'billing_paused' });
    expect(reads).toEqual([]);
  });
  it.each(['create-checkout', 'billing-portal'])('%s sigue en 410 sin leer variables de Stripe', async (n) => {
    const h = await load(n);
    const res = await h(new Request('https://invest.moyiq.app/api/' + n, { method: 'POST', body: '{}', headers: { origin: 'https://invest.moyiq.app' } }));
    expect(res.status).toBe(410);
    expect(reads).toEqual([]);
  });
  it('delete-account borra los datos de Invest y no intenta cancelar en Stripe', async () => {
    const calls = [];
    globalThis.fetch = vi.fn(async (u, o = {}) => {
      calls.push(String(u));
      if (String(u).includes('/auth/v1/user')) return new Response(JSON.stringify({ id: '11111111-1111-1111-1111-111111111111' }), { status: 200 });
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const h = await load('delete-account');
    const res = await h(new Request('https://invest.moyiq.app/api/delete-account', { method: 'POST', body: JSON.stringify({ token: 'jwt' }), headers: { origin: 'https://invest.moyiq.app', 'Content-Type': 'application/json' } }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.steps.find((s) => s.step === 'stripe_subscription_cancel')).toMatchObject({ ok: null, skipped: true, reason: 'billing_paused' });
    expect(calls.some((u) => u.includes('stripe.com'))).toBe(false);
    expect(reads).toEqual([]);
  });
});
