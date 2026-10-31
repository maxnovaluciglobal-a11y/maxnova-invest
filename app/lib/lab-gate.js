// app/lib/lab-gate.js
//
// Puerta de los experimentos internos: es el ÚNICO lugar con la lista de cuentas.
// Quien no está en la lista no descarga el módulo: no ve menú, texto ni pantalla.

(function (root) {
  "use strict";

  var ALLOWED = [
    "2667fd4a-f89b-4ef7-b2e9-153ea93795df",
    "8cf37241-3e65-400c-925c-aece074d561f",
  ];
  var SCRIPT = "/app/lib/lab-sugerido.js";

  function allowed(uid) {
    return typeof uid === "string" && ALLOWED.indexOf(uid.toLowerCase()) >= 0;
  }

  function load(uid, doc) {
    if (!allowed(uid)) return false;
    if (root.InvestLab) { root.InvestLab.init(); return true; }
    var d = doc || root.document;
    if (!d || d.getElementById("lab-js")) return true;
    var s = d.createElement("script");
    s.id = "lab-js";
    s.src = SCRIPT;
    s.async = true;
    d.head.appendChild(s);
    return true;
  }

  var api = { allowed: allowed, load: load };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.InvestLabGate = api;
})(typeof window !== "undefined" ? window : globalThis);
