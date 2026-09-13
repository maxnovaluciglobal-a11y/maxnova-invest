// app/lib/async-guards.js
//
// Extraido de app/index.html el 12-sep-2026 al armar la suite de tests.
// Contiene los dos patrones que causaron bugs reales en produccion:
//
// 1. withTimeout(promise, ms): el patron Promise.race([promise, timeout])
//    repetido ~10 veces en index.html (sb.auth.getSession(), queries a
//    Supabase, fetch a /api/check-plan). Sin esto una llamada colgada
//    dejaba boot()/sbLoadUserData() girando para siempre (pantalla en
//    blanco / spinner infinito).
//
// 2. createDedupeCache(): el guard usado por sbLoadUserData para no
//    ejecutar dos veces en paralelo la carga de datos del mismo usuario.
//    boot()/doLogin()/doRegister() llaman a sbLoadUserData directo, y
//    sb.auth.onAuthStateChange (SIGNED_IN) la llama de nuevo para el MISMO
//    evento — sin el guard, las dos corrian en paralelo pisandose el mismo
//    estado global (window.cgConfirm del consent gate, inserts duplicados
//    a portfolio_holdings/watchlist/consents) y colgaban la pagina.
//    Reproducido en vivo el 12-sep: signup -> consent gate -> "Confirmar y
//    continuar" -> pagina congelada.
//
// UMD-lite: en el browser (index.html lo carga como <script> clasico,
// ANTES del script inline principal) expone window.withTimeout y
// window.createDedupeCache. En Node/Vitest se exporta via module.exports.

(function (root) {
  "use strict";

  function withTimeout(promise, ms, message) {
    return Promise.race([
      Promise.resolve(promise),
      new Promise(function (_, reject) {
        setTimeout(function () {
          reject(new Error(message || "timeout"));
        }, ms);
      }),
    ]);
  }

  // Fabrica un guard de-dup por clave: la primera llamada a run(key, factory)
  // ejecuta factory() y cachea la promesa resultante; llamadas concurrentes
  // con la MISMA clave devuelven esa misma promesa en vez de invocar factory
  // de nuevo. clear() resetea el cache completo (se usa en logout, para que
  // el proximo login cargue fresco).
  function createDedupeCache() {
    var cache = {};
    return {
      run: function (key, factory) {
        var existing = cache[key];
        if (existing) return existing;
        var p = factory();
        cache[key] = p;
        return p;
      },
      clear: function () {
        cache = {};
      },
      has: function (key) {
        return Object.prototype.hasOwnProperty.call(cache, key);
      },
    };
  }

  // Fabrica un gate de carga con reintento tras fallo — extraido el 13-sep-2026
  // al arreglar el bug de dashboard no-determinista (indices/Foco de hoy que
  // a veces quedaban en "sin dato"/"Calculando..." para siempre tras un
  // recargar).
  //
  // El patron roto que reemplaza (fetchMarketBar/loadAllSigScores/loadIndData
  // en index.html) era: una bandera booleana "_fetched=true" que se marcaba
  // dentro del catch(e) tanto en exito como en fallo. Una vez que un fetch
  // fallaba una sola vez (timeout de red, API caida), la bandera quedaba en
  // true PARA SIEMPRE en esa sesion — ningun render posterior volvia a
  // intentarlo, y la UI quedaba pegada en su estado vacio/de carga inicial
  // sin ningun mensaje de error. Ademas, si renderMain() se llamaba varias
  // veces antes de que el primer fetch resolviera (navegacion + otro evento
  // disparando otro render), se lanzaban fetches concurrentes duplicados.
  //
  // run(factory) devuelve la promesa en curso si ya hay una in-flight (dedup),
  // y si el ultimo intento fallo, deja pasar un intento nuevo recien despues
  // de cooldownMs — asi el proximo render de esa pantalla reintenta solo, sin
  // reload completo ni fetches en loop.
  function createLoadGate(cooldownMs) {
    var inFlight = null;
    var lastFailAt = 0;
    var cooldown = cooldownMs || 0;
    return {
      run: function (factory) {
        if (inFlight) return inFlight;
        if (lastFailAt && Date.now() - lastFailAt < cooldown) {
          return Promise.reject(new Error("cooldown"));
        }
        var p;
        try {
          p = Promise.resolve(factory());
        } catch (e) {
          lastFailAt = Date.now();
          return Promise.reject(e);
        }
        inFlight = p.then(
          function (v) {
            inFlight = null;
            lastFailAt = 0;
            return v;
          },
          function (e) {
            inFlight = null;
            lastFailAt = Date.now();
            throw e;
          }
        );
        return inFlight;
      },
      isLoading: function () {
        return !!inFlight;
      },
    };
  }

  var api = {
    withTimeout: withTimeout,
    createDedupeCache: createDedupeCache,
    createLoadGate: createLoadGate,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof root !== "undefined") {
    root.withTimeout = withTimeout;
    root.createDedupeCache = createDedupeCache;
    root.createLoadGate = createLoadGate;
  }
})(typeof window !== "undefined" ? window : globalThis);
