/**
 * Seguridad de la subida de imágenes a ImageKit (contra la API real).
 *
 *   node --env-file-if-exists=.env.local tests/e2e/security-upload.mjs
 *
 * No necesita el servidor de la app: habla directamente con ImageKit con la
 * misma firma que emite POST /api/upload-auth.
 *
 * Qué comprueba:
 *   1. Una firma válida sube el archivo a la carpeta de la tienda.
 *   2. La firma es de un solo uso: reutilizarla se rechaza.
 *   3. Una firma expirada se rechaza.
 *   4. La firma NO ata la carpeta de destino: con una firma propia se puede
 *      escribir en la carpeta de otra tienda. Este es el hallazgo: la
 *      comprobación la hace upload-commit (que además borra el archivo), pero
 *      un cliente que nunca llama a commit deja el archivo ahí, sin contabilizar
 *      en la cuota de nadie.
 *   5. La carpeta con recorrido relativo no permite escapar de /stores/.
 *
 * Limpia al terminar: borra del DAM todos los archivos que sube.
 */

import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY;
const PUBLIC_KEY = process.env.IMAGEKIT_PUBLIC_KEY;
const API = "https://api.imagekit.io";
const UPLOAD = "https://upload.imagekit.io/api/v1/files/upload";

if (!PRIVATE_KEY || !PUBLIC_KEY) {
  console.log("SKIP  falta IMAGEKIT_PRIVATE_KEY / IMAGEKIT_PUBLIC_KEY: no se puede probar la subida.");
  process.exit(0);
}

const results = [];
/**
 * Registra una comprobación. `expected = false` marca un hallazgo conocido:
 * se muestra como FAIL* pero no rompe la batería.
 */
function check(name, ok, detail = "", expected = true) {
  results.push({ name, ok, detail, expected });
  const marca = ok ? "PASS" : expected ? "FAIL" : "FAIL*";
  console.log(`${marca}  ${name}${detail ? `  (${detail})` : ""}`);
}

const sign = (token, expire) =>
  createHmac("sha1", PRIVATE_KEY).update(`${token}${expire}`).digest("hex");

const basic = () => `Basic ${Buffer.from(`${PRIVATE_KEY}:`).toString("base64")}`;

async function upload({ folder, fileName, token, expire, useUniqueFileName = true }) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([readFileSync(join(FIXTURES, "sample.png"))], { type: "image/png" }),
    fileName,
  );
  form.append("fileName", fileName);
  form.append("publicKey", PUBLIC_KEY);
  form.append("signature", sign(token, expire));
  form.append("expire", String(expire));
  form.append("token", token);
  form.append("folder", folder);
  form.append("useUniqueFileName", String(useUniqueFileName));
  const res = await fetch(UPLOAD, { method: "POST", body: form });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* respuesta no JSON */
  }
  return { status: res.status, json, message: json?.message ?? text.slice(0, 200) };
}

async function details(fileId) {
  const res = await fetch(`${API}/v1/files/${encodeURIComponent(fileId)}/details`, {
    headers: { Authorization: basic(), Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`details HTTP ${res.status}`);
  return res.json();
}

async function remove(fileId) {
  if (!fileId) return;
  await fetch(`${API}/v1/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: basic() },
  });
}

// Tiendas ficticias: solo son identificadores de carpeta en el DAM.
const STORE_A = "e2e00000-0000-0000-0000-00000000000a";
const STORE_B = "e2e00000-0000-0000-0000-00000000000b";
const CARPETA_A = `/stores/${STORE_A}/`;
const CARPETA_B = `/stores/${STORE_B}/`;

const subidos = [];
const ahora = Math.floor(Date.now() / 1000);

try {
  // 1. Firma válida -----------------------------------------------------------
  const token1 = `qa-${ahora}-a`;
  const expire1 = ahora + 60;
  const r1 = await upload({
    folder: CARPETA_A,
    fileName: "segura.png",
    token: token1,
    expire: expire1,
  });
  if (r1.json?.fileId) subidos.push(r1.json.fileId);
  check(
    "una firma válida sube el archivo a la carpeta de la tienda",
    r1.status === 200 && String(r1.json?.filePath ?? "").startsWith(CARPETA_A),
    r1.json?.filePath ?? r1.message,
  );

  // 2. La firma es de un solo uso --------------------------------------------
  const r2 = await upload({
    folder: CARPETA_A,
    fileName: "reuso.png",
    token: token1,
    expire: expire1,
  });
  if (r2.json?.fileId) subidos.push(r2.json.fileId);
  check(
    "la firma es de un solo uso: reutilizarla se rechaza",
    r2.status >= 400,
    `HTTP ${r2.status} ${String(r2.message).slice(0, 80)}`,
  );

  // 3. Firma expirada --------------------------------------------------------
  const r3 = await upload({
    folder: CARPETA_A,
    fileName: "expirada.png",
    token: `qa-${ahora}-x`,
    expire: ahora - 120,
  });
  if (r3.json?.fileId) subidos.push(r3.json.fileId);
  check(
    "una firma expirada se rechaza",
    r3.status >= 400,
    `HTTP ${r3.status} ${String(r3.message).slice(0, 80)}`,
  );

  // 4. La firma no ata la carpeta --------------------------------------------
  const token4 = `qa-${ahora}-b`;
  const expire4 = ahora + 60;
  const r4 = await upload({
    folder: CARPETA_B,
    fileName: "ajena.png",
    token: token4,
    expire: expire4,
  });
  if (r4.json?.fileId) subidos.push(r4.json.fileId);
  const det4 = r4.json?.fileId ? await details(r4.json.fileId).catch(() => null) : null;
  check(
    "la firma propia NO debería poder escribir en la carpeta de otra tienda",
    r4.status >= 400,
    det4
      ? `HTTP ${r4.status}, el archivo quedó en ${det4.filePath}`
      : `HTTP ${r4.status} ${String(r4.message).slice(0, 80)}`,
    false,
  );

  // 5. Recorrido relativo en la carpeta --------------------------------------
  const token5 = `qa-${ahora}-c`;
  const r5 = await upload({
    folder: `${CARPETA_A}../${STORE_B}/`,
    fileName: "recorrido.png",
    token: token5,
    expire: ahora + 60,
  });
  if (r5.json?.fileId) subidos.push(r5.json.fileId);
  const det5 = r5.json?.fileId ? await details(r5.json.fileId).catch(() => null) : null;
  check(
    "una carpeta con recorrido relativo no escapa de /stores/{id}/",
    r5.status >= 400 || !String(det5?.filePath ?? "").includes(STORE_B),
    det5 ? `HTTP ${r5.status}, el archivo quedó en ${det5.filePath}` : `HTTP ${r5.status}`,
  );
} finally {
  for (const fileId of subidos) {
    await remove(fileId);
  }
}

const inesperados = results.filter((r) => !r.ok && r.expected);
const documentados = results.filter((r) => !r.ok && !r.expected);
console.log(
  `\n${results.length - inesperados.length - documentados.length}/${results.length} comprobaciones de subida superadas`,
);
if (documentados.length > 0) {
  console.log(`HALLAZGOS DOCUMENTADOS (${documentados.length}):`);
  for (const f of documentados) console.log(`  - ${f.name} (${f.detail})`);
}
if (inesperados.length > 0) {
  console.log(`FALLOS INESPERADOS (${inesperados.length}):`);
  for (const f of inesperados) console.log(`  - ${f.name} (${f.detail})`);
}
process.exit(inesperados.length > 0 ? 1 : 0);
