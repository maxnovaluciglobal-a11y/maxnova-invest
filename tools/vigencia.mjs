// Fecha de vigencia de los textos legales: un solo lugar (tools/vigencia.json).
// Mientras "fecha" sea null, términos, privacidad y los resúmenes de la app muestran
// FECHA-DEL-DESPLIEGUE con data-vigencia="pendiente". El día del push a main:
// `node tools/set-vigencia.mjs AAAA-MM-DD`. test/legal-rebrand.test.js comprueba que todo
// coincida y, en main o con RELEASE=1, que no quede ningún marcador.
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const JSON_PATH = join(ROOT, "tools", "vigencia.json");
export const MARCADORES = ["FECHA-DEL-DESPLIEGUE", "[FECHA DEL DESPLIEGUE]", "[DEPLOYMENT DATE]", 'data-vigencia="pendiente"'];
export const SPAN = /<span data-vigencia="([^"]*)">([^<]*)<\/span>/g;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const SKIP = new Set([".git", ".vercel", "node_modules", "test", "tools", "supabase", "_pausa", "_historico", ".impeccable", ".claude"]);

export const leer = () => JSON.parse(readFileSync(JSON_PATH, "utf8")).fecha;

export function formatear(fecha) {
  if (!fecha) return "FECHA-DEL-DESPLIEGUE";
  const [y, m, d] = fecha.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

export const spanEsperado = (fecha) => `<span data-vigencia="${fecha || "pendiente"}">${formatear(fecha)}</span>`;

export function esFechaValida(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Archivos que se publican y pueden llevar texto visible (HTML, JS, txt, manifest). */
export function publicados(dir = ROOT, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) publicados(join(dir, e.name), out); }
    else if (/\.(html|js|txt|webmanifest)$/.test(e.name)) out.push(relative(ROOT, join(dir, e.name)));
  }
  return out.sort();
}

/** Rama actual: Vercel o CI primero; si no, git. */
export function rama() {
  const env = process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME;
  if (env) return env;
  try { return execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return ""; }
}

/** Publicación: rama main o RELEASE=1. Ahí la fecha es obligatoria. */
export const esPublicacion = () => process.env.RELEASE === "1" || rama() === "main";
