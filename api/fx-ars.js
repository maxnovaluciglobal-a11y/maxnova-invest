// api/fx-ars.js — Vercel Edge Function
// Dólar MEP ("bolsa") y oficial de Argentina, de DolarApi (UXP-8). La app lo usa cuando
// las cifras van en ARS; si el MEP no llega, usa el oficial y lo dice.
// Respuesta: { mep: {rate, buy, sell, date}|null, oficial: {...}|null, source, sourceUrl, fetchedAt }
// Usage: GET /api/fx-ars

export const config = { runtime: 'edge' };

import { ALLOWED_ORIGINS, rejectForeignOrigin } from './_lib/origin.js';
import { fetchDolar, DOLARAPI_SOURCE } from './_lib/dolarapi.js';

function buildHeaders(req, ok) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Vary': 'Origin',
    // 3 h en el edge (lo que pide DolarApi); sin dato, 5 min para reintentar pronto.
    'Cache-Control': ok
      ? 'public, s-maxage=10800, stale-while-revalidate=21600'
      : 'public, s-maxage=300',
  };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: buildHeaders(req, true) });
  const blocked = rejectForeignOrigin(req);
  if (blocked) return blocked;

  const [mep, oficial] = await Promise.all([fetchDolar('bolsa'), fetchDolar('oficial')]);
  return new Response(JSON.stringify({
    mep,
    oficial,
    source: DOLARAPI_SOURCE,
    sourceUrl: 'https://dolarapi.com',
    fetchedAt: new Date().toISOString(),
  }), { status: 200, headers: buildHeaders(req, !!mep) });
}
