/**
 * Lecturas del catálogo público.
 *
 * Superficie única: las RPC `public_catalog` y `public_product` (plan §5.4).
 * El rol `anon` no tiene políticas sobre las tablas base, así que aquí no se
 * consulta products/variants directamente.
 *
 * Caché: `use cache` + tag por tienda/producto. La invalidación se dispara con
 * `updateTag` desde las Server Functions del panel (plan §6.1).
 */

import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

export type PublicStore = {
  id: string;
  name: string;
  logo: string | null;
  whatsapp: string | null;
  currency: string;
  secondary_currency: string | null;
  fx_rate: number | null;
  appearance: Record<string, unknown> | null;
  plan_code: string;
};

export type PublicCategory = { slug: string; name: string };

export type PublicTag = {
  id: string;
  name: string;
  color: string | null;
};

export type PublicProductCard = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  images: string[];
  tag: string | null;
  tag_color: string | null;
  category: string | null;
  status: string;
  price_from: number | null;
  /** true si las variantes activas difieren en precio → mostrar "desde $X". */
  price_is_range: boolean;
};

export type CatalogPagination = {
  limit: number;
  offset: number;
  total: number;
  has_more: boolean;
};

export type CatalogData = {
  store: PublicStore | null;
  categories: PublicCategory[];
  tags: PublicTag[];
  pagination: CatalogPagination;
  products: PublicProductCard[];
};

export type PublicVariant = {
  id: string;
  attributes: Record<string, string>;
  sku: string | null;
  price_cents: number;
  discount_type: "none" | "percent" | "fixed";
  discount_value: number;
  final_price_cents: number;
  stock: number | null;
  image_file_id: string | null;
  active: boolean;
  position: number;
};

export type PublicProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  images: string[];
  active: boolean;
  status: string;
  price_from: number | null;
  variants: PublicVariant[];
};

export type PublicProductPage = {
  store: {
    id: string;
    name: string;
    logo: string | null;
    whatsapp: string | null;
    currency: string;
    plan_code: string;
  } | null;
  product: PublicProduct | null;
};

/**
 * Catálogo de una tienda. Devuelve `null` si la tienda no existe, está en
 * borrador o fue suspendida: el catálogo público no debe filtrar su existencia.
 */
export async function getCatalog(
  slug: string,
  limit: number,
  offset: number,
  category: string | null,
): Promise<CatalogData | null> {
  "use cache";
  cacheTag(`catalog:${slug}`);
  cacheLife("max");

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("public_catalog", {
    p_store_slug: slug,
    p_limit: limit,
    p_offset: offset,
    p_category_slug: category,
  });

  if (error) {
    throw new Error(`public_catalog falló: ${error.message}`);
  }
  if (!data) return null;
  return data as CatalogData;
}

/** Ficha de un producto con sus variantes activas. */
export async function getPublicProduct(
  storeSlug: string,
  productSlug: string,
): Promise<PublicProductPage | null> {
  "use cache";
  cacheTag(`catalog:${storeSlug}`);
  cacheTag(`product:${storeSlug}:${productSlug}`);
  cacheLife("max");

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("public_product", {
    p_store_slug: storeSlug,
    p_product_slug: productSlug,
  });

  if (error) {
    throw new Error(`public_product falló: ${error.message}`);
  }
  if (!data) return null;
  return data as PublicProductPage;
}
