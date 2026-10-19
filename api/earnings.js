// api/earnings.js — Vercel Edge Function
// Resultados trimestrales (últimos hasta 8) y próxima fecha de resultados de un ticker.
// Fuente principal: Finnhub (/stock/earnings + /calendar/earnings). Respaldo: FMP /stable/earnings.
// Los endpoints /api/v3 de FMP que se usaban devolvían vacío para todos los tickers (INV-7).
// `source` dice de dónde salió el dato; es null cuando ninguna fuente devolvió nada.
export const config = { runtime: 'edge' };

import { ALLOWED_ORIGINS, rejectForeignOrigin } from './_lib/origin.js';

// Formato de ticker de Yahoo (acciones, ETF, índices, divisas, cripto): letras, números y . ^ = -
const TICKER_RE = /^[A-Za-z0-9.^=-]{1,12}$/;
const DAY = 86400000;

function buildHeaders(req, extra = {}) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Vary': 'Origin',
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
    ...extra,
  };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: buildHeaders(req) });
  const blocked = rejectForeignOrigin(req);
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get('ticker') || '').toUpperCase().trim();
  const HEADERS = buildHeaders(req);
  if (!ticker) return new Response(JSON.stringify({ error: 'ticker_required' }), { status: 400, headers: HEADERS });
  if (!TICKER_RE.test(ticker)) return new Response(JSON.stringify({ error: 'invalid_ticker' }), { status: 400, headers: HEADERS });

  const finnhubKey = process.env.FINNHUB_API_KEY;
  const fmpKey = process.env.FMP_API_KEY;
  if (!finnhubKey && !fmpKey) return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 503, headers: HEADERS });

  try {
    const today = new Date().toISOString().slice(0, 10);
    let out = null;
    if (finnhubKey) out = await fromFinnhub(ticker, finnhubKey, today).catch(() => null);
    if (!hasData(out) && fmpKey) out = await fromFmp(ticker, fmpKey, today).catch(() => null);
    const ok = hasData(out);

    return new Response(JSON.stringify({
      ticker,
      nextDate: ok ? out.nextDate : null,
      nextEpsEst: ok ? out.nextEpsEst : null,
      quarters: ok ? out.quarters : [],
      source: ok ? out.source : null,
      fetchedAt: Date.now(),
    }), {
      status: 200,
      // Sin datos no se guarda una hora en la CDN: se reintenta antes.
      headers: ok ? HEADERS : { ...HEADERS, 'Cache-Control': 'public, s-maxage=300' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: HEADERS });
  }
}

function hasData(out) {
  return !!(out && (out.quarters.length || out.nextDate));
}

export async function fromFinnhub(ticker, apiKey, today) {
  const base = 'https://finnhub.io/api/v1';
  const to = new Date(Date.parse(today) + 120 * DAY).toISOString().slice(0, 10);
  const sym = encodeURIComponent(ticker);
  const [earnRes, calRes] = await Promise.allSettled([
    getJson(`${base}/stock/earnings?symbol=${sym}`, { 'X-Finnhub-Token': apiKey }),
    getJson(`${base}/calendar/earnings?from=${today}&to=${to}&symbol=${sym}`, { 'X-Finnhub-Token': apiKey }),
  ]);
  const earn = earnRes.status === 'fulfilled' && Array.isArray(earnRes.value) ? earnRes.value : [];
  const cal = calRes.status === 'fulfilled' && Array.isArray(calRes.value?.earningsCalendar) ? calRes.value.earningsCalendar : [];

  const quarters = earn.slice(0, 8).map(q => {
    const eps = numOrNull(q.actual), epsEst = numOrNull(q.estimate);
    return {
      date: q.period || null,
      fiscalEnd: q.period || null,
      eps,
      epsEst,
      revenue: null,
      revenueEst: null,
      beat: eps != null && epsEst != null ? eps >= epsEst : null,
    };
  });
  const next = cal
    .filter(e => e && typeof e.date === 'string' && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return { source: 'finnhub', quarters, nextDate: next?.date || null, nextEpsEst: numOrNull(next?.epsEstimate) };
}

export async function fromFmp(ticker, apiKey, today) {
  const rows = await getJson(`https://financialmodelingprep.com/stable/earnings?symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`);
  const list = Array.isArray(rows) ? rows.filter(e => e && typeof e.date === 'string') : [];
  const quarters = list
    .filter(e => e.epsActual != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)
    .map(e => {
      const eps = numOrNull(e.epsActual), epsEst = numOrNull(e.epsEstimated);
      return {
        date: e.date,
        fiscalEnd: null,
        eps,
        epsEst,
        revenue: numOrNull(e.revenueActual),
        revenueEst: numOrNull(e.revenueEstimated),
        beat: eps != null && epsEst != null ? eps >= epsEst : null,
      };
    });
  const next = list
    .filter(e => e.date >= today && e.epsActual == null)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return { source: 'fmp', quarters, nextDate: next?.date || null, nextEpsEst: numOrNull(next?.epsEstimated) };
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json', ...headers }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const json = await res.json();
  if (json && typeof json === 'object' && !json.error && !json['Error Message']) return json;
  return null;
}

function numOrNull(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
