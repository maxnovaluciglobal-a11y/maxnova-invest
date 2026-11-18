#!/usr/bin/env node
// Uso: node tools/set-vigencia.mjs AAAA-MM-DD
// Fija la fecha de vigencia de términos y privacidad en tools/vigencia.json y en cada
// <span data-vigencia> de los archivos publicados (términos, privacidad y resúmenes de la app).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, JSON_PATH, SPAN, spanEsperado, esFechaValida, publicados } from "./vigencia.mjs";

const fecha = process.argv[2];
if (!esFechaValida(fecha)) {
  console.error("Uso: node tools/set-vigencia.mjs AAAA-MM-DD (fecha real del push a main)");
  process.exit(1);
}
writeFileSync(JSON_PATH, JSON.stringify({ fecha }, null, 2) + "\n");
let total = 0;
for (const rel of publicados()) {
  const t = readFileSync(join(ROOT, rel), "utf8");
  let n = 0;
  const out = t.replace(SPAN, () => { n++; return spanEsperado(fecha); });
  if (n) { writeFileSync(join(ROOT, rel), out); total += n; console.log(`${rel}: ${n}`); }
}
console.log(`Fecha ${fecha} escrita en ${total} lugares y en tools/vigencia.json.`);
