// Tests para app/lib/readings.js — lectura por indicador (T18) y etiqueta de
// frescura de precios del relanzamiento v2.
import { describe, it, expect } from "vitest";
import {
  classifyTrend,
  trendLabel,
  rsiZone,
  buildReadings,
  quoteFreshness,
  summarizeFreshness,
} from "../app/lib/readings.js";

const FORBIDDEN = /comprar|compra |vender|venta |acumular|reducir|entrada|oportunidad|score|\/100|recomend/i;

describe("classifyTrend", () => {
  it("UP cuando el precio está sobre ambas medias", () => {
    expect(classifyTrend(110, 100, 90)).toBe("UP");
  });
  it("DOWN cuando está bajo ambas", () => {
    expect(classifyTrend(80, 100, 90)).toBe("DOWN");
  });
  it("MIX entre medias", () => {
    expect(classifyTrend(95, 100, 90)).toBe("MIX");
  });
  it("sin media de 200 usa solo la de 50", () => {
    expect(classifyTrend(110, 100, null)).toBe("UP");
    expect(classifyTrend(90, 100, undefined)).toBe("DOWN");
  });
  it("null si faltan datos", () => {
    expect(classifyTrend(null, 100, 90)).toBeNull();
    expect(trendLabel(null)).toBe("Calculando");
  });
});

describe("rsiZone", () => {
  it("bandas 30/70", () => {
    expect(rsiZone(75).key).toBe("high");
    expect(rsiZone(25).key).toBe("low");
    expect(rsiZone(50).key).toBe("mid");
    expect(rsiZone(NaN).key).toBe("na");
  });
});

describe("buildReadings", () => {
  const input = {
    last: 234.12, s50: 224, s200: 210, rsi: 58,
    macdHist: 0.4, macdPrev: 0.3, volRatio: 0.82, high52: 260, atr: 3.4,
  };
  const r = buildReadings(input);

  it("devuelve una lectura por indicador con valor, rango y frase", () => {
    expect(r.map((x) => x.key)).toEqual(["sma200", "sma50", "rsi", "macd", "vol", "high52", "atr"]);
    r.forEach((x) => {
      expect(x.value).toBeTruthy();
      expect(x.range).toBeTruthy();
      expect(x.reading).toBeTruthy();
    });
  });

  it("no produce ninguna nota agregada ni lenguaje de recomendación", () => {
    r.forEach((x) => {
      expect(x.reading).not.toMatch(FORBIDDEN);
      expect(x.label).not.toMatch(FORBIDDEN);
    });
    const extremos = buildReadings({ last: 50, s50: 60, s200: 70, rsi: 22, macdHist: -1, macdPrev: -2, volRatio: 1.6, high52: 90, atr: 2 });
    extremos.forEach((x) => expect(x.reading).not.toMatch(FORBIDDEN));
  });

  it("RSI extremo se marca como aviso, no como positivo", () => {
    const low = buildReadings({ rsi: 22 }).find((x) => x.key === "rsi");
    expect(low.tone).toBe("warn");
  });

  it("omite indicadores sin datos", () => {
    expect(buildReadings({ rsi: 50 }).map((x) => x.key)).toEqual(["rsi"]);
  });
});

describe("quoteFreshness", () => {
  const now = Date.UTC(2026, 9, 8, 17, 0, 0);
  const open = { tradingStart: now - 3 * 3600e3, tradingEnd: now + 3 * 3600e3 };

  it("Al día cuando el precio tiene ≤ 2 min", () => {
    const f = quoteFreshness({ marketTime: now - 60e3, ...open }, now, false, "UTC");
    expect(f.state).toBe("live");
    expect(f.label).toBe("Al día · 16:59");
  });
  it("Retraso N min cuando es más viejo", () => {
    const f = quoteFreshness({ marketTime: now - 15 * 60e3, ...open }, now, false, "UTC");
    expect(f.state).toBe("delayed");
    expect(f.minutes).toBe(15);
    expect(f.label).toBe("Retraso 15 min · 16:45");
  });
  it("Mercado cerrado fuera de la sesión regular", () => {
    const f = quoteFreshness({ marketTime: now - 5 * 3600e3, tradingStart: now - 9 * 3600e3, tradingEnd: now - 2 * 3600e3 }, now, false, "UTC");
    expect(f.state).toBe("closed");
    expect(f.label).toMatch(/^Mercado cerrado · /);
  });
  it("Sin conexión cuando falló la actualización", () => {
    const f = quoteFreshness({ marketTime: now - 60e3 }, now, true, "UTC");
    expect(f.state).toBe("offline");
    expect(f.label).toBe("Sin conexión · 16:59");
  });
  it("Nunca dice 'al día' si la fuente no informa la hora", () => {
    const f = quoteFreshness({ fetchedAt: now }, now, false, "UTC");
    expect(f.state).toBe("unknown");
    expect(f.label).not.toMatch(/al día/i);
  });
});

describe("summarizeFreshness", () => {
  const now = Date.UTC(2026, 9, 8, 17, 0, 0);
  const open = { tradingStart: now - 3 * 3600e3, tradingEnd: now + 3 * 3600e3 };
  it("toma el precio más atrasado entre mercados abiertos", () => {
    const f = summarizeFreshness([
      { marketTime: now - 60e3, ...open },
      { marketTime: now - 20 * 60e3, ...open },
    ], now, false, "UTC");
    expect(f.label).toBe("Retraso hasta 20 min · 16:40");
  });
  it("todo al día", () => {
    const f = summarizeFreshness([{ marketTime: now - 30e3, ...open }], now, false, "UTC");
    expect(f.state).toBe("live");
  });
});
