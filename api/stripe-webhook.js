// api/stripe-webhook.js — Vercel Edge Function
// Handles Stripe webhook events for the Invest Pro subscription:
//   checkout.session.completed    → activate plan
//   customer.subscription.updated → sync plan with subscription status
//   customer.subscription.deleted → downgrade to free

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key, NOT anon
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function sbFetch(path, method, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation' : 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.ok ? res.json().catch(() => null) : null;
}

// Stripe webhook signature verification (Ed25519 / HMAC-SHA256)
async function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')));
  const timestamp = parts.t;
  const sig = parts.v1;
  if (!timestamp || !sig) return false;

  // Reject replayed webhooks outside 5-minute window
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false;

  const encoder = new TextEncoder();
  const data = encoder.encode(`${timestamp}.${payload}`);
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const computed = await crypto.subtle.sign('HMAC', key, data);
  const computedHex = Array.from(new Uint8Array(computed)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Timing-safe comparison: compare HMACs of both values to avoid byte-by-byte leakage
  const sigBytes = encoder.encode(sig);
  const computedBytes = encoder.encode(computedHex);
  if (sigBytes.length !== computedBytes.length) return false;
  const macKey = await crypto.subtle.importKey(
    'raw', encoder.encode(secret + '_cmp'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac1 = await crypto.subtle.sign('HMAC', macKey, sigBytes);
  const mac2 = await crypto.subtle.sign('HMAC', macKey, computedBytes);
  const a = new Uint8Array(mac1), b = new Uint8Array(mac2);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const rawBody = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!STRIPE_WEBHOOK_SECRET) return json({ error: 'Webhook secret not configured' }, 500);
  const valid = await verifyStripeSignature(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  if (!valid) return json({ error: 'Invalid signature' }, 401);

  let event;
  try { event = JSON.parse(rawBody); } catch { return json({ error: 'Invalid JSON' }, 400); }

  // Stripe entrega cada evento AL MENOS una vez: los reintentos son normales.
  // Sin deduplicar, un mismo checkout.session.completed emitia dos licencias o
  // reescribia el plan dos veces. La PK de webhook_events hace de cerrojo: si
  // el insert falla por duplicado, el evento ya se proceso y se corta aqui.
  if (event.id) {
    const yaVisto = await sbFetch('webhook_events', 'POST', { id: event.id, type: event.type });
    if (yaVisto === null) {
      return json({ received: true, duplicate: true });
    }
  }

  const type = event.type;
  const obj = event.data?.object;

  // ── Invest subscription activated / renewed ──────────────────────
  if (type === 'checkout.session.completed' && obj.mode === 'subscription') {
    const userId = obj.metadata?.userId || obj.subscription_data?.metadata?.userId;
    const customerId = obj.customer;
    const subscriptionId = obj.subscription;

    if (userId) {
      await sbFetch(`profiles?id=eq.${userId}`, 'PATCH', {
        plan: 'pro',
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        trial_started_at: null,
      });
    } else if (customerId) {
      // Fallback: match by stripe_customer_id if userId not in metadata
      await sbFetch(`profiles?stripe_customer_id=eq.${customerId}`, 'PATCH', {
        plan: 'pro',
        stripe_subscription_id: subscriptionId,
      });
    }
  }

  // ── Invest trial end / subscription updated ──────────────────────
  if (type === 'customer.subscription.updated') {
    const status = obj.status; // 'trialing' | 'active' | 'past_due' | 'canceled'
    const customerId = obj.customer;
    const plan = (status === 'active' || status === 'trialing') ? 'pro' : 'free';
    if (customerId) {
      await sbFetch(`profiles?stripe_customer_id=eq.${customerId}`, 'PATCH', { plan });
    }
  }

  // ── Invest subscription cancelled ───────────────────────────────
  if (type === 'customer.subscription.deleted') {
    const customerId = obj.customer;
    if (customerId) {
      await sbFetch(`profiles?stripe_customer_id=eq.${customerId}`, 'PATCH', {
        plan: 'free',
        stripe_subscription_id: null,
      });
    }
  }

  return json({ received: true });
}
