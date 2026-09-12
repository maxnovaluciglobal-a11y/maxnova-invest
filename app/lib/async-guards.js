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

  var api = { withTimeout: withTimeout, createDedupeCache: createDedupeCache };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof root !== "undefined") {
    root.withTimeout = withTimeout;
    root.createDedupeCache = createDedupeCache;
  }
})(typeof window !== "undefined" ? window : globalThis);
