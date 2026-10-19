// C-10 / INV-3 (auditoría 360, 19-oct-2026): medir los usuarios activos por semana de Invest para el
// checkpoint del 5-nov (disparador de cobro: 100 WAU). Antes no se podía: login y `profiles` se
// comparten con MOY IQ. Una llamada por cuenta, por día y por dispositivo a invest_record_activity().
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { recordActivity, utcDay } from '../app/lib/activity.js';

const read = (f) => readFileSync(resolve(__dirname, '..', f), 'utf8');
const html = read('app/index.html');
const has = (re) => re.test(html);
const mem = () => { const m = {}; return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
const DAY1 = Date.UTC(2026, 9, 19, 14, 0, 0);
const DAY2 = Date.UTC(2026, 9, 20, 0, 5, 0);
const U1 = '0b3f6c1e-8d0a-4f5e-9a57-1c2f3e4d5a6b';
const U2 = '9c2d1e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f';
const okSb = () => ({ rpc: vi.fn(() => Promise.resolve({ data: null, error: null })) });

describe('utcDay', () => {
  it('es la fecha UTC (la misma que usa el servidor)', () => {
    expect(utcDay(Date.UTC(2026, 9, 19, 23, 59))).toBe('2026-10-19');
    expect(utcDay(Date.UTC(2026, 9, 20, 0, 0))).toBe('2026-10-20');
  });
});

describe('recordActivity', () => {
  it('llama una vez a invest_record_activity y no manda cuenta ni día (los pone el servidor)', async () => {
    const sb = okSb(), st = mem();
    expect(await recordActivity(sb, U1, st, DAY1)).toBe('saved');
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(sb.rpc.mock.calls[0]).toEqual(['invest_record_activity']);
    expect(st.m['inv_act_' + U1]).toBe('2026-10-19');
  });
  it('el mismo día y el mismo dispositivo no repite el pedido', async () => {
    const sb = okSb(), st = mem();
    await recordActivity(sb, U1, st, DAY1);
    expect(await recordActivity(sb, U1, st, DAY1 + 3600e3)).toBe('cached');
    expect(sb.rpc).toHaveBeenCalledTimes(1);
  });
  it('al día siguiente vuelve a registrar', async () => {
    const sb = okSb(), st = mem();
    await recordActivity(sb, U1, st, DAY1);
    expect(await recordActivity(sb, U1, st, DAY2)).toBe('saved');
    expect(sb.rpc).toHaveBeenCalledTimes(2);
  });
  it('otra cuenta en el mismo dispositivo registra la suya', async () => {
    const sb = okSb(), st = mem();
    await recordActivity(sb, U1, st, DAY1);
    expect(await recordActivity(sb, U2, st, DAY1)).toBe('saved');
    expect(sb.rpc).toHaveBeenCalledTimes(2);
  });
  it('dos disparos a la vez (arranque y SIGNED_IN) hacen un solo pedido', async () => {
    const sb = okSb(), st = mem();
    const [a, b] = await Promise.all([recordActivity(sb, U1, st, DAY1), recordActivity(sb, U1, st, DAY1)]);
    expect([a, b]).toEqual(['saved', 'saved']);
    expect(sb.rpc).toHaveBeenCalledTimes(1);
  });
  describe('sin ruido ni roturas', () => {
    let spy;
    beforeEach(() => { spy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
    afterEach(() => { spy.mockRestore(); });
    it('si Supabase responde con error no guarda el día (se reintenta) y no escribe en la consola', async () => {
      const sb = { rpc: vi.fn(() => Promise.resolve({ error: { code: '42501', message: 'x' } })) }, st = mem();
      expect(await recordActivity(sb, U1, st, DAY1)).toBe('error');
      expect(st.m).toEqual({});
      expect(spy).not.toHaveBeenCalled();
    });
    it('si el pedido se cae (red) devuelve error sin lanzar', async () => {
      const sb = { rpc: vi.fn(() => Promise.reject(new Error('Failed to fetch'))) };
      expect(await recordActivity(sb, U1, mem(), DAY1)).toBe('error');
      const sb2 = { rpc: vi.fn(() => { throw new Error('boom'); }) };
      expect(await recordActivity(sb2, U1, mem(), DAY1)).toBe('error');
    });
    it('sin almacenamiento (modo privado) igual registra y no lanza', async () => {
      const sb = okSb();
      const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
      expect(await recordActivity(sb, U1, broken, DAY1)).toBe('saved');
      expect(await recordActivity(sb, U1, null, DAY1 + 1)).toBe('saved');
    });
    it('sin cliente o sin cuenta no hace nada', async () => {
      expect(await recordActivity(null, U1, mem(), DAY1)).toBe('skipped');
      expect(await recordActivity({}, U1, mem(), DAY1)).toBe('skipped');
      const sb = okSb();
      expect(await recordActivity(sb, '', mem(), DAY1)).toBe('skipped');
      expect(await recordActivity(sb, null, mem(), DAY1)).toBe('skipped');
      expect(sb.rpc).not.toHaveBeenCalled();
    });
  });
});

describe('app/index.html', () => {
  it('carga la librería antes del script principal', () => {
    const lib = html.indexOf('<script src="/app/lib/activity.js"></script>');
    expect(lib).toBeGreaterThan(0);
    expect(lib).toBeLessThan(html.indexOf('var POSTHOG_KEY'));
  });
  it('onSessionReady identifica en PostHog y registra el día de actividad', () => {
    const f = html.slice(html.indexOf('function recordActivity('), html.indexOf('// Observabilidad: registra fallos de API/red'));
    expect(f).toContain('trackIdentify(S.user)');
    expect(f).toContain('InvestActivity.recordActivity(sb,S.user.id,localStorage,Date.now())');
  });
  it('arranque, entrada de otra pestaña o Google, login y alta llaman a onSessionReady', () => {
    const boot = html.slice(html.indexOf('(async function boot(){'), html.indexOf('// ── Retorno post-pago de Stripe'));
    expect(boot).toMatch(/await sbLoadUserData\(sess\.data\.session\.user\);\s*onSessionReady\(\);/);
    const cb = html.slice(html.indexOf('sb.auth.onAuthStateChange(function(event,session){'));
    expect(cb).toMatch(/sbLoadUserData\(session\.user\)\.then\(function\(\)\{\s*onSessionReady\(\);/);
    expect(html).toMatch(/onSessionReady\(\); track\('login'\);/);
    expect(html).toMatch(/onSessionReady\(\); track\('signup'\);/);
    expect(has(/trackIdentify\(S\.user\);\s*track\('(login|signup)'\)/)).toBe(false);
  });
});

describe('api/delete-account.js: "Eliminar mis datos de Invest" también borra los días de actividad', () => {
  it('borra invest_activity_days por user_id antes del perfil', async () => {
    vi.resetModules();
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'service-key-de-prueba');
    const calls = [];
    const real = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method || 'GET' });
      if (String(url).endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: U1 }), { status: 200 });
      return new Response('[]', { status: 200 });
    });
    try {
      const mod = await import('../api/delete-account.js');
      const res = await mod.default(new Request('https://invest.moyiq.app/api/delete-account', { method: 'POST', body: JSON.stringify({ token: 'jwt-de-prueba' }) }));
      const out = await res.json();
      expect(out.ok).toBe(true);
      const deletes = calls.filter((c) => c.method === 'DELETE').map((c) => new URL(c.url).pathname.replace('/rest/v1/', ''));
      expect(deletes).toContain('invest_activity_days');
      expect(deletes.indexOf('invest_activity_days')).toBeLessThan(deletes.indexOf('profiles'));
      const act = calls.find((c) => c.method === 'DELETE' && c.url.includes('invest_activity_days'));
      expect(act.url).toContain('user_id=eq.' + U1);
    } finally {
      globalThis.fetch = real;
      vi.unstubAllEnvs();
    }
  });
});

