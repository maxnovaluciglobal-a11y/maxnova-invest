import { describe, it, expect } from "vitest";
import { applyTrade } from "../app/lib/holdings.js";

describe("applyTrade", () => {
  const h = { sh: 16, cost: 205.4, stop: 190 };
  it("una compra suma unidades y promedia la entrada sin tocar el stop", () => {
    const r = applyTrade(h, { type: "buy", qty: 4, price: 230, amount: 920 });
    expect(r.action).toBe("update");
    expect(r.sh).toBe(20);
    expect(r.cost).toBeCloseTo((16 * 205.4 + 920) / 20, 6);
    expect(r).not.toHaveProperty("stop");
  });
  it("una venta resta unidades y calcula el resultado con la entrada actual", () => {
    const r = applyTrade(h, { type: "sell", qty: 2, price: 230, amount: 460 });
    expect(r.action).toBe("update");
    expect(r.sh).toBe(14);
    expect(r.cost).toBe(205.4);
    expect(r.pnl).toBeCloseTo((230 - 205.4) * 2, 6);
  });
  it("vender todo devuelve close", () => {
    expect(applyTrade(h, { type: "sell", qty: 16, price: 200 }).action).toBe("close");
    expect(applyTrade(h, { type: "sell", qty: 30, price: 200 }).sold).toBe(16);
  });
  it("comprar sin posicion la crea", () => {
    const r = applyTrade(null, { type: "buy", amount: 1000, price: 200 });
    expect(r).toMatchObject({ action: "create", sh: 5, cost: 200 });
  });
  it("vender sin posicion no hace nada", () => {
    expect(applyTrade(null, { type: "sell", qty: 1, price: 10 }).action).toBe("none");
  });
});
