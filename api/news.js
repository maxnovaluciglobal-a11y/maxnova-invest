// api/news.js — Vercel Edge Function
// Fetches live financial news from Yahoo Finance Search API (includes thumbnails)
// Usage: GET /api/news?tickers=SPY,NVDA,AAPL
//        POST /api/news  {"tickers":["SPY","NVDA"]}  (Content-Type: application/json)
// El POST existe para que los tickers del usuario no viajen en la URL (quedan en
// logs de acceso, historial y Referer). Las dos formas pasan por el mismo filtro
// (regex, 12 como máximo) y comparten la caché en memoria de 10 minutos.
export const config = { runtime: 'edge' };

function hoursAgo(ts) {
  if (!ts) return 24;
  const d = typeof ts === 'number' ? ts * 1000 : new Date(ts).getTime();
  return Math.max(0, Math.round((Date.now() - d) / 3600000));
}

function guessImpact(title) {
  const t = title.toLowerCase();
  if (/crash|crisis|recession|war|sanctions|ban|collapse|default|downgrade/.test(t)) return 'bearish';
  if (/beat|surge|rally|record|growth|profit|gain|upgrade|bull/.test(t)) return 'bullish';
  if (/breaking|alert|urgent|shock/.test(t)) return 'critical';
  return 'neutral';
}

function guessCat(title) {
  const t = title.toLowerCase();
  if (/fed|fomc|rates|powell|inflation|cpi|pce|treasury/.test(t)) return 'Fed';
  if (/earnings|eps|revenue|guidance|quarterly|beat|miss/.test(t)) return 'Earnings';
  if (/war|sanctions|geopolit|iran|russia|china|israel|conflict|tariff/.test(t)) return 'Geopolítica';
  if (/ai|artificial|nvidia|semiconductor|tech|apple|google|meta|amazon/.test(t)) return 'IA & Tech';
  return 'Macro';
}

function httpUrl(u) {
  try {
    const url = new URL(String(u || '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
}

export function bestImage(thumbnail) {
  if (!thumbnail?.resolutions?.length) return null;
  // La miniatura se dibuja a 72×54 (144 px en pantallas 2x). Yahoo suele dar
  // solo el original (1280–2960 px, hasta ~3 MB) y una de 140×140 (3–10 KB):
  // la más chica de al menos 140 px alcanza y el proxy /api/img la acepta.
  // Si ninguna llega, la más grande disponible.
  const sorted = [...thumbnail.resolutions].sort((a, b) => (a.width || 0) - (b.width || 0));
  const best = sorted.find(r => (r.width || 0) >= 140) || sorted[sorted.length - 1];
  return best?.url || null;
}

import { ALLOWED_ORIGINS, isAllowedOrigin, rejectForeignOrigin } from './_lib/origin.js';

export const DEFAULT_TICKERS = 'SPY,QQQ,NVDA,AAPL,AMZN,META,MSFT,GLD';
export const MAX_TICKERS = 12;
export const MAX_BODY_BYTES = 2048;
export const CACHE_TTL_MS = 600_000;

// Acepta una cadena "A,B,C" o un arreglo; devuelve la lista limpia unida por comas.
export function normalizeTickers(input) {
  const list = Array.isArray(input) ? input : String(input ?? '').split(',');
  return list
    .filter(t => typeof t === 'string')
    .map(t => t.trim().toUpperCase())
    .filter(t => /^[\^A-Z0-9\-=\.]{1,15}$/.test(t))
    .slice(0, MAX_TICKERS)
    .join(',') || 'SPY,QQQ,NVDA,AAPL';
}

// Caché por instancia: el CDN no guarda respuestas a POST, así que sin esto cada
// POST iría a Yahoo. GET y POST con los mismos tickers comparten la entrada.
const cache = new Map();
const CACHE_MAX = 200;
function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  return hit.body;
}
function cacheSet(key, body) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), body });
}