describe('migración 20261019102000_invest_activity_days.sql', () => {
  const sql = read('supabase/migrations/20261019102000_invest_activity_days.sql').replace(/--.*$/gm, '');
  const norm = sql.replace(/\s+/g, ' ');
  it('tabla con clave (cuenta, día), borrado en cascada y RLS activada', () => {
    expect(norm).toMatch(/create table if not exists public\.invest_activity_days \( user_id uuid not null references auth\.users \(id\) on delete cascade, day date not null default \(\(now\(\) at time zone 'utc'\)::date\), primary key \(user_id, day\) \)/);
    expect(norm).toContain('alter table public.invest_activity_days enable row level security');
  });
  it('anon no recibe nada y authenticated solo INSERT (sin SELECT, UPDATE ni DELETE)', () => {
    expect(norm).toContain('revoke all on table public.invest_activity_days from public, anon, authenticated');
    expect(norm).toContain('grant insert on table public.invest_activity_days to authenticated');
    expect(/grant [^;]*\bto [^;]*\banon\b/.test(norm.replace(/revoke[^;]*;/g, ''))).toBe(false);
    expect(/grant (select|update|delete|all)[^;]*invest_activity_days to authenticated/.test(norm)).toBe(false);
  });
  it('la política de insert es la propia cuenta y solo el día de hoy', () => {
    expect(norm).toContain('drop policy if exists invest_activity_days_insert_own on public.invest_activity_days');
    expect(norm).toMatch(/create policy invest_activity_days_insert_own on public\.invest_activity_days for insert to authenticated with check \( user_id = \(select auth\.uid\(\)\) and day = \(\(now\(\) at time zone 'utc'\)::date\) \)/);
    expect(/create policy[^;]* for select/.test(norm)).toBe(false);
  });
  it('la función es security definer, con search_path vacío, sin parámetros y sin acceso para anon', () => {
    expect(norm).toMatch(/create or replace function public\.invest_record_activity\(\) returns void language plpgsql security definer set search_path = ''/);
    expect(norm).toContain('revoke all on function public.invest_record_activity() from public, anon');
    expect(norm).toContain('grant execute on function public.invest_record_activity() to authenticated, service_role');
    expect(norm).toContain('values ((select auth.uid())) on conflict (user_id, day) do nothing');
  });
  it('la vista de WAU por semana ISO solo la lee service_role', () => {
    expect(norm).toContain('create or replace view public.invest_weekly_active with (security_invoker = true)');
    expect(norm).toContain("to_char(w.week_start, 'IYYY-\"W\"IW') as iso_week");
    expect(norm).toContain('count(distinct w.user_id) as wau');
    expect(norm).toContain('revoke all on table public.invest_weekly_active from public, anon, authenticated');
    expect(norm).toContain('grant select on table public.invest_weekly_active to service_role');
  });
  it('es aditiva e idempotente: nada de drop table, alter de otras tablas ni datos', () => {
    expect(/drop table|truncate|delete from|update public\.|alter table (?!public\.invest_activity_days)/.test(norm)).toBe(false);
    expect(norm).toContain('create table if not exists');
    expect(norm).toContain('create or replace function');
  });
});
