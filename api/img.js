// api/img.js — Vercel Edge Function
// Miniaturas de las noticias para moyiq (Mercado y ficha del activo), servidas
// desde invest.moyiq.app para que la app no abra su CSP a CDN de terceros: el
// navegador del usuario solo habla con nuestro dominio y el CDN de imágenes no
// recibe su IP, sus cabeceras ni sus cookies.
// Usage: GET /api/img?u=<https URL codificada>
//
// No es un proxy abierto: solo https, solo los hosts exactos de IMG_HOSTS (los
// que devuelve api/news en el thumbnail de Yahoo), sin usuario, contraseña ni
// puerto, sin seguir redirecciones, solo image/(jpeg|png|webp|gif|avif) y como
// máximo MAX_IMG_BYTES. Los errores no explican nada (400/404/415/502 sin cuerpo).
export const config = { runtime: 'edge' };

import { rejectForeignOrigin } from './_lib/origin.js';

export const IMG_HOSTS = ['media.zenfs.com', 's.yimg.com', 'd29szjachogqwa.cloudfront.net'];
export const MAX_IMG_BYTES = 512 * 1024;
export const MAX_URL_LENGTH = 2048;
export const FETCH_TIMEOUT_MS = 5000;
const IMG_TYPE_RE = /^image\/(jpeg|png|webp|gif|avif)$/;
const UA = 'Mozilla/5.0 (compatible; moyiq-img/1.0)';

// URL de imagen permitida (string normalizado) o null.
export function allowedImageUrl(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_URL_LENGTH) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (!IMG_HOSTS.includes(url.hostname)) return null;
  url.hash = '';
  return url.href;
}

const fail = (status) => new Response(null, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" },
});

// Lee el cuerpo cortando apenas pasa el máximo (no confía en Content-Length).
async function readCapped(body, max) {
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { try { await reader.cancel(); } catch { /* ya cerrado */ } return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

export default async function handler(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405);
  const blocked = rejectForeignOrigin(req);
  if (blocked) return blocked;

  const params = new URL(req.url).searchParams;
  const target = allowedImageUrl(params.get('u'));
  if (!target || [...params.keys()].length !== 1) return fail(400);

  let res;
  try {
    // Pedido limpio: ninguna cabecera del cliente (ni cookies, ni IP, ni X-Forwarded-For).
    res = await fetch(target, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': UA, 'Accept': 'image/avif,image/webp,image/png,image/jpeg,image/gif' },
    });
  } catch { return fail(502); }

  // Redirección (a cualquier host) o URL final distinta: no se sigue.
  if (res.status >= 300 && res.status < 400) return fail(502);
  if (res.url && res.url !== target && !allowedImageUrl(res.url)) return fail(502);
  if (res.status === 404 || res.status === 410) return fail(404);
  if (!res.ok || !res.body) return fail(502);

  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!IMG_TYPE_RE.test(type)) { try { await res.body.cancel(); } catch { /* nada */ } return fail(415); }
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_IMG_BYTES) { try { await res.body.cancel(); } catch { /* nada */ } return fail(502); }

  let bytes;
  try { bytes = await readCapped(res.body, MAX_IMG_BYTES); } catch { return fail(502); }
  if (!bytes) return fail(502);

  return new Response(req.method === 'HEAD' ? null : bytes, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  });
}
