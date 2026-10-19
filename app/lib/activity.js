// app/lib/activity.js
//
// Cuenta de usuarios activos de Invest (C-10, INV-3 de la auditoría 360): el disparador de cobro
// es 100 usuarios activos por semana y hoy no se podía medir. Una vez por cuenta, por día y por
// dispositivo se llama a invest_record_activity() en Supabase, que guarda (cuenta, hoy) en
// invest_activity_days. La cuenta y el día salen del servidor: la app no manda ningún dato.
// La consulta de WAU está en RUNBOOK.md, sección 6.
//
// Pieza sin DOM ni red propia: recibe el cliente de Supabase y el almacenamiento.

(function (root) {
  "use strict";

  var inflight = {};

  function utcDay(now) {
    return new Date(now).toISOString().slice(0, 10);
  }

  // Devuelve 'saved' (llamó y quedó registrado), 'cached' (ya se registró hoy en este dispositivo),
  // 'skipped' (sin cliente o sin cuenta) o 'error' (no se pudo; se reintenta en la próxima carga).
  // Nunca lanza ni escribe en la consola: la medición no puede romper ni ensuciar la app.
  function recordActivity(sb, userId, storage, now) {
    if (!sb || typeof sb.rpc !== "function" || !userId) return Promise.resolve("skipped");
    var day = utcDay(now == null ? Date.now() : now);
    var key = "inv_act_" + userId;
    try {
      if (storage && storage.getItem(key) === day) return Promise.resolve("cached");
    } catch (e) { /* sin almacenamiento: se llama igual */ }
    var flight = key + "|" + day;
    if (inflight[flight]) return inflight[flight];
    inflight[flight] = Promise.resolve()
      .then(function () { return sb.rpc("invest_record_activity"); })
      .then(function (res) {
        if (res && res.error) return "error";
        try { if (storage) storage.setItem(key, day); } catch (e) { /* ignorar */ }
        return "saved";
      }, function () { return "error"; })
      .then(function (out) { delete inflight[flight]; return out; });
    return inflight[flight];
  }

  var api = { utcDay: utcDay, recordActivity: recordActivity };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.InvestActivity = api;
})(typeof window !== "undefined" ? window : globalThis);
