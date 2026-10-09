// app/lib/readings.js
//
// Relanzamiento v2 (oct-2026, ticket T18). Reemplaza la "nota" agregada de
// 0 a 100 por activo (que se leía como una calificación de compra) por una
// lectura por indicador: cada uno muestra su valor, su rango de referencia y
// una frase en lenguaje simple. También centraliza la etiqueta de frescura de
// cada precio ("Al día", "Retraso N min", "Mercado cerrado", "Sin conexión"),
// calculada con la hora que informa la fuente, no con la hora de la consulta.
//
// Reglas de copy (legales y de voz): describir lo que muestran los datos
// históricos, nunca qué hacer. Nada de "comprar", "vender", "acumular",
// "entrada", "oportunidad" ni colores que premien la sobreventa.
//
// Funciones puras, sin DOM ni red. Se exponen en window para app/index.html
// y por module.exports para los tests (test/readings.test.js).

(function (root) {
  "use strict";

  function isNum(v) {
    return typeof v === "number" && isFinite(v);
  }

  // Formato es-CL simple, sin depender de Intl (los tests corren en Node).
  function fmtNum(v, dec) {
    var s = Math.abs(v).toFixed(dec == null ? 1 : dec).replace(".", ",");
    return (v < 0 ? "−" : "") + s;
  }
  function fmtPct(v, dec) {
    // v en fracción (0.046 = 4,6 %)
    var p = v * 100;
    return (p > 0 ? "+" : "") + fmtNum(p, dec == null ? 1 : dec) + " %";
  }

  // ── Tendencia ─────────────────────────────────────────────────────
  // UP: precio sobre la media de 50 y la de 200 días (o solo la de 50 si no
  // hay 200 días de historia). DOWN: bajo ambas. MIX: entre medias.
  function classifyTrend(last, s50, s200) {
    if (!isNum(last) || !isNum(s50)) return null;
    var above50 = last > s50;
    if (!isNum(s200)) return above50 ? "UP" : "DOWN";
    var above200 = last > s200;
    if (above50 && above200) return "UP";
    if (!above50 && !above200) return "DOWN";
    return "MIX";
  }

  var TREND_LABELS = {
    UP: "Sobre sus medias",
    MIX: "Tendencia mixta",
    DOWN: "Bajo sus medias",
  };
  function trendLabel(code) {
    return TREND_LABELS[code] || "Calculando";
  }

  // ── RSI ───────────────────────────────────────────────────────────
  function rsiZone(rsi) {
    if (!isNum(rsi)) return { key: "na", label: "Sin dato", reading: "Sin historia suficiente para calcularlo." };
    if (rsi >= 70)
      return { key: "high", label: "Sobre 70", reading: "Zona que suele leerse como sobrecompra: subió rápido en las últimas semanas." };
    if (rsi <= 30)
      return { key: "low", label: "Bajo 30", reading: "Zona que suele leerse como sobreventa: bajó rápido en las últimas semanas." };
    return { key: "mid", label: "Zona neutral", reading: "Entre 30 y 70: ni sobrecomprado ni sobrevendido." };
  }

  // ── RSI (14) de Wilder: la UNICA implementacion de la app ─────────
  // Fase 3 (oct-2026): AAPL mostraba 50 / 62,9 / 67 segun la pantalla porque
  // cada una calculaba sobre una serie distinta (2 meses, 3 meses, 1 año).
  // Ahora TI.rsi delega aqui y todas las vistas usan la misma serie diaria
  // de un año. Devuelve un arreglo del mismo largo que closes: los primeros
  // n valores son null (antes 50, un dato inventado).
  function rsiSeries(closes, n) {
    n = n || 14;
    var p = closes || [];
    var out = p.map(function () { return null; });
    if (p.length < n + 1) return out;
    var ag = 0, al = 0;
    for (var i = 1; i <= n; i++) {
      var d = p[i] - p[i - 1];
      if (d > 0) ag += d; else al -= d;
    }
    ag /= n; al /= n;
    out[n] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    for (var j = n + 1; j < p.length; j++) {
      var dd = p[j] - p[j - 1];
      ag = (ag * (n - 1) + (dd > 0 ? dd : 0)) / n;
      al = (al * (n - 1) + (dd < 0 ? -dd : 0)) / n;
      out[j] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }
    return out;
  }
  function lastRsi(closes, n) {
    var a = rsiSeries(closes, n);
    for (var i = a.length - 1; i >= 0; i--) if (isNum(a[i])) return a[i];
    return null;
  }

  // ── Lecturas por indicador ────────────────────────────────────────
  // input: {last, rsi, s50, s200, macdHist, macdPrev, volRatio, priceUp,
  //         high52, atr}
  // Devuelve [{key, label, value, range, reading, tone}] con tone en
  // 'pos' | 'neg' | 'warn' | 'neu' (solo describe el dato, no premia nada).
  function buildReadings(i) {
    i = i || {};
    var out = [];
    var last = i.last;

    if (isNum(last) && isNum(i.s200)) {
      var d200 = (last - i.s200) / i.s200;
      out.push({
        key: "sma200",
        label: "Media de 200 días",
        value: fmtPct(d200),
        range: "Sobre o bajo su promedio de ~10 meses",
        reading: d200 >= 0
          ? "Cotiza por encima de su promedio de 200 días: la tendencia de largo plazo es alcista."
          : "Cotiza por debajo de su promedio de 200 días: la tendencia de largo plazo es bajista.",
        tone: d200 >= 0 ? "pos" : "neg",
      });
    }
    if (isNum(last) && isNum(i.s50)) {
      var d50 = (last - i.s50) / i.s50;
      out.push({
        key: "sma50",
        label: "Media de 50 días",
        value: fmtPct(d50),
        range: "Sobre o bajo su promedio de ~2 meses",
        reading: d50 >= 0
          ? "Por encima de su promedio de 50 días: el movimiento de los últimos meses sigue al alza."
          : "Por debajo de su promedio de 50 días: el movimiento de los últimos meses es a la baja.",
        tone: d50 >= 0 ? "pos" : "neg",
      });
    }
    if (isNum(i.rsi)) {
      var z = rsiZone(i.rsi);
      out.push({
        key: "rsi",
        label: "RSI (14)",
        value: fmtNum(i.rsi, 0),
        range: "0 a 100 · neutral entre 30 y 70",
        reading: z.reading,
        tone: z.key === "mid" ? "neu" : "warn",
      });
    }
    if (isNum(i.macdHist)) {
      var up = isNum(i.macdPrev) ? i.macdHist > i.macdPrev : null;
      var r;
      if (i.macdHist >= 0) r = up === false ? "Impulso de corto plazo positivo, pero perdiendo fuerza." : "Impulso de corto plazo positivo.";
      else r = up === true ? "Impulso de corto plazo negativo, pero recuperándose." : "Impulso de corto plazo negativo.";
      out.push({
        key: "macd",
        label: "MACD (12, 26, 9)",
        value: (i.macdHist >= 0 ? "Sobre cero" : "Bajo cero"),
        range: "Histograma sobre o bajo cero",
        reading: r,
        tone: i.macdHist >= 0 ? "pos" : "neg",
      });
    }
    if (isNum(i.volRatio)) {
      var dv = i.volRatio - 1;
      var rv;
      if (dv >= 0.2) rv = "El movimiento de hoy tiene más participación que lo habitual.";
      else if (dv <= -0.2) rv = "El movimiento de hoy tiene poca participación.";
      else rv = "Participación similar a la habitual.";
      out.push({
        key: "vol",
        label: "Volumen",
        value: fmtPct(dv, 0),
        range: "Frente a su promedio de 20 días",
        reading: rv,
        tone: "neu",
      });
    }
    if (isNum(last) && isNum(i.high52) && i.high52 > 0) {
      var dh = (last - i.high52) / i.high52;
      out.push({
        key: "high52",
        label: "Máximo de 52 semanas",
        value: fmtPct(dh),
        range: "Distancia al precio más alto del último año",
        reading: dh > -0.03
          ? "Cotiza cerca de su máximo del último año."
          : "Cotiza " + fmtNum(-dh * 100, 0) + " % bajo su máximo del último año.",
        tone: "neu",
      });
    }
    if (isNum(last) && isNum(i.atr) && last > 0) {
      var ap = i.atr / last;
      out.push({
        key: "atr",
        label: "Volatilidad (ATR 14)",
        value: fmtNum(ap * 100, 1) + " %",
        range: "Movimiento diario promedio",
        reading: "En un día típico se mueve alrededor de " + fmtNum(ap * 100, 1) + " % (" + fmtNum(i.atr, 2) + " en precio).",
        tone: "neu",
      });
    }
    return out;
  }

  // ── Frescura de precios ───────────────────────────────────────────
  // q: {marketTime (ms, hora del último precio según la fuente),
  //     tradingStart, tradingEnd (ms, sesión regular), fetchedAt}
  // now: ms. failed: true si la última actualización falló.
  // Devuelve {state, minutes, time, label}:
  //   offline  → "Sin conexión · hh:mm"
  //   closed   → "Mercado cerrado · hh:mm"
  //   live     → "Al día · hh:mm"            (≤ 2 min de diferencia)
  //   delayed  → "Retraso N min · hh:mm"
  //   unknown  → "Retraso no informado · consultado hh:mm"
  function hhmm(ms, tz) {
    var d = new Date(ms);
    try {
      return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz || undefined });
    } catch (e) {
      var h = d.getHours(), m = d.getMinutes();
      return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
    }
  }

  function quoteFreshness(q, now, failed, tz) {
    now = isNum(now) ? now : Date.now();
    var mt = q && isNum(q.marketTime) ? q.marketTime : null;
    if (failed) {
      var t = mt || (q && q.fetchedAt) || null;
      return { state: "offline", minutes: null, time: t, label: "Sin conexión" + (t ? " · " + hhmm(t, tz) : "") };
    }
    if (!mt) {
      var ft = q && isNum(q.fetchedAt) ? q.fetchedAt : null;
      return { state: "unknown", minutes: null, time: ft, label: "Retraso no informado" + (ft ? " · consultado " + hhmm(ft, tz) : "") };
    }
    var end = q && isNum(q.tradingEnd) ? q.tradingEnd : null;
    var start = q && isNum(q.tradingStart) ? q.tradingStart : null;
    if ((end && now > end) || (start && now < start)) {
      return { state: "closed", minutes: null, time: mt, label: "Mercado cerrado · " + hhmm(mt, tz) };
    }
    var min = Math.max(0, Math.round((now - mt) / 60000));
    if (min <= 2) return { state: "live", minutes: min, time: mt, label: "Al día · " + hhmm(mt, tz) };
    return { state: "delayed", minutes: min, time: mt, label: "Retraso " + min + " min · " + hhmm(mt, tz) };
  }

  // Resumen para la etiqueta global: toma el peor caso entre los precios
  // cargados (el más atrasado de los mercados abiertos).
  function summarizeFreshness(quotes, now, failed, tz) {
    now = isNum(now) ? now : Date.now();
    var list = (quotes || []).filter(Boolean);
    if (failed) {
      var lastT = 0;
      list.forEach(function (q) { var t = q.marketTime || q.fetchedAt || 0; if (t > lastT) lastT = t; });
      return { state: "offline", minutes: null, time: lastT || null, label: "Sin conexión" + (lastT ? " · " + hhmm(lastT, tz) : "") };
    }
    var worst = null, anyClosed = null, anyUnknown = null;
    list.forEach(function (q) {
      var f = quoteFreshness(q, now, false, tz);
      if (f.state === "live" || f.state === "delayed") {
        if (!worst || f.minutes > worst.minutes) worst = f;
      } else if (f.state === "closed") {
        if (!anyClosed || f.time > anyClosed.time) anyClosed = f;
      } else if (!anyUnknown) {
        anyUnknown = f;
      }
    });
    if (worst) {
      if (worst.state === "live") return worst;
      return { state: "delayed", minutes: worst.minutes, time: worst.time, label: "Retraso hasta " + worst.minutes + " min · " + hhmm(worst.time, tz) };
    }
    if (anyClosed) return anyClosed;
    if (anyUnknown) return anyUnknown;
    return { state: "unknown", minutes: null, time: null, label: "Cargando precios" };
  }

  var api = {
    classifyTrend: classifyTrend,
    trendLabel: trendLabel,
    rsiZone: rsiZone,
    rsiSeries: rsiSeries,
    lastRsi: lastRsi,
    buildReadings: buildReadings,
    quoteFreshness: quoteFreshness,
    summarizeFreshness: summarizeFreshness,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") {
    root.classifyTrend = classifyTrend;
    root.trendLabel = trendLabel;
    root.rsiZone = rsiZone;
    root.rsiSeries = rsiSeries;
    root.lastRsi = lastRsi;
    root.buildReadings = buildReadings;
    root.quoteFreshness = quoteFreshness;
    root.summarizeFreshness = summarizeFreshness;
  }
})(typeof window !== "undefined" ? window : globalThis);
