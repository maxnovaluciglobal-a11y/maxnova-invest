// api/health.js — Vercel Edge Function
// Estado de cada proveedor de datos, para el monitoreo (C-33 / INV-7 / INV-N3).
// Hace el mismo camino que las API: el respaldo (FMP) solo se consulta si falla la fuente
// principal (Finnhub), para no gastar su cuota diaria. No expone claves, URL ni mensajes
// de los proveedores: solo el código HTTP, si hubo dato y su antigüedad.
// Responde 200 si todas las API tienen al menos una fuente que funciona y 503 si alguna no.
// Uso: GET /api/health (sin parámetros; con parámetros responde 400 para que no se salte la caché).
export const config = { runtime: 'edge' };

import { rejectForeignOrigin } from './_lib/origin.js';
import { MINDICADOR_URL, MINDICADOR_TIMEOUT_MS } from './_lib/mindicador.js';

const UA = 'Mozilla/5.0 (compatible; FINANCEOS/1.0)';
const now = () => Date.now();
const ageSec = (ms) => (ms ? Math.max(0, Math.round((now() - ms) / 1000)) : null);

async function probe(fn) {
  const t0 = now();
  try {
    const r = await fn();
    return { ok: !!r.ok, status: r.status ?? null, ageSeconds: r.ageSeconds ?? null, ms: now() - t0 };
  } catch (e) {
    return { ok: false, status: e?.name === 'TimeoutError' ? 'timeout' : 'error', ageSeconds: null, ms: now() - t0 };
  }
}

async function get(url, headers = {}, timeoutMs = 6000) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeoutMs) });
  let json = null;
  if (res.ok) { try { json = await res.json(); } catch { json = null; } }
  return { status: res.status, json };
}

const yahooChart = (sym) => async () => {
  const { status, json } = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`, { 'User-Agent': UA });
  const meta = json?.chart?.result?.[0]?.meta;
  return { ok: !!meta?.regularMarketPrice, status, ageSeconds: meta?.regularMarketTime ? ageSec(meta.regularMarketTime * 1000) : null };
};

const yahooNews = async () => {
  const { status, json } = await get('https://query1.finance.yahoo.com/v1/finance/search?q=SPY&newsCount=5&enableNavLinks=false', { 'User-Agent': UA });
  const items = Array.isArray(json?.news) ? json.news : [];
  const newest = items.reduce((m, n) => Math.max(m, Number(n.providerPublishTime) || 0), 0);
  return { ok: items.length > 0, status, ageSeconds: newest ? ageSec(newest * 1000) : null };
};

const mindicador = async () => {
  // Mismo timeout que /api/fx-latam: el estado refleja lo que ve la app.
  const { status, json } = await get(MINDICADOR_URL, {}, MINDICADOR_TIMEOUT_MS);
  const s = json?.serie?.[0];
  return { ok: !!s?.valor, status, ageSeconds: s?.fecha ? ageSec(Date.parse(s.fecha)) : null };
};

const finnhubProfile = (key) => async () => {
  const { status, json } = await get('https://finnhub.io/api/v1/stock/profile2?symbol=AAPL', { 'X-Finnhub-Token': key });
  return { ok: !!json?.ticker, status };
};

const finnhubEarnings = (key) => async () => {
  const { status, json } = await get('https://finnhub.io/api/v1/stock/earnings?symbol=AAPL', { 'X-Finnhub-Token': key });
  const last = Array.isArray(json) ? json[0] : null;
  return { ok: !!last, status, ageSeconds: last?.period ? ageSec(Date.parse(last.period)) : null };
};

const fmpProfile = (key) => async () => {
  const { status, json } = await get(`https://financialmodelingprep.com/stable/profile?symbol=AAPL&apikey=${key}`);
  return { ok: Array.isArray(json) && !!json[0]?.symbol, status };
};

const fmpEarnings = (key) => async () => {
  const { status, json } = await get(`https://financialmodelingprep.com/stable/earnings?symbol=AAPL&apikey=${key}`);
  const past = Array.isArray(json) ? json.filter(e => e && e.epsActual != null && e.date) : [];
  const newest = past.reduce((m, e) => Math.max(m, Date.parse(e.date) || 0), 0);
  return { ok: past.length > 0, status, ageSeconds: newest ? ageSec(newest) : null };
};

const coingecko = async () => {
  const { status, json } = await get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true');
  const b = json?.bitcoin;
  return { ok: !!b?.usd, status, ageSeconds: b?.last_updated_at ? ageSec(b.last_updated_at * 1000) : null };
};

const NOT_CHECKED = { ok: null, status: 'not_checked', ageSeconds: null, ms: 0 };
const NO_KEY = { ok: false, status: 'no_key', ageSeconds: null, ms: 0 };

// Fuente principal y, solo si falla, el respaldo.
async function chain(primary, backup) {
  const p = await primary.run();
  const out = { [primary.name]: p };
  if (backup) out[backup.name] = p.ok ? NOT_CHECKED : await backup.run();
  return out;
}

const step = (name, key, make) => ({ name, run: key ? () => probe(make(key)) : async () => NO_KEY });

export default async function handler(req) {
  const blocked = rejectForeignOrigin(req);
  if (blocked) return blocked;
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=300',
    'X-Robots-Tag': 'noindex',
  };
  if (new URL(req.url).search) {
    return new Response(JSON.stringify({ error: 'no_params_allowed' }), { status: 400, headers: { ...headers, 'Cache-Control': 'no-store' } });
  }

  const fh = process.env.FINNHUB_API_KEY;
  const fmp = process.env.FMP_API_KEY;

  const [quote, news, fxYahoo, fxMind, fundamentals, earnings, crypto] = await Promise.all([
    probe(yahooChart('SPY')),
    probe(yahooNews),
    probe(yahooChart('USDCLP=X')),
    probe(mindicador),
    chain(step('finnhub', fh, finnhubProfile), step('fmp', fmp, fmpProfile)),
    chain(step('finnhub', fh, finnhubEarnings), step('fmp', fmp, fmpEarnings)),
    probe(coingecko),
  ]);

  const apis = {
    quote: { endpoint: '/api/quote', providers: { yahoo: quote } },
    news: { endpoint: '/api/news', providers: { yahoo: news } },
    fx: { endpoint: '/api/fx-latam', providers: { yahoo: fxYahoo, mindicador: fxMind } },
    fundamentals: { endpoint: '/api/fundamentals', providers: fundamentals },
    earnings: { endpoint: '/api/earnings', providers: earnings },
    crypto: { endpoint: '/api/crypto', providers: { coingecko: crypto } },
  };
  for (const a of Object.values(apis)) a.ok = Object.values(a.providers).some(p => p.ok === true);
  const ok = Object.values(apis).every(a => a.ok);

  return new Response(JSON.stringify({ ok, checkedAt: new Date().toISOString(), apis }), { status: ok ? 200 : 503, headers });
}
