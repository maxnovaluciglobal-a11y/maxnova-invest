// api/fx.js — Vercel Edge Function
// USD/CLP exchange rate from Banco Central de Chile (mindicador.cl)
// Usage: /api/fx

export const config = { runtime: 'edge' };

import { ALLOWED_ORIGINS, rejectForeignOrigin } from './_lib/origin.js';
import { fetchMindicadorUsd } from './_lib/mindicador.js';

function buildHeaders(req) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Vary': 'Origin',
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
  };
}

export default async function handler(req) {
  const HEADERS = buildHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: HEADERS });
  }
  const blocked = rejectForeignOrigin(req);
  if (blocked) return blocked;

  const clp = await fetchMindicadorUsd();
  if (clp) {
    return new Response(JSON.stringify({
      usdClp: clp.valor,
      date:   clp.fecha,
      source: 'Banco Central de Chile',
    }), { status: 200, headers: HEADERS });
  }
  // Valor fijo de respaldo: sin fecha, para que nadie lo lea como el dólar de hoy (FIN-17).
  return new Response(JSON.stringify({
    usdClp: 950,
    date:   null,
    source: 'fallback',
    error:  'mindicador unavailable',
  }), { status: 200, headers: HEADERS });
}
