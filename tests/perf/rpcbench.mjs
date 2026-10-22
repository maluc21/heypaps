import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const seed = JSON.parse(
  (await import("node:fs")).readFileSync(
    `${process.env.TEMP}\\kilo\\perf-seed.json`,
    "utf8",
  ),
);

const cliente = createClient(url, key, { auth: { persistSession: false } });

async function medir(nombre, fn, veces = 5) {
  const muestras = [];
  for (let i = 0; i < veces; i++) {
    const t = performance.now();
    await fn();
    muestras.push(performance.now() - t);
  }
  muestras.sort((a, b) => a - b);
  const mediana = muestras[Math.floor(muestras.length / 2)];
  console.log(`${nombre.padEnd(46)} ${mediana.toFixed(1)} ms`);
  return mediana;
}

await medir("public_catalog (30 productos)", async () => {
  await cliente.rpc("public_catalog", {
    p_store_slug: seed.slug,
    p_limit: 24,
    p_offset: 0,
    p_category_slug: null,
    p_tag_slug: null,
  });
});

await medir("public_catalog (24 productos, filtro)", async () => {
  await cliente.rpc("public_catalog", {
    p_store_slug: seed.slug,
    p_limit: 24,
    p_offset: 0,
    p_category_slug: "zapatos",
    p_tag_slug: null,
  });
});

await medir("public_catalog (1 producto)", async () => {
  await cliente.rpc("public_catalog", {
    p_store_slug: seed.slug,
    p_limit: 1,
    p_offset: 0,
    p_category_slug: null,
    p_tag_slug: null,
  });
});

await medir("public_store_published", async () => {
  await cliente.rpc("public_store_published", { p_store_slug: seed.slug });
});

await medir("public_product", async () => {
  await cliente.rpc("public_product", {
    p_store_slug: seed.slug,
    p_product_slug: "producto-1",
  });
});
