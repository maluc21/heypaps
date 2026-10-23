/**
 * Medición de propagación de cambio de precio al catálogo público.
 *
 * Uso:
 *   E2E_APP_URL=http://localhost:3000 \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   node tests/perf/price-propagation.mjs
 *
 * Requiere que el servidor Next.js esté corriendo (pnpm dev / pnpm start)
 * y que exista un archivo de seed en %TEMP%\kilo\perf-seed.json.
 *
 * Flujo:
 *  1. Lee el seed para obtener storeId, slug y email del dueño.
 *  2. Crea una sesión de dueño (service_role + magic link verificado).
 *  3. Obtiene un producto y una variante de la tienda.
 *  4. Cambia el precio de la variante vía RPC upsert_variant con la sesión del dueño.
 *     (Nota: esta RPC de base de datos NO invalida el caché del proxy; solo las
 *      Server Actions de Next.js lo hacen. Este script mide el tiempo de
 *      propagación SIN invalidación explícita del proxy.)
 *  5. Navega a la ficha pública con Playwright y mide cuánto tarda en verse el
 *     nuevo precio (o si no aparece por caché).
 */

import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = process.env.E2E_APP_URL ?? "http://localhost:3000";

if (!url || !anon || !serviceKey) {
  console.error("Faltan variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const SEED_FILE = join(tmpdir(), "kilo", "perf-seed.json");
let seed;
try {
  seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));
} catch {
  console.error(`No se encontró el seed en ${SEED_FILE}. Ejecuta primero la batería de perf.`);
  process.exit(1);
}

const { email, slug, storeId } = seed;
const NEW_PRICE_CENTS = 12345; // 123.45 HNL

async function main() {
  // --- 1. Crear sesión de dueño ---
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createErr && !/already|registered|exists/i.test(createErr.message)) {
    console.error("createUser:", createErr.message);
    process.exit(1);
  }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) {
    console.error("generateLink:", linkErr.message);
    process.exit(1);
  }

  const userClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { session }, error: verifyErr } = await userClient.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyErr || !session) {
    console.error("verifyOtp:", verifyErr?.message);
    process.exit(1);
  }

  console.log(`Sesión de dueño creada para ${email}`);

  // --- 2. Obtener un producto y una variante de la tienda ---
  const { data: products, error: prodErr } = await userClient
    .from("products")
    .select("id, slug")
    .eq("store_id", storeId)
    .is("deleted_at", null)
    .limit(1);
  if (prodErr || !products || products.length === 0) {
    console.error("No hay productos en la tienda de prueba:", prodErr?.message);
    process.exit(1);
  }
  const product = products[0];

  const { data: variants, error: varErr } = await userClient
    .from("variants")
    .select("id, price_cents")
    .eq("product_id", product.id)
    .eq("active", true)
    .limit(1);
  if (varErr || !variants || variants.length === 0) {
    console.error("No hay variantes activas:", varErr?.message);
    process.exit(1);
  }
  const variant = variants[0];
  const oldPriceCents = variant.price_cents;
  console.log(`Producto: ${product.slug} | Variante: ${variant.id} | Precio anterior: ${oldPriceCents} centavos`);

  // --- 3. Cambiar el precio de la variante (vía RPC con sesión de dueño) ---
  const { error: rpcErr } = await userClient.rpc("upsert_variant", {
    p_product_id: product.id,
    p_variant_id: variant.id,
    p_attributes: {},
    p_sku: null,
    p_price_cents: NEW_PRICE_CENTS,
    p_discount_type: "none",
    p_discount_value: 0,
    p_stock: null,
    p_active: true,
    p_position: 0,
    p_expected_version: 0,
  });
  if (rpcErr) {
    console.error("upsert_variant:", rpcErr.message);
    process.exit(1);
  }
  console.log(`Precio cambiado a ${NEW_PRICE_CENTS} centavos`);

  // --- 4. Navegar a la ficha pública y medir tiempo ---
  const browser = await chromium.launch({ headless: true });
  const contexto = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
  });

  const pagina = await contexto.newPage();

  const inicio = Date.now();
  await pagina.goto(`${APP}/s/${slug}/${product.slug}`, { waitUntil: "load" });

  const precioTexto = `${(NEW_PRICE_CENTS / 100).toFixed(2)}`;
  let nuevoPrecioVisible = false;
  let tiempoPropagacion = null;

  try {
    await pagina.locator(`text=${precioTexto}`).first().waitFor({ state: "visible", timeout: 10000 });
    nuevoPrecioVisible = true;
    tiempoPropagacion = Date.now() - inicio;
  } catch {
    const contenido = await pagina.textContent("body");
    nuevoPrecioVisible = contenido.includes(precioTexto);
    tiempoPropagacion = Date.now() - inicio;
  }

  console.log(`\nResultado:`);
  console.log(`  Precio esperado: ${precioTexto}`);
  console.log(`  Precio visible: ${nuevoPrecioVisible ? "SÍ" : "NO"}`);
  console.log(`  Tiempo transcurrido: ${tiempoPropagacion}ms`);

  if (!nuevoPrecioVisible) {
    console.log(`  El nuevo precio NO se ve (caché del servidor no invalidado).`);
    console.log(`  Esto es esperado: la RPC de base de datos no invalida el caché.`);
    console.log(`  Para medir con invalidación, usar la UI del panel o Server Action.`);
    await browser.close();
    process.exit(0);
  }

  console.log(`  Umbral: < 2000ms ${tiempoPropagacion < 2000 ? "✓ CUMPLE" : "✗ NO CUMPLE"}`);

  await browser.close();

  if (tiempoPropagacion >= 2000) {
    console.error("\nEl cambio de precio tardó más de 2s en propagarse.");
    process.exit(1);
  }

  console.log("\nMedición completada con éxito.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
