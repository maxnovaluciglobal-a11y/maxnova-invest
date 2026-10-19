// C-36 / C-42 / INV-1 / LEG-10 (auditoría 360, parte Invest): textos legales que dicen lo que pasa.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (f) => readFileSync(resolve(__dirname, '..', f), 'utf8');
const text = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const PUBLIC = ['index.html', 'faq.html', 'estado-mercado.html', 'perfil-inversor.html', 'privacy.html', 'terms.html', 'datos-y-licencias.html'];

describe('Datos y licencias (INV-1)', () => {
  const d = text(read('datos-y-licencias.html'));
  it('nombra cada fuente que usa la app y lo que aporta', () => {
    for (const s of ['Yahoo Finance', 'Finnhub', 'Financial Modeling Prep', 'CoinGecko', 'mindicador.cl', 'Banco Central de Chile']) expect(d).toContain(s);
  });
  it('lleva la atribución de CoinGecko con enlace', () => {
    expect(read('datos-y-licencias.html')).toMatch(/<a href="https:\/\/www\.coingecko\.com\/en\/api"[^>]*>Powered by CoinGecko API<\/a>/);
  });
  it('no promete licencias ni exactitud', () => {
    expect(d).not.toMatch(/licencia(do|s)? (oficial|comercial)|tiempo real|garantizamos/i);
    expect(d).toMatch(/no garantiza la exactitud/);
  });
  it.each(PUBLIC)('%s enlaza la página desde el pie', (f) => {
    expect(read(f)).toContain('<li><a href="/datos-y-licencias.html">Datos y licencias</a></li>');
  });
  it('está en el sitemap', () => { expect(read('sitemap.xml')).toContain('/datos-y-licencias.html'); });
});

describe('privacidad v2.4 (LEG-2, LEG-5, LEG-9)', () => {
  const p = text(read('privacy.html'));
  it('declara los clics que registra Resend y su base', () => {
    expect(p).toMatch(/redirector de nuestro proveedor de correo \(Resend\), que registra si haces clic/);
    expect(p).toMatch(/no medimos si abres los correos/);
  });
  it('encargados con país, Google y garantías de la transferencia', () => {
    for (const s of ['Supabase, Inc., EE. UU.', 'Vercel Inc., EE. UU.', 'PostHog, Inc., EE. UU.', 'Resend, Inc., EE. UU.', 'Google LLC', 'cláusulas contractuales tipo']) expect(p).toContain(s);
  });
  it('las fuentes de mercado no reciben datos personales (las consulta el servidor)', () => {
    expect(p).toMatch(/no reciben datos personales: las consulta nuestro servidor/);
  });
  it('Chile (Ley 21.719) y autoridades', () => {
    expect(p).toMatch(/Ley 21\.719/);
    expect(p).toMatch(/acceso, rectificación, supresión, oposición, portabilidad y bloqueo/);
    expect(p).toMatch(/Agencia de Protección de Datos Personales/);
    expect(p).toMatch(/ANPD/);
  });
  it('sin anglicismos en el texto', () => { expect(p).not.toMatch(/watchlist/i); });
});

describe('términos v2.1 (LEG-10)', () => {
  const t = text(read('terms.html'));
  it('frontera herramienta informativa / asesoría y avisos por país', () => {
    expect(t).toMatch(/herramienta informativa de uso general/);
    expect(t).toMatch(/no te asigna activos ni porcentajes/);
    for (const s of ['Ley 21.521', 'CMF', 'CNBV', 'Superintendencia Financiera de Colombia', 'SEC']) expect(t).toContain(s);
  });
  it('prohíbe redistribuir los datos y el uso automatizado', () => {
    expect(t).toMatch(/ni copiar, revender o redistribuir los datos de mercado/);
  });
});

describe('perfil de inversor sin porcentajes de activos (LEG-10)', () => {
  it('no muestra una distribución de cartera', () => {
    const h = read('perfil-inversor.html');
    expect(h).not.toMatch(/% renta|result-mix|mix:/);
  });
});

describe('resumen legal dentro de la app', () => {
  const src = read('app/index.html');
  const modal = src.slice(src.indexOf('function openTCModal'), src.indexOf('var content=isTc?tcContent:ppContent;'));
  it('no dice cosas que ya no son ciertas', () => {
    expect(modal).not.toMatch(/Stripe|15 minutos|cookies de sesión|señales|Miami|Junio 2026/);
  });
  it('remite a las versiones vigentes', () => {
    expect(modal).toContain('versión 2.1, 19 de octubre de 2026');
    expect(modal).toContain('versión 2.4, 19 de octubre de 2026');
  });
});
