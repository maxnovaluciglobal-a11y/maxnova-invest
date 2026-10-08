// api/delete-account.js — Vercel Edge Function
// Deletes ALL of a user's Invest data, permanently and immediately. It does NOT
// delete the login (auth.users): that account is shared with MOY IQ since
// 14-sep-2026 (same Supabase project). See the note above the final return.
// Replaces the manual process privacy.html described before this commit (see
// git log "Fix Pro pricing and soften deletion promise in legal pages", 12-sep-2026).
//
// Usage: POST /api/delete-account  { token: "<supabase access token>" }
//
// Security: the JWT is the ONLY source of identity — there is no user_id in the
// request body. A caller can only ever delete the account the token belongs to.
// The token is verified against Supabase (/auth/v1/user) before anything is
// touched, exactly like api/check-plan.js and api/billing-portal.js.
//
// What gets deleted, in this order (service_role bypasses RLS):
//   1. Best-effort: cancel any active Stripe subscription tied to the account,
//      so deleting the account also stops billing, not just data. Never blocks
//      the rest of the flow — a deleted account with a subscription that needs
//      a manual cancel is a smaller problem than a stuck deletion.
//   2. portfolio_holdings, watchlist, consents, trial_emails — every row with
//      user_id = this user.
//   3. The profiles row itself (id = this user). `profiles` is Invest-only;
//      MOY IQ does not use it.
//   (4. Removed in relaunch v2: deleting the auth.users row. It is shared with
//       MOY IQ; account deletion goes through MOY IQ / support@moyiq.app.)
//
// `licenses` is NOT touched: it's keyed by Stripe session id / customer email
// for one-time FinanceOS-app purchases, not by this app's user id — it isn't
// linked to an Invest account. `webhook_events` is Stripe's own dedupe ledger,
// not user data. Neither belongs to "a user of Invest" in the sense this
// endpoint cares about.
//
// Steps 2-3 run in strict order and each one gates the next. Every step is logged (console.error)
// and returned in `steps` with ok/fail + row counts (via
// `Prefer: return=representation`), so nothing fails silently. Calling this
// endpoint again after a partial failure is safe: already-deleted rows are
// simply no-ops (0 rows matched, still `ok: true`).

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

const ALLOWED_ORIGINS = ['https://invest.moyiq.app', 'https://invest.financeospro.com', 'https://financeospro.com'];

function cors(req) {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200, req) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(req || { headers: { get: () => '' } }) },
  });
}

// Tables holding per-user data, cleared (in this order) before the profile
// row and the auth user itself can go. All filtered by user_id.
const USER_DATA_TABLES = ['portfolio_holdings', 'watchlist', 'consents', 'trial_emails'];

async function deleteRows(table, userId, idColumn) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${idColumn}=eq.${userId}`;
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: 'return=representation',
      },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { table, ok: false, error: `HTTP ${res.status}: ${detail.slice(0, 300)}` };
    }
    const rows = await res.json().catch(() => []);
    return { table, ok: true, deleted: Array.isArray(rows) ? rows.length : null };
  } catch (err) {
    return { table, ok: false, error: err.message || 'network_error' };
  }
}

// Best-effort subscription cancellation — see file header. Never throws.
async function cancelStripeSubscription(userId) {
  if (!STRIPE_SECRET) return { ok: null, skipped: true, reason: 'stripe_not_configured' };
  try {
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=stripe_subscription_id`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!profRes.ok) return { ok: null, skipped: true, reason: 'profile_lookup_failed' };
    const subId = (await profRes.json())?.[0]?.stripe_subscription_id;
    if (!subId) return { ok: null, skipped: true, reason: 'no_subscription' };

    const cancelRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${STRIPE_SECRET}` },
    });
    if (!cancelRes.ok) {
      const detail = await cancelRes.text().catch(() => '');
      return { ok: false, error: `HTTP ${cancelRes.status}: ${detail.slice(0, 300)}` };
    }
    return { ok: true, subscriptionId: subId };
  } catch (err) {
    return { ok: false, error: err.message || 'network_error' };
  }
}

export default async function handler(req) {
  const corsHeaders = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405, req);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return json({ ok: false, error: 'Server misconfigured' }, 500, req);

  let token;
  try {
    const body = await req.json();
    token = body.token;
  } catch { return json({ ok: false, error: 'Invalid JSON' }, 400, req); }
  if (!token) return json({ ok: false, error: 'Missing token' }, 400, req);

  // The JWT is the only source of identity — never a user_id supplied by the
  // client. This is what guarantees a user can only ever delete their own
  // account, same pattern as check-plan.js / billing-portal.js.
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return json({ ok: false, error: 'No autorizado' }, 401, req);
  const userData = await userRes.json();
  const userId = userData?.id;
  if (!userId) return json({ ok: false, error: 'No autorizado' }, 401, req);

  const steps = [];

  const stripeResult = await cancelStripeSubscription(userId);
  steps.push({ step: 'stripe_subscription_cancel', ...stripeResult });
  if (stripeResult.ok === false) {
    console.error(`[delete-account] Stripe cancel failed for user ${userId} (continuing anyway):`, stripeResult.error);
  }

  for (const table of USER_DATA_TABLES) {
    const result = await deleteRows(table, userId, 'user_id');
    steps.push({ step: `delete_${table}`, ...result });
    if (!result.ok) {
      console.error(`[delete-account] FAILED at ${table} for user ${userId}:`, result.error);
      return json(
        { ok: false, error: `No se pudo borrar ${table}. Tus datos de Invest no se borraron por completo. Intenta de nuevo.`, steps },
        500,
        req
      );
    }
  }

  const profileResult = await deleteRows('profiles', userId, 'id');
  steps.push({ step: 'delete_profile', ...profileResult });
  if (!profileResult.ok) {
    console.error(`[delete-account] FAILED at profiles for user ${userId}:`, profileResult.error);
    return json(
      { ok: false, error: 'No se pudo borrar el perfil. Tus datos de Invest no se borraron por completo. Intenta de nuevo.', steps },
      500,
      req
    );
  }

  // Relaunch v2 (oct-2026): the auth.users row is NOT deleted anymore. Since
  // 14-sep-2026 Invest and MOY IQ share the same Supabase project and auth, so
  // deleting it here would also lock the person out of MOY IQ. This endpoint
  // removes only Invest's own data; deleting the shared account is handled
  // through MOY IQ (support@moyiq.app).
  console.log(`[delete-account] Invest data of ${userId} deleted (shared auth user kept).`);
  return json({ ok: true, scope: 'invest_data', authUserDeleted: false, steps }, 200, req);
}