async function readTickersFromBody(req) {
  const type = (req.headers.get('content-type') || '').toLowerCase();
  if (!type.startsWith('application/json')) return { error: 'unsupported_media_type', status: 415 };
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY_BYTES) return { error: 'payload_too_large', status: 413 };
  let text;
  try { text = await req.text(); } catch { return { error: 'invalid_body', status: 400 }; }
  if (text.length > MAX_BODY_BYTES) return { error: 'payload_too_large', status: 413 };
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { return { error: 'invalid_json', status: 400 }; }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { error: 'invalid_body', status: 400 };
  const raw = body.tickers;
  if (raw !== undefined && typeof raw !== 'string' && !Array.isArray(raw)) return { error: 'invalid_tickers', status: 400 };
  return { raw: raw === undefined || (Array.isArray(raw) && raw.length === 0) || raw === '' ? DEFAULT_TICKERS : raw };
}

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';
  const corsHeaders = {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  const blocked = rejectForeignOrigin(req);
  if (blocked) return blocked;

  const isPost = req.method === 'POST';
  if (!isPost && req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Allow': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store', ...corsHeaders },
    });
  }

  let rawTickers;
  if (isPost) {
    const parsed = await readTickersFromBody(req);
    if (parsed.error) {
      return new Response(JSON.stringify({ error: parsed.error, items: [] }), {
        status: parsed.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders },
      });
    }
    rawTickers = parsed.raw;
  } else {
    rawTickers = new URL(req.url).searchParams.get('tickers') || DEFAULT_TICKERS;
  }
  const tickers = normalizeTickers(rawTickers);

  // GET: caché pública del CDN, como antes. POST: el CDN no la usa; se marca privada
  // para que ningún intermediario guarde una respuesta pedida con los tickers del usuario.
  const cacheControl = isPost
    ? 'private, max-age=600'
    : 'public, s-maxage=600, stale-while-revalidate=1200';
  const respond = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': cacheControl,
        ...corsHeaders,
      },
    });

  const cached = cacheGet(tickers);
  if (cached) return respond(cached);
  const respondAndCache = (body) => { if (body.items && body.items.length) cacheSet(tickers, body); return respond(body); };

  try {
    // Yahoo Finance Search API returns news with thumbnails in one call
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(tickers)}&newsCount=25&enableNavLinks=false&enableEnhancedTrivialQuery=true`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(7000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) throw new Error(`Yahoo API ${res.status}`);
    const data = await res.json();

    const raw = data.news || [];
    if (!raw.length) throw new Error('empty_response');

    const items = raw.map((n, i) => ({
      id: 100 + i,
      cat: guessCat(n.title || ''),
      impact: guessImpact(n.title || ''),
      breaking: i < 2 && hoursAgo(n.providerPublishTime) < 3,
      title: n.title || '',
      body: n.title || '',
      tickers: (n.relatedTickers || []).slice(0, 4),
      dec: '',
      decColor: 'var(--text2)',
      key: '',
      source: n.publisher || 'Yahoo Finance',
      link: httpUrl(n.link),
      hoursAgo: hoursAgo(n.providerPublishTime),
      image: bestImage(n.thumbnail),
    }));

    return respondAndCache({ items, fetchedAt: Date.now() });
  } catch (e) {
    // Fallback to RSS if Search API fails
    try {
      const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(tickers)}&region=US&lang=en-US`;
      const rssRes = await fetch(rssUrl, {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'FINANCEOS/1.0' },
      });
      if (!rssRes.ok) throw new Error(`RSS ${rssRes.status}`);
      const xml = await rssRes.text();

      const raw = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 20);
      const items = raw.map((m, i) => {
        const c = m[1];
        const g = (tag, cd) => cd
          ? c.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`))?.[1] || ''
          : c.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() || '';
        const title = g('title', true) || g('title');
        const link  = g('link') || g('guid');
        const pub   = g('pubDate');
        const desc  = (g('description', true) || '').replace(/<[^>]+>/g, '').slice(0, 200);
        const src   = g('source', true) || g('source') || 'Yahoo Finance';
        // Try media:content for image in RSS
        const mediaMatch = c.match(/<media:content[^>]+url="([^"]+)"/i);
        const image = mediaMatch?.[1] || null;
        return {
          id: 100 + i,
          cat: guessCat(title),
          impact: guessImpact(title),
          breaking: i < 2 && hoursAgo(pub) < 3,
          title,
          body: desc || title,
          tickers: [],
          dec: '',
          decColor: 'var(--text2)',
          key: '',
          source: src,
          link: httpUrl(link),
          hoursAgo: hoursAgo(pub),
          image,
        };
      }).filter(n => n.title);

      return respondAndCache({ items, fetchedAt: Date.now(), fallback: true });
    } catch (e2) {
      return respond({ error: e2.message, items: [] });
    }
  }
}
