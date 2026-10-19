// Control de origen de las API de datos de mercado (C-33 / INV-6).
// CORS solo impide que otro sitio LEA la respuesta: el pedido igual llega y gasta la
// cuota del proveedor. Por eso un navegador que manda un Origin ajeno recibe 403 antes
// de que se llame a ningún proveedor. Los pedidos sin Origin (curl, el servidor del
// newsletter, las peticiones GET del mismo sitio) siguen pasando.

export const ALLOWED_ORIGINS = [
  'https://invest.moyiq.app',
  'https://invest.financeospro.com',
  'https://financeospro.com',
  'https://app.moyiq.app',
  'https://app.financeospro.com',
];

// Despliegues de vista previa del team de Vercel (solo el team puede crear ese sufijo)
// y los alias *.vercel.app del propio proyecto.
const PREVIEW_RE = /^https:\/\/[a-z0-9-]+-maxnovaluci-global\.vercel\.app$/;
const PROJECT_ALIAS_RE = /^https:\/\/(magnova-invest|maxnova-invest|invest-moyiq)\.vercel\.app$/;

export function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || PREVIEW_RE.test(origin) || PROJECT_ALIAS_RE.test(origin);
}

export function allowOrigin(req) {
  const origin = req.headers.get('origin') || '';
  return isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
}

export function rejectForeignOrigin(req) {
  const origin = req.headers.get('origin');
  if (origin === null || isAllowedOrigin(origin)) return null;
  return new Response(JSON.stringify({ error: 'origin_not_allowed' }), {
    status: 403,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
    },
  });
}
