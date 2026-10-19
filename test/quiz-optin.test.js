// COM-7 / MKT-4: el quiz de perfil de inversor pide el correo de doble opt-in
// cuando la persona marca el consentimiento de marketing, sin bloquear el resultado.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const page = readFileSync(resolve(__dirname, '../perfil-inversor.html'), 'utf8');
const script = page.slice(page.lastIndexOf('<script>') + 8, page.lastIndexOf('</script>'));
const OPTIN_URL = 'https://nelwgbcddwiaimzbcuas.supabase.co/functions/v1/send-optin-confirmation';
const LEAD_ID = '11111111-2222-4333-8444-555555555555';

function res(status, body) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

function run({ consent, rpc, optin }) {
  const els = {};
  const el = (id) => (els[id] ||= {
    id, innerHTML: '', textContent: '', value: '', checked: false, disabled: false, hidden: false,
    style: {}, handlers: {},
    classList: { add() {}, remove() {} },
    setAttribute() {}, removeAttribute() {}, focus() {}, scrollIntoView() {},
    addEventListener(ev, fn) { this.handlers[ev] = fn; },
  });
  const calls = [];
  let optinQueue = Array.isArray(optin) ? optin.slice() : [optin];
  const fetchStub = (url, opts) => {
    calls.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null });
    if (url.includes('/rpc/register_invest_lead')) return rpc();
    if (url === OPTIN_URL) { const next = optinQueue.length > 1 ? optinQueue.shift() : optinQueue[0]; return next(); }
    return res(200, { ok: true });
  };
  const win = { location: { search: '' }, matchMedia: () => ({ matches: true }) };
  const doc = { getElementById: el, querySelectorAll: () => [], querySelector: () => null, referrer: '' };
  new Function('window', 'document', 'fetch', 'URL', 'URLSearchParams', script)(win, doc, fetchStub, URL, URLSearchParams);
  win.__investResult = { key: 'moderado', puntaje: 50 };
  el('gate-email').value = 'persona@ejemplo.com';
  el('gate-consent').checked = consent;
  el('gate-form').handlers.submit({ preventDefault() {} });
  return { els, el, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const okRpc = () => res(200, { ok: true, id: LEAD_ID });

describe('doble opt-in desde el quiz de Invest', () => {
  it('con consentimiento pide el correo de confirmación con source invest y el id del lead', async () => {
    const { el, calls } = run({ consent: true, rpc: okRpc, optin: () => res(200, { ok: true, state: 'sent' }) });
    await flush(); await flush();
    const optinCalls = calls.filter((c) => c.url === OPTIN_URL);
    expect(optinCalls).toHaveLength(1);
    expect(optinCalls[0].body).toEqual({ source: 'invest', id: LEAD_ID });
    expect(el('result').style.display).toBe('block');
    expect(el('optin-note').hidden).toBe(false);
    expect(el('optin-status').textContent).toMatch(/Te enviamos un correo para confirmar/);
  });

  it('sin consentimiento no pide el opt-in ni muestra aviso', async () => {
    const { el, calls } = run({ consent: false, rpc: okRpc, optin: () => res(200, { ok: true, state: 'sent' }) });
    await flush(); await flush();
    expect(calls.some((c) => c.url === OPTIN_URL)).toBe(false);
    expect(el('result').style.display).toBe('block');
    expect(el('optin-status').textContent).toBe('');
  });

  it('muestra el resultado aunque el envío del opt-in falle y explica el error', async () => {
    const { el } = run({ consent: true, rpc: okRpc, optin: () => Promise.reject(new Error('network')) });
    await flush(); await flush();
    expect(el('result').style.display).toBe('block');
    expect(el('optin-status').textContent).toMatch(/No pudimos enviar el correo de confirmación/);
    expect(el('optin-retry').hidden).toBe(false);
  });

  it('el resultado no espera la respuesta del opt-in', async () => {
    const { el } = run({ consent: true, rpc: okRpc, optin: () => new Promise(() => {}) });
    await flush(); await flush();
    expect(el('result').style.display).toBe('block');
  });

  it.each([
    [200, { ok: true, state: 'already_sent' }, /Ya te enviamos un correo para confirmar/],
    [200, { ok: true, state: 'already_confirmed' }, /ya está confirmada/],
    [429, { ok: false, error: 'rate_limited' }, /varios correos de confirmación/],
    [502, { ok: false, error: 'resend_error' }, /No pudimos enviar el correo de confirmación/],
    [404, { ok: false, error: 'not_found' }, /No pudimos enviar el correo de confirmación/],
  ])('estado %i %j', async (status, body, re) => {
    const { el } = run({ consent: true, rpc: okRpc, optin: () => res(status, body) });
    await flush(); await flush();
    expect(el('optin-status').textContent).toMatch(re);
  });

  it('el botón de reintento vuelve a pedir el correo', async () => {
    const { el, calls } = run({
      consent: true, rpc: okRpc,
      optin: [() => res(502, { ok: false, error: 'resend_error' }), () => res(200, { ok: true, state: 'sent' })],
    });
    await flush(); await flush();
    el('optin-retry').handlers.click();
    await flush(); await flush();
    expect(calls.filter((c) => c.url === OPTIN_URL)).toHaveLength(2);
    expect(el('optin-status').textContent).toMatch(/Te enviamos un correo para confirmar/);
    expect(el('optin-retry').hidden).toBe(true);
  });

  it('si no se pudo guardar el lead, avisa sin pedir el opt-in', async () => {
    const { el, calls } = run({ consent: true, rpc: () => res(200, { ok: false, error: 'rate_limited' }), optin: () => res(200, { ok: true, state: 'sent' }) });
    await flush(); await flush();
    expect(calls.some((c) => c.url === OPTIN_URL)).toBe(false);
    expect(el('result').style.display).toBe('block');
    expect(el('optin-status').textContent).toMatch(/No pudimos registrar tu suscripción/);
  });

  it('el texto no usa voseo', () => {
    const block = page.slice(page.indexOf('OPTIN_MESSAGES'), page.indexOf('OPTIN_MESSAGES') + 1500);
    expect(block).not.toMatch(/\b(revisá|intentá|podés|tenés|querés)\b/i);
  });
});
