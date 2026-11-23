// Service worker "kill switch" de invest.moyiq.app (23-nov-2026).
//
// Inversiones ya vive dentro de la app (https://app.moyiq.app/app/) y este
// sitio redirige ahí con 308 (vercel.json). Quien instaló la PWA vieja tiene un
// service worker en /sw.js (caché 'moyiq-invest-vN') que servía el shell desde
// la caché y, sin conexión o con la caché caliente, nunca vería la redirección.
//
// Este archivo lo reemplaza: el navegador lo baja al revisar actualizaciones
// (sw.js va con Cache-Control: no-cache y NO se redirige), lo instala sin
// esperar, borra todas las cachés, se desregistra y lleva las pestañas abiertas
// a la app. No intercepta nada (sin listener de fetch): todo va directo a la red.
var TARGET = 'https://app.moyiq.app/app/?open=invest-resumen';

// Páginas que siguen vivas en este dominio: una pestaña abierta en ellas no se
// mueve (la app enlaza a datos-y-licencias, y los legales siguen publicados).
var KEEP = ['/datos-y-licencias.html', '/terms.html', '/privacy.html', '/404.html'];

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
      .catch(function () { /* sin Cache Storage: no hay nada que borrar */ })
      .then(function () { return self.registration.unregister(); })
      .catch(function () { /* ya desregistrado */ })
      .then(function () { return self.clients.matchAll({ type: 'window' }); })
      .then(function (list) {
        return Promise.all((list || []).map(function (c) {
          var path = '';
          try { path = new URL(c.url).pathname; } catch (err) { path = ''; }
          if (KEEP.indexOf(path) !== -1 || path.indexOf('/api/') === 0) return null;
          return c.navigate(TARGET).catch(function () { return null; });
        }));
      })
      .catch(function () { /* navegador sin clients.navigate: la próxima carga ya va por la red */ })
  );
});
