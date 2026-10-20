// SEG-5 (parte Invest): Invest borra solo sus datos; la cuenta es la misma de
// MOY IQ y el borrado total vive en app.moyiq.app/delete-account. Cada texto
// tiene que decir exactamente eso y llevar al enlace.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const URL_TOTAL = 'https://app.moyiq.app/delete-account';

describe('borrado unificado (SEG-5)', () => {
  it('ninguna página manda a pedir el borrado de la cuenta por correo', () => {
    for (const f of ['privacy.html', 'terms.html', 'faq.html', 'app/index.html']) {
      expect(read(f), f).not.toMatch(/para eliminarla escribe a/);
    }
  });
  it('privacidad, términos, FAQ y la app enlazan al borrado total', () => {
    for (const f of ['privacy.html', 'terms.html', 'faq.html', 'app/index.html']) {
      expect(read(f), f).toContain(URL_TOTAL);
    }
  });
  it('Ajustes tiene las dos acciones y dice qué borra cada una', () => {
    const a = read('app/index.html');
    expect(a).toContain("row('Eliminar mis datos de Invest','Borra solo lo de Invest");
    expect(a).toContain("row('Eliminar la cuenta','Borra la cuenta de acceso y todos tus datos de MOY IQ y de Invest a la vez.");
    expect(a).toMatch(/href="https:\/\/app\.moyiq\.app\/delete-account" target="_blank" rel="noopener">Eliminar la cuenta<span class="sr-only">/);
  });
  it('lo que la privacidad dice que borra Invest coincide con las tablas del endpoint', () => {
    const api = read('api/delete-account.js');
    const tables = JSON.parse(api.match(/USER_DATA_TABLES = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
    expect(tables).toEqual(['portfolio_holdings', 'watchlist', 'consents', 'trial_emails', 'invest_activity_days']);
    expect(api).toMatch(/deleteRows\('profiles', userId, 'id'\)/);
    expect(read('privacy.html')).toMatch(/borra de inmediato tu portafolio, lista de seguimiento, perfil, consentimientos, días de actividad y registro de correos del período de prueba de Invest\. No toca tus datos de MOY IQ\./);
  });
  it('el modal de borrado aclara que la cuenta y los datos de MOY IQ siguen', () => {
    expect(read('app/index.html')).toContain('Tu cuenta de acceso no se borra, porque es la misma de MOY IQ, y tus datos de MOY IQ tampoco.');
  });
});
