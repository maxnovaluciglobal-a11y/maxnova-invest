// Guarda de texto de privacy.html (D-04 / C-25, auditoría 360, 19-oct-2026).
// La política decía "anonimizado" y "con anonimización de IP" mientras la app mandaba el correo a
// PostHog. Estas guardas fallan si el texto vuelve a prometer lo que el código no hace, o si el
// código deja de cumplir lo que el texto dice.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { POSTHOG_OPTS } from '../app/lib/analytics.js';

const read = (f) => readFileSync(resolve(__dirname, '..', f), 'utf8');
const privacy = read('privacy.html');
const terms = read('terms.html');
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const p = text(privacy);

describe('privacy.html · analítica con PostHog', () => {
  it('no usa la palabra "anonimizado" ni promete anonimización de IP', () => {
    expect(/anonimiz|anónim/i.test(p)).toBe(false);
    expect(/anonimiz|anónim/i.test(text(terms))).toBe(false);
  });
  it('dice qué se mide, con quién y dónde: PostHog, EE. UU., identificador interno de la cuenta', () => {
    expect(p).toMatch(/PostHog, Inc\., EE\. UU\./);
    expect(p).toMatch(/identificador interno de tu cuenta, nunca a tu correo ni a tu nombre/);
    expect(p).toMatch(/no recibe tu correo ni tu nombre/);
    expect(p).toMatch(/no grabamos la pantalla ni lo que escribes/);
  });
  it('no esconde que PostHog ve la IP de la conexión', () => {
    expect(p).toMatch(/La dirección IP de tu conexión llega a PostHog/);
  });
  it('declara la base legal de la medición y cómo oponerse', () => {
    expect(p).toMatch(/Base legal: nuestro interés legítimo/);
    expect(p).toMatch(/oponerte a que midamos el uso de tu cuenta: escribe a support@moyiq\.app/);
  });
  it('trae las bases legales, la transferencia a EE. UU., el domicilio y el reclamo ante la autoridad', () => {
    expect(p).toMatch(/Base legal: la ejecución del servicio/);
    expect(p).toMatch(/es tu consentimiento/);
    expect(p).toMatch(/transferencia internacional de datos/);
    expect(p).toMatch(/10482 NW 31st Terrace, Office 1D, Doral, FL 33172/);
    expect(p).toMatch(/reclamo ante la autoridad de protección de datos de tu país/);
  });
  it('tiene fecha de actualización de hoy', () => {
    expect(p).toMatch(/Última actualización: 19 de octubre de 2026 · Versión 2\.4/);
  });
});

describe('privacy.html · días de actividad (C-10)', () => {
  it('dice que guarda el día en que abres la app, asociado a la cuenta, para contar a las personas activas', () => {
    expect(p).toMatch(/guardamos en nuestra base de datos, asociado a tu cuenta, cada día en que abres la app de Invest con tu sesión iniciada/);
    expect(p).toMatch(/cuántas personas la usan cada semana/);
  });
  it('y que "Eliminar mis datos de Invest" también los borra (api/delete-account.js lo hace)', () => {
    expect(p).toMatch(/perfil, consentimientos, días de actividad y registro de correos del período de prueba de Invest/);
    expect(read('api/delete-account.js')).toContain("'invest_activity_days'");
  });
});

describe('privacy.html · lo que dice coincide con lo que hace el código', () => {
  it('"No rastrear" y Global Privacy Control: el SDK los respeta', () => {
    expect(p).toMatch(/«No rastrear» o Global Privacy Control, no medimos tu uso/);
    expect(POSTHOG_OPTS.respect_dnt).toBe(true);
  });
  it('PostHog "no guarda nada en tu dispositivo": persistencia en memoria', () => {
    expect(p).toMatch(/PostHog no guarda nada en tu dispositivo/);
    expect(POSTHOG_OPTS.persistence).toBe('memory');
  });
  it('lo único que se guarda en el dispositivo para medir es la fecha del último día registrado (activity.js)', () => {
    expect(p).toMatch(/la fecha del último día de actividad ya registrado, para no repetir el aviso/);
    expect(read('app/lib/activity.js')).toContain('storage.setItem(key, day)');
    expect(/medición de uso no guarda nada/.test(p)).toBe(false);
  });
  it('"no grabamos la pantalla": sin grabación de sesiones ni autocaptura', () => {
    expect(POSTHOG_OPTS.disable_session_recording).toBe(true);
    expect(POSTHOG_OPTS.autocapture).toBe(false);
  });
  it('los proveedores que nombra la política existen en la CSP o en el código', () => {
    const vercel = read('vercel.json');
    expect(vercel).toMatch(/us\.i\.posthog\.com/);
    expect(vercel).toMatch(/\*\.supabase\.co/);
  });
});
