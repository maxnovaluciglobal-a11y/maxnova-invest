// Atribución de datos en el aviso legal (parte barata de C-33, VEN-7 / LEG-2 de la auditoría 360).
// CoinGecko pide mostrar su atribución ("Powered by CoinGecko API", enlazada a coingecko.com) junto a
// sus datos. Y el aviso decía "Fundamentos: Financial Modeling Prep" cuando la fuente principal es Finnhub.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (f) => readFileSync(resolve(__dirname, '..', f), 'utf8');
const html = read('app/index.html');
const terms = read('terms.html');
const aviso = html.slice(html.indexOf('function toggleDisclaimer(){'), html.indexOf('// ── SUPABASE ──'));

describe('aviso legal de la app ("Aviso importante")', () => {
  it('atribuye a CoinGecko con enlace a coingecko.com', () => {
    expect(aviso).toMatch(/<a href="https:\/\/www\.coingecko\.com\/en\/api"[^>]*>Powered by CoinGecko API<\/a>/);
    expect(aviso).toMatch(/target="_blank" rel="noopener"/);
  });
  it('dice que los fundamentos vienen de Finnhub y de Financial Modeling Prep', () => {
    expect(aviso).toContain('Fundamentos: Finnhub y Financial Modeling Prep');
    expect(aviso).not.toContain('Fundamentos: Financial Modeling Prep \\u00b7');
  });
  it('sigue enlazando los términos y la privacidad', () => {
    expect(aviso).toContain('href="/terms.html"');
    expect(aviso).toContain('href="/privacy.html"');
  });
});

describe('terms.html §4 (datos de precios)', () => {
  it('enlaza a CoinGecko con su atribución', () => {
    expect(terms).toMatch(/los de criptoactivos de <a href="https:\/\/www\.coingecko\.com\/en\/api"[^>]*>CoinGecko<\/a> \(Powered by CoinGecko API\)/);
  });
  it('sigue nombrando las demás fuentes', () => {
    expect(terms).toContain('Yahoo Finance');
    expect(terms).toContain('mindicador.cl');
    expect(terms).toContain('Finnhub');
    expect(terms).toContain('Financial Modeling Prep');
  });
});
