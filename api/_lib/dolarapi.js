// Dólar MEP y oficial de Argentina desde DolarApi (https://dolarapi.com) (UXP-8).
// Uso de los datos (dolarapi.com/docs/uso, versión del 15-oct-2026): se permite consultar
// la API, guardar una copia y publicar con la cita "DolarApi https://dolarapi.com"; piden no
// repetir la misma consulta en bucle (una cada 3 horas por serie es lo adecuado). Por eso
// /api/fx-ars se cachea 3 horas en el edge.
export const DOLARAPI_BASE = 'https://dolarapi.com/v1/dolares/';
export const DOLARAPI_TIMEOUT_MS = 4000;
export const DOLARAPI_SOURCE = 'DolarApi (dolarapi.com)';

// Respuesta de /v1/dolares/{casa} -> { rate, buy, sell, date } o null.
// rate es el precio de venta (lo que cuesta comprar un dólar), el que se usa para pasar
// montos en USD a pesos.
export function parseDolar(d) {
  if (!d || typeof d !== 'object') return null;
  const sell = Number(d.venta);
  const buy = Number(d.compra);
  if (!(isFinite(sell) && sell > 0)) return null;
  const t = Date.parse(d.fechaActualizacion);
  return {
    rate: sell,
    buy: isFinite(buy) && buy > 0 ? buy : null,
    sell,
    date: isFinite(t) ? new Date(t).toISOString() : null,
  };
}

export async function fetchDolar(casa) {
  try {
    const r = await fetch(DOLARAPI_BASE + casa, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(DOLARAPI_TIMEOUT_MS) });
    if (!r.ok) return null;
    return parseDolar(await r.json());
  } catch {
    return null;
  }
}
