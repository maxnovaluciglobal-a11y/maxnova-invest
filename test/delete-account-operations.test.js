// La tabla invest_operations entra al borrado de datos, pero mientras la migración no esté
// aplicada no puede frenar el borrado del resto.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let handler;
function stub(opsResponse) {
  const calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "u1" }), { status: 200 });
    if (u.includes("/rest/v1/invest_operations")) return opsResponse();
    return new Response("[]", { status: 200 });
  }));
  return calls;
}
const req = () => new Request("https://invest.moyiq.app/api/delete-account", { method: "POST", body: JSON.stringify({ token: "t" }) });

beforeEach(async () => {
  vi.resetModules();
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = "k";
  handler = (await import("../api/delete-account.js")).default;
});
afterEach(() => vi.unstubAllGlobals());

describe("delete-account con invest_operations", () => {
  it("borra la tabla cuando existe", async () => {
    const calls = stub(() => new Response("[{}]", { status: 200 }));
    const body = await (await handler(req())).json();
    expect(body.ok).toBe(true);
    expect(calls.some((u) => u.includes("invest_operations?user_id=eq.u1"))).toBe(true);
  });
  it("sin la migración sigue y borra el resto", async () => {
    const calls = stub(() => new Response('{"code":"PGRST205"}', { status: 404 }));
    const body = await (await handler(req())).json();
    expect(body.ok).toBe(true);
    expect(calls.some((u) => u.includes("profiles?id=eq.u1"))).toBe(true);
  });
  it("un error real sí se informa", async () => {
    stub(() => new Response("boom", { status: 500 }));
    const body = await (await handler(req())).json();
    expect(body.ok).toBe(false);
  });
});
