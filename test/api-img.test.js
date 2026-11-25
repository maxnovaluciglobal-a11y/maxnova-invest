// /api/img: miniaturas de noticias para moyiq sin abrir la CSP de la app a CDN
// de terceros. No es un proxy abierto: hosts exactos, solo https, sin
// redirecciones, solo imágenes y con tope de tamaño.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const load = async () => { vi.resetModules(); return import('../api/img.js'); };
const OK_URL = 'https://media.zenfs.com/en/reuters.com/08bf64880be2b2edc6409a16deea33d.jpg';
const get = (u, { origin, headers = {}, extra = '' } = {}) => new Request(
  `https://invest.moyiq.app/api/img?u=${encodeURIComponent(u)}${extra}`,
  { headers: { ...(origin ? { origin } : {}), ...headers } },
);
const img = (bytes = 100, type = 'image/jpeg', extraHeaders = {}) =>
  new Response(new Uint8Array(bytes), { status: 200, headers: { 'Content-Type': type, ...extraHeaders } });

let realFetch, fetchSpy;
beforeEach(() => {
  realFetch = globalThis.fetch;
  fetchSpy = vi.fn(async () => img());
  globalThis.fetch = fetchSpy;
});
afterEach(() => { globalThis.fetch = realFetch; });

describe('/api/img: lista de hosts', () => {
  it('sirve la imagen de cada host permitido, con sus cabeceras', async () => {
    const { default: h, IMG_HOSTS } = await load();
    expect(IMG_HOSTS).toEqual(['media.zenfs.com', 's.yimg.com', 'd29szjachogqwa.cloudfront.net']);
    for (const host of IMG_HOSTS) {
      const res = await h(get(`https://${host}/a/b.jpg`));
      expect(res.status, host).toBe(200);
      expect((await res.arrayBuffer()).byteLength).toBe(100);
      expect(res.headers.get('content-type')).toBe('image/jpeg');
      expect(res.headers.get('cache-control')).toBe('public, max-age=86400, s-maxage=604800, immutable');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toBe("default-src 'none'");
      expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    }
  });

  it('pide upstream sin reenviar cabeceras del cliente y sin seguir redirecciones', async () => {
    const { default: h } = await load();
    await h(get(OK_URL, { headers: { cookie: 'sb=secret', 'x-forwarded-for': '1.2.3.4', authorization: 'Bearer x', referer: 'https://app.moyiq.app/app/' } }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(OK_URL);
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeDefined();
    const sent = Object.keys(init.headers).map(k => k.toLowerCase()).sort();
    expect(sent).toEqual(['accept', 'user-agent']);
    expect(init.headers['User-Agent']).not.toMatch(/moyiq\.app|@/);
  });

  it('esquemas no https → 400 sin pedir nada', async () => {
    const { default: h } = await load();
    for (const u of ['http://media.zenfs.com/a.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'ftp://media.zenfs.com/a.jpg', 'file:///etc/passwd', '//media.zenfs.com/a.jpg', '']) {
      const res = await h(get(u));
      expect(res.status, u).toBe(400);
      expect(await res.text()).toBe('');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('hosts ajenos y parecidos → 400 (no es un proxy abierto)', async () => {
    const { default: h } = await load();
    for (const u of [
      'https://evil.example/a.jpg', 'https://media.zenfs.com.evil.example/a.jpg', 'https://evilmedia.zenfs.com/a.jpg',
      'https://x.media.zenfs.com/a.jpg', 'https://yimg.com/a.jpg', 'https://a.yimg.com/a.jpg', 'https://other.cloudfront.net/a.jpg',
      'https://user:pw@media.zenfs.com/a.jpg', 'https://media.zenfs.com:8443/a.jpg', 'https://127.0.0.1/a.jpg',
      'https://169.254.169.254/latest/meta-data', 'https://localhost/a.jpg', 'https://invest.moyiq.app/api/news',
    ]) expect((await h(get(u))).status, u).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sin u, u repetido o parámetros de más → 400', async () => {
    const { default: h } = await load();
    expect((await h(new Request('https://invest.moyiq.app/api/img'))).status).toBe(400);
    expect((await h(get(OK_URL, { extra: '&u=https://evil.example/x' }))).status).toBe(400);
    expect((await h(get(OK_URL, { extra: '&cb=1' }))).status).toBe(400);
    expect((await h(get(OK_URL + 'x'.repeat(2100)))).status).toBe(400);
  });

  it('origen ajeno → 403; otros métodos → 405', async () => {
    const { default: h } = await load();
    expect((await h(get(OK_URL, { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await h(get(OK_URL, { origin: 'https://app.moyiq.app' }))).status).toBe(200);
    expect((await h(new Request(`https://invest.moyiq.app/api/img?u=${encodeURIComponent(OK_URL)}`, { method: 'POST', body: 'x' }))).status).toBe(405);
  });
});

describe('/api/img: respuesta del CDN', () => {
  it('tipo que no es imagen permitida → 415', async () => {
    const { default: h } = await load();
    for (const t of ['text/html', 'image/svg+xml', 'application/octet-stream', '', 'image/jpeg2']) {
      fetchSpy.mockImplementationOnce(async () => img(10, t));
      const res = await h(get(OK_URL));
      expect(res.status, t).toBe(415);
      expect(await res.text()).toBe('');
    }
    for (const t of ['image/png', 'image/webp', 'image/gif', 'image/avif', 'image/jpeg; charset=binary']) {
      fetchSpy.mockImplementationOnce(async () => img(10, t));
      expect((await h(get(OK_URL))).status, t).toBe(200);
    }
  });

  it('más de 512 KB (declarado o real) → 502', async () => {
    const { default: h, MAX_IMG_BYTES } = await load();
    expect(MAX_IMG_BYTES).toBe(512 * 1024);
    fetchSpy.mockImplementationOnce(async () => img(MAX_IMG_BYTES + 1));
    expect((await h(get(OK_URL))).status).toBe(502);
    // Content-Length que miente: se corta al leer.
    fetchSpy.mockImplementationOnce(async () => img(MAX_IMG_BYTES + 10, 'image/jpeg', { 'Content-Length': '100' }));
    expect((await h(get(OK_URL))).status).toBe(502);
    fetchSpy.mockImplementationOnce(async () => img(MAX_IMG_BYTES));
    expect((await h(get(OK_URL))).status).toBe(200);
  });

  it('redirección a cualquier lado → 502; 404 → 404; error o timeout → 502', async () => {
    const { default: h } = await load();
    fetchSpy.mockImplementationOnce(async () => new Response(null, { status: 302, headers: { Location: 'https://evil.example/x.jpg' } }));
    expect((await h(get(OK_URL))).status).toBe(502);
    fetchSpy.mockImplementationOnce(async () => new Response(null, { status: 301, headers: { Location: 'https://s.yimg.com/x.jpg' } }));
    expect((await h(get(OK_URL))).status).toBe(502);
    fetchSpy.mockImplementationOnce(async () => new Response('nope', { status: 404 }));
    expect((await h(get(OK_URL))).status).toBe(404);
    fetchSpy.mockImplementationOnce(async () => new Response('err', { status: 500 }));
    expect((await h(get(OK_URL))).status).toBe(502);
    fetchSpy.mockImplementationOnce(async () => { throw new DOMException('timeout', 'TimeoutError'); });
    const res = await h(get(OK_URL));
    expect(res.status).toBe(502);
    expect(await res.text()).toBe('');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('vercel.json: /api/img', () => {
  it('última regla con caché larga, CSP vacía y CORP cross-origin', () => {
    const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
    const last = vercel.headers[vercel.headers.length - 1];
    expect(last.source).toBe('/api/img');
    const get = (k) => last.headers.find(x => x.key === k)?.value;
    expect(get('Cache-Control')).toBe('public, max-age=86400, s-maxage=604800, immutable');
    expect(get('Content-Security-Policy')).toBe("default-src 'none'");
    expect(get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
  });
});
