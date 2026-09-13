// Tests para app/lib/async-guards.js — regresion de dos bugs reales:
//
// 1. sbLoadUserData se disparaba dos veces en paralelo para el mismo user_id
//    (boot()/doLogin() + onAuthStateChange SIGNED_IN para el mismo evento),
//    pisando el mismo estado global y colgando la app en el consent gate.
// 2. Llamadas a Supabase (getSession, queries) y a /api/check-plan sin
//    timeout dejaban boot()/sbLoadUserData girando para siempre -> pantalla
//    en blanco.
import { describe, it, expect, vi } from "vitest";
import { withTimeout, createDedupeCache, createLoadGate } from "../app/lib/async-guards.js";

describe("createDedupeCache (guard de sbLoadUserData)", () => {
  it("no ejecuta la factory dos veces para llamadas concurrentes con la misma key", () => {
    const cache = createDedupeCache();
    let calls = 0;
    let resolveFirst;
    const factory = () =>
      new Promise((res) => {
        calls++;
        resolveFirst = res;
      });

    const p1 = cache.run("user-1", factory);
    const p2 = cache.run("user-1", factory); // simula onAuthStateChange llamando de nuevo

    expect(calls).toBe(1);
    expect(p1).toBe(p2); // misma promesa devuelta, no una nueva carrera

    resolveFirst("done");
    return Promise.all([p1, p2]).then(([r1, r2]) => {
      expect(r1).toBe("done");
      expect(r2).toBe("done");
    });
  });

  it("ejecuta la factory por separado para keys (user_id) distintas", () => {
    const cache = createDedupeCache();
    let calls = 0;
    const factory = () => {
      calls++;
      return Promise.resolve(calls);
    };

    return Promise.all([cache.run("user-1", factory), cache.run("user-2", factory)]).then(
      ([r1, r2]) => {
        expect(calls).toBe(2);
        expect(r1).not.toBe(r2);
      }
    );
  });

  it("clear() permite que el proximo login (mismo o distinto usuario) vuelva a cargar fresco", async () => {
    const cache = createDedupeCache();
    let calls = 0;
    const factory = () => {
      calls++;
      return Promise.resolve(calls);
    };

    await cache.run("user-1", factory);
    cache.clear(); // equivalente a logout()
    await cache.run("user-1", factory);

    expect(calls).toBe(2);
  });

  it("una factory que rechaza no deja la key trabada para siempre en un estado inconsistente", async () => {
    // Nota: el comportamiento real de sbLoadUserData es cachear tambien la
    // promesa rechazada (no hay retry automatico) — el test documenta ese
    // comportamiento tal cual existe hoy, para que un cambio futuro sea
    // deliberado y no accidental.
    const cache = createDedupeCache();
    const factory = vi.fn(() => Promise.reject(new Error("boom")));

    await expect(cache.run("user-1", factory)).rejects.toThrow("boom");
    await expect(cache.run("user-1", factory)).rejects.toThrow("boom");
    expect(factory).toHaveBeenCalledTimes(1); // dedupe tambien aplica al fallo

    cache.clear();
    await expect(cache.run("user-1", factory)).rejects.toThrow("boom");
    expect(factory).toHaveBeenCalledTimes(2); // clear() lo desbloquea
  });
});

describe("withTimeout (guardia de getSession/queries/fetch)", () => {
  it("resuelve con el valor de la promesa si esta gana antes del timeout", async () => {
    const result = await withTimeout(Promise.resolve("session-ok"), 50);
    expect(result).toBe("session-ok");
  });

  it("rechaza con timeout si la promesa nunca resuelve (Supabase colgado)", async () => {
    const neverResolves = new Promise(() => {}); // simula sb.auth.getSession() colgado
    await expect(withTimeout(neverResolves, 20)).rejects.toThrow("timeout");
  });

  it("propaga el rechazo original si la promesa falla antes del timeout", async () => {
    await expect(withTimeout(Promise.reject(new Error("network down")), 50)).rejects.toThrow(
      "network down"
    );
  });

  it("acepta un mensaje de error custom", async () => {
    const neverResolves = new Promise(() => {});
    await expect(withTimeout(neverResolves, 10, "check-plan timeout")).rejects.toThrow(
      "check-plan timeout"
    );
  });

  it("no cuelga la funcion que la llama aunque la promesa de fetch nunca termine", async () => {
    // Regresion directa del bug de /api/check-plan: fetch() sin limite propio
    // dejaba sbLoadUserData (y con el, boot()) girando para siempre.
    const fakeFetch = () => new Promise(() => {});
    const start = Date.now();
    await expect(withTimeout(fakeFetch(), 15)).rejects.toThrow("timeout");
    expect(Date.now() - start).toBeLessThan(500); // no espero al infinito
  });
});

describe("createLoadGate (guard de indices/Foco de hoy/RSI-SMA20 no determinista)", () => {
  // Regresion directa del bug de dashboard reportado en la auditoria UX del
  // 13-sep: fetchMarketBar/loadAllSigScores/loadIndData marcaban una bandera
  // "_fetched=true" tanto en exito como en el catch(e) de fallo. Un solo
  // timeout de red dejaba esa bandera en true para siempre en la sesion, y la
  // UI quedaba pegada en "sin dato"/"Calculando..." sin reintentar jamas.

  it("dos llamadas concurrentes a run() mientras el fetch esta en vuelo devuelven la MISMA promesa (no dispara fetch duplicado)", () => {
    const gate = createLoadGate(1000);
    let calls = 0;
    const factory = () => new Promise(() => {}); // nunca resuelve, simula in-flight

    const p1 = gate.run(factory);
    const p2 = gate.run(factory);
    calls++; // factory ya se llamo una vez dentro de run() para p1

    expect(gate.isLoading()).toBe(true);
    expect(p1).toBe(p2);
  });

  it("tras un fallo, reintenta solo(!) despues del cooldown en vez de quedar roto para siempre", async () => {
    const gate = createLoadGate(20); // cooldown corto para el test
    let attempts = 0;
    const factory = () => {
      attempts++;
      return attempts === 1 ? Promise.reject(new Error("timeout de red")) : Promise.resolve("ok");
    };

    await expect(gate.run(factory)).rejects.toThrow("timeout de red");
    expect(attempts).toBe(1);

    // Inmediatamente despues del fallo, dentro del cooldown: no reintenta.
    await expect(gate.run(factory)).rejects.toThrow("cooldown");
    expect(attempts).toBe(1);

    // Pasado el cooldown, el proximo render/llamada reintenta solo.
    await new Promise((r) => setTimeout(r, 25));
    await expect(gate.run(factory)).resolves.toBe("ok");
    expect(attempts).toBe(2);
  });

  it("tras un exito, no queda marcado como en curso y una llamada siguiente vuelve a ejecutar la factory", async () => {
    const gate = createLoadGate(0);
    let attempts = 0;
    const factory = () => {
      attempts++;
      return Promise.resolve("v" + attempts);
    };

    await expect(gate.run(factory)).resolves.toBe("v1");
    expect(gate.isLoading()).toBe(false);
    await expect(gate.run(factory)).resolves.toBe("v2");
  });
});
