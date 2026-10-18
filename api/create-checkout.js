// api/create-checkout.js — Vercel Edge Function
// Creates a Stripe Checkout session for the Invest Pro subscription.
// Usage: POST /api/create-checkout
// Body: { product: 'invest_pro', email?: string, userId?: string, interval?: 'annual' }

export const config = { runtime: 'edge' };

const ALLOWED_ORIGINS = ['https://invest.moyiq.app', 'https://invest.financeospro.com','https://financeospro.com'];
function getCorsHeaders(req) {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

const json = (data, status = 200, req) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req||{headers:{get:()=>''}}) },
  });

export default async function handler(req) {
  // Cobro pausado: Invest relanza como beta gratuita (relaunch v2, oct-2026). Quitar este bloque cuando vuelva el cobro.
  return new Response(JSON.stringify({ error: 'billing_paused' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET) return json({ error: 'Stripe not configured' }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { product, successUrl, cancelUrl, interval, token } = body;

  // La cuenta sale del JWT verificado, nunca del body: con un userId del body
  // cualquiera podía atar su cliente de Stripe al perfil de otra persona
  // (el webhook escribe plan y stripe_customer_id en ese perfil).
  // Mismas variables que billing-portal.js. Al reactivar el cobro, el cliente
  // tiene que mandar { token: session.access_token } (como billing-portal).
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!token || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) return json({ error: 'No autorizado' }, 401);
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return json({ error: 'No autorizado' }, 401);
  const authUser = await userRes.json();
  const userId = authUser?.id;
  const email = authUser?.email;
  if (!userId) return json({ error: 'No autorizado' }, 401);
  if (product !== 'invest_pro') return json({ error: `Unknown product: ${product}` }, 400);

  // Price IDs — set these in Vercel env vars after creating products in Stripe
  const PRICES = {
    invest_pro:        process.env.STRIPE_PRICE_INVEST_PRO,        // Subscription $9.99/mes
    invest_pro_annual: process.env.STRIPE_PRICE_INVEST_PRO_ANNUAL, // Subscription $99.99/año
  };

  const priceKey = interval === 'annual' ? 'invest_pro_annual' : 'invest_pro';
  const priceId = PRICES[priceKey];
  if (!priceId) return json({ error: `Price not configured: ${priceKey}` }, 400);

  const origin = req.headers.get('origin') || 'https://invest.moyiq.app';

  // Seguridad: solo aceptar success/cancelUrl del cliente si son del mismo origen
  // permitido (evita open-redirect / phishing). Si no, usar el default.
  const ALLOWED_REDIRECT_HOSTS = ['invest.moyiq.app', 'invest.financeospro.com','financeospro.com'];
  const safeRedirect = (candidate, fallback) => {
    if (!candidate || typeof candidate !== 'string') return fallback;
    try {
      const u = new URL(candidate);
      return (u.protocol === 'https:' && ALLOWED_REDIRECT_HOSTS.includes(u.hostname)) ? candidate : fallback;
    } catch { return fallback; }
  };

  const sessionPayload = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: safeRedirect(successUrl, `${origin}/app?upgraded=1`),
    cancel_url: safeRedirect(cancelUrl, `${origin}/`),
    metadata: { product, userId: userId || '' },
    ...(email ? { customer_email: email } : {}),
    subscription_data: {
      trial_period_days: 14,
      metadata: { product, userId: userId || '' },
    },
  };

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(flattenForStripe(sessionPayload)).toString(),
    });
    const session = await res.json();
    if (session.error) return json({ error: session.error.message }, 400);
    return json({ url: session.url, sessionId: session.id });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// Stripe API requires form-encoded nested params (e.g. line_items[0][price])
function flattenForStripe(obj, prefix = '') {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'object') {
          Object.assign(result, flattenForStripe(item, `${key}[${i}]`));
        } else {
          result[`${key}[${i}]`] = item;
        }
      });
    } else if (typeof v === 'object') {
      Object.assign(result, flattenForStripe(v, key));
    } else {
      result[key] = String(v);
    }
  }
  return result;
}
