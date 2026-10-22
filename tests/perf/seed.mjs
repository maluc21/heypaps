/**
 * Banco de pruebas de desempeño.
 *
 * Crea una tienda con el limite del plan free (30 productos), variantes,
 * categorias, etiquetas e imagenes reales en el DAM. Sirve para medir con
 * datos realistas en vez de una base vacia.
 *
 *   node --env-file=.env.local tests/perf/seed.mjs
 *
 * Escribe en la base enlazada. Los datos se borran con
 * tests/e2e/cleanup-e2e.sql (las tiendas y usuarios con prefijo 'perf-').
 */

import { createClient } from "@supabase/supabase-js";
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const IK_PRIVATE = process.env.IMAGEKIT_PRIVATE_KEY;
const IK_PUBLIC = process.env.IMAGEKIT_PUBLIC_KEY;

if (!URL || !SERVICE) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const STAMP = Date.now();
const EMAIL = `perf-${STAMP}@test.test`;
const PASSWORD = `perf-${STAMP}`;
const SLUG = `perf-tienda-${STAMP}`;
const CATEGORIES = ["Zapatos", "Ropa", "Accesorios"];
const TAGS = [
  { name: "Nuevo", color: "#16a34a" },
  { name: "Oferta", color: "#e11d48" },
];

async function subirImagen(nombre) {
  if (!IK_PRIVATE) return null;
  const png = generarPngRuido(300, 300);
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), `${nombre}.png`);
  form.append("fileName", `${nombre}.png`);
  form.append("publicKey", IK_PUBLIC ?? "");
  form.append("folder", "/perf-semilla/");
  const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${IK_PRIVATE}:`).toString("base64")}` },
    body: form,
  });
  if (!res.ok) return null;
  const data = await res.json();
  // products.images guarda la RUTA del archivo: es la que forma la URL publica.
  return data.filePath ?? null;
}

/**
 * PNG de ruido aleatorio: no comprime, asi que ocupa el peso de una foto de
 * producto real (unos 270 KB). Con un PNG de 1x1 la medicion de imagenes no
 * diria nada.
 */
function generarPngRuido(ancho, alto) {
  const filas = Buffer.alloc(alto * (1 + ancho * 3));
  for (let y = 0; y < alto; y++) {
    const inicio = y * (1 + ancho * 3);
    filas[inicio] = 0;
    for (let x = 0; x < ancho; x++) {
      const p = inicio + 1 + x * 3;
      filas[p] = (x * 7 + y * 13) % 256;
      filas[p + 1] = (x * 29 + y * 3) % 256;
      filas[p + 2] = (x * 101 + y * 57) % 256;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const trozo = (tipo, datos) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(datos.length);
    const td = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", deflateSync(filas)),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

console.log("1. creando usuario...");
const { error: userError } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});if (userError) throw new Error(`usuario: ${userError.message}`);

// Las RPC de escritura solo las puede llamar un usuario con sesion: es el
// camino real de la app (y el mismo que mide el panel).
const usuario = createClient(URL, ANON_KEY, { auth: { persistSession: false } });
const { error: loginError } = await usuario.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
});
if (loginError) throw new Error(`sesion: ${loginError.message}`);

console.log("2. creando tienda...");
const { data: store, error: storeError } = await usuario.rpc("create_store", {
  p_slug: SLUG,
  p_name: "Perf Tienda",
  p_description: "Tienda de pruebas de rendimiento",
  p_whatsapp_e164: "+50412345678",
  p_currency: "HNL",
  p_appearance: {},
});
if (storeError) throw new Error(`tienda: ${storeError.message}`);
// create_store devuelve el uuid directamente, no un objeto.
const storeId = store;

console.log("3. subiendo imagenes...");
const imagenes = [];
for (let i = 0; i < 3; i++) {
  const fileId = await subirImagen(`perf-${i}`);
  if (fileId) imagenes.push(fileId);
}
console.log(`   ${imagenes.length} imagenes en el DAM`);

console.log("4. categorias y etiquetas...");
const categoriaIds = [];
for (const nombre of CATEGORIES) {
  const { data: id, error } = await usuario.rpc("create_category", {
    p_store_id: storeId,
    p_name: nombre,
    p_slug: nombre.toLowerCase(),
  });
  if (error) throw new Error(`categoria: ${error.message}`);
  categoriaIds.push(id);
}
const tagIds = [];
for (const t of TAGS) {
  const { data: id, error } = await usuario.rpc("create_tag", {
    p_store_id: storeId,
    p_name: t.name,
    p_color: t.color,
  });
  if (error) throw new Error(`etiqueta: ${error.message}`);
  tagIds.push(id);
}

console.log("5. creando 30 productos con variantes...");
const slugs = [];
for (let i = 0; i < 30; i++) {
  const nombre = `Producto de prueba ${i + 1}`;
  const slug = `producto-${i + 1}`;
  const { data: created, error } = await usuario.rpc("create_product_with_variant", {
    p_store_id: storeId,
    p_slug: slug,
    p_name: nombre,
    p_description: `Descripción del producto ${i + 1} con texto suficiente para medir el render.`,
    p_category_id: categoriaIds[i % categoriaIds.length],
    p_tag_id: tagIds[i % tagIds.length],
    p_attributes: [],
    p_images: imagenes.length > 0 ? [imagenes[i % imagenes.length]] : [],
    p_position: i,
    p_variant_attributes: {},
    p_sku: null,
    p_price_cents: 10000 + i * 500,
    p_discount_type: "none",
    p_discount_value: 0,
    p_stock: 10 + i,
    p_image_file_id: null,
  });
  if (error) throw new Error(`producto ${i + 1}: ${error.message}`);
  slugs.push(created.slug);

  // El 30% de los productos con dos tallas: es el caso que estresa el editor.
  if (i % 3 === 0) {
    const { error: vError } = await usuario.rpc("upsert_variant", {
      p_product_id: created.id,
      p_variant_id: null,
      p_attributes: { Talle: "M" },
      p_sku: null,
      p_price_cents: 12000 + i * 500,
      p_discount_type: "none",
      p_discount_value: 0,
      p_stock: 5,
      p_active: true,
      p_position: 1,
      p_expected_version: 1,
    });
    if (vError) throw new Error(`variante ${i + 1}: ${vError.message}`);
  }
}

console.log("6. publicando...");
const { error: pubError } = await usuario.rpc("publish_store", { p_store_id: storeId });
if (pubError) throw new Error(`publicar: ${pubError.message}`);

console.log(`\nBanco listo: ${SLUG}`);
console.log(JSON.stringify({ email: EMAIL, password: PASSWORD, slug: SLUG, storeId, productos: slugs.length }, null, 2));

// El archivo de credenciales lo lee la medicion. Vive en la carpeta temporal,
// no en el repo: son credenciales de una tienda de prueba.
const destino = join(tmpdir(), "kilo", "perf-seed.json");
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(
  destino,
  JSON.stringify({ email: EMAIL, password: PASSWORD, slug: SLUG, storeId, productos: slugs.length }, null, 2),
);
console.log(`credenciales en ${destino}`);
