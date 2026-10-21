// SEG-1 / SEG-7: turnstile.js (copia del de financeos-landing), CSP y login de /app.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const TS = createRequire(import.meta.url)('../turnstile.js');
const read = (f) => readFileSync(resolve(__dirname, '..', f), 'utf8');

describe('Turnstile en Invest', () => {
  it('la site key es pública (forma 0x4AAAAAA…) o vacía', () => {
    expect(TS.SITE_KEY === '' || /^0x4AAAAAA[A-Za-z0-9_-]{10,}$/.test(TS.SITE_KEY)).toBe(true);
    expect(TS.LEAD_SUBMIT_URL).toBe('https://nelwgbcddwiaimzbcuas.supabase.co/functions/v1/lead-submit');
  });
  it('la CSP deja cargar api.js y el iframe de challenges.cloudflare.com', () => {
    const v = JSON.parse(read('vercel.json'));
    const csp = v.headers.find((h) => h.source === '/(.*)').headers.find((h) => h.key === 'Content-Security-Policy').value;
    const dir = (n) => (csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(n + ' ')) || '').split(/\s+/).slice(1);
    expect(dir('script-src')).toContain('https://challenges.cloudflare.com');
    expect(dir('frame-src')).toEqual(['https://challenges.cloudflare.com']);
  });
  it('el login de /app manda captchaToken en signIn, signUp y reset (SEG-7)', () => {
    const app = read('app/index.html');
    expect(app).toContain('<script src="/turnstile.js"></script>');
    expect(app).toMatch(/signInWithPassword\(ltok\?\{email:e,password:p,options:\{captchaToken:ltok\}\}/);
    expect(app).toMatch(/sb\.auth\.signUp\(\{email:e,password:p,options:invWithCaptcha\(/);
    expect(app).toMatch(/resetPasswordForEmail\(email,invWithCaptcha\(/);
  });
  it('el quiz carga turnstile.js antes de su script', () => {
    const page = read('perfil-inversor.html');
    expect(page.indexOf('<script src="/turnstile.js"></script>')).toBeGreaterThan(-1);
    expect(page.indexOf('<script src="/turnstile.js"></script>')).toBeLessThan(page.lastIndexOf('<script>'));
  });
});
