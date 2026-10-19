// Dólar observado de mindicador.cl (toma el dato del Banco Central de Chile) (INV-N9).
// Desde el edge de Vercel mindicador suele no responder: con el timeout de antes (4-6 s)
// cada consulta sin caché esperaba en vano. Ahora el timeout es corto y, si falla, no se
// vuelve a intentar durante SKIP_MS en esa instancia: el CLP queda con la fuente que ya
// había (Yahoo) sin agregar espera.
export const MINDICADOR_URL = 'https://mindicador.cl/api/dolar';
export const MINDICADOR_TIMEOUT_MS = 2500;
export const SKIP_MS = 10 * 60 * 1000;

let failedAt = 0;

export function mindicadorSkipped(now = Date.now()) {
  return failedAt > 0 && now - failedAt < SKIP_MS;
}

// Devuelve { valor, fecha } (fecha ISO de la fuente o null) o null si no hay dato.
export async function fetchMindicadorUsd() {
  if (mindicadorSkipped()) return null;
  try {
    const r = await fetch(MINDICADOR_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(MINDICADOR_TIMEOUT_MS) });
    if (!r.ok) throw new Error(`mindicador ${r.status}`);
    const d = await r.json();
    const s = d?.serie?.[0];
    if (!(s?.valor > 0)) throw new Error('no value');
    failedAt = 0;
    return { valor: s.valor, fecha: s.fecha || null };
  } catch {
    failedAt = Date.now();
    return null;
  }
}
