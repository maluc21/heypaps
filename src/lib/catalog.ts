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
import { formatMoney } from "@/lib/utils";

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
  social_links: Record<string, string> | null;
};

export type PublicCategory = { slug: string; name: string };

export type PublicTag = {
  id: string;
  name: string;
  color: string | null;
  /** Identificador derivado del nombre, para el filtro por URL. */
  slug: string;
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
  tag: string | null = null,
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
    p_tag_slug: tag,
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

export type OgProduct = {
  storeName: string;
  productName: string;
  price: string | null;
  currency: string;
  imageUrl: string | null;
  tagName: string | null;
  tagColor: string | null;
};

/**
 * Datos para la imagen OG de un producto.
 *
 * Se cachea con el tag del producto: la imagen OG se regenera cuando cambia
 * el producto, y no en cada preview de WhatsApp (plan §6.3).
 */
export async function getOgProduct(
  storeSlug: string,
  productSlug: string,
  appUrl: string,
): Promise<OgProduct | null> {
  "use cache";
  cacheTag(`og:product:${storeSlug}:${productSlug}`);
  cacheLife("max");

  const data = await getPublicProduct(storeSlug, productSlug);
  if (!data?.product || !data.store) return null;

  const product = data.product;
  const priceFrom = product.price_from;

  return {
    storeName: data.store.name,
    productName: product.name,
    price: priceFrom === null ? null : formatMoney(priceFrom, data.store.currency),
    currency: data.store.currency,
    imageUrl: product.images[0]
      ? `${appUrl.replace(/\/+$/, "")}/${product.images[0]}`
      : null,
    tagName: null,
    tagColor: null,
  };
}

/** Datos para la imagen OG del catalogo de una tienda. */
export async function getOgStore(
  storeSlug: string,
  appUrl: string,
): Promise<{ storeName: string; imageUrl: string | null } | null> {
  "use cache";
  cacheTag(`og:store:${storeSlug}`);
  cacheLife("max");

  const data = await getCatalog(storeSlug, 1, 0, null);
  if (!data?.store) return null;

  return {
    storeName: data.store.name,
    imageUrl: data.store.logo
      ? `${appUrl.replace(/\/+$/, "")}/${data.store.logo}`
      : null,
  };
}
