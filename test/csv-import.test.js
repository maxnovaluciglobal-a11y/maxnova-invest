// Tests para app/lib/csv-import.js — importar posiciones desde CSV (I01).
import { describe, it, expect } from "vitest";
import { parseHoldingsCsv, parseNum } from "../app/lib/csv-import.js";

describe("parseNum", () => {
  it("entiende formato es-CL y en-US", () => {
    expect(parseNum("1.234,56")).toBeCloseTo(1234.56);
    expect(parseNum("1,234.56")).toBeCloseTo(1234.56);
    expect(parseNum("$172.50")).toBeCloseTo(172.5);
    expect(parseNum("")).toBeNaN();
  });
});

describe("parseHoldingsCsv", () => {
  it("lee el CSV que exporta la app y salta la fila TOTAL", () => {
    const csv = '﻿"Ticker","Tipo","Unidades","Entrada","Precio Actual"\n"AAPL","Stock","16","205.40","234.12"\n"SPY","ETF","10","560.10","585.40"\n"TOTAL","","","","",""';
    const r = parseHoldingsCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { t: "AAPL", type: "Stock", sh: 16, cost: 205.4 },
      { t: "SPY", type: "ETF", sh: 10, cost: 560.1 },
    ]);
  });
  it("acepta separador ; y encabezados en inglés, con stop opcional", () => {
    const r = parseHoldingsCsv("symbol;shares;avg cost;type;stop\nmsft;12;445,00;stock;410\nbtc-usd;0,5;60000;crypto;");
    expect(r.rows[0]).toEqual({ t: "MSFT", type: "Stock", sh: 12, cost: 445, stop: 410 });
    expect(r.rows[1]).toEqual({ t: "BTC-USD", type: "Crypto", sh: 0.5, cost: 60000 });
  });
  it("informa columnas faltantes", () => {
    const r = parseHoldingsCsv("ticker,precio\nAAPL,200");
    expect(r.rows).toEqual([]);
    expect(r.errors[0]).toMatch(/Faltan columnas/);
  });
  it("reporta líneas inválidas sin descartar las buenas", () => {
    const r = parseHoldingsCsv("ticker,unidades,entrada\nAAPL,0,200\nNVDA,5,120\n$$,1,1");
    expect(r.rows).toEqual([{ t: "NVDA", type: "Stock", sh: 5, cost: 120 }]);
    expect(r.errors).toHaveLength(2);
  });
  it("archivo vacío", () => {
    expect(parseHoldingsCsv("").errors[0]).toMatch(/vacío/);
  });
});
