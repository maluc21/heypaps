import type { SupabaseClient } from "@supabase/supabase-js";
import { updateTag } from "next/cache";

/**
 * Invalida la caché del catálogo público y de la ficha de un producto.
 *
 * Se llama desde las Server Actions que cambian un producto o sus variantes:
 * sin esto, un precio o un stock nuevo no aparece en la tienda hasta que la
 * caché expire (plan §6.1).
 */
export async function invalidateProductCatalog(
  supabase: SupabaseClient,
  productId: string,
): Promise<void> {
  const { data: product } = await supabase
    .from("products")
    .select("slug, store_id")
    .eq("id", productId)
    .maybeSingle();
  if (!product?.store_id) return;

  const { data: store } = await supabase
    .from("stores")
    .select("slug")
    .eq("id", product.store_id)
    .maybeSingle();
  if (!store?.slug) return;

  updateTag(`catalog:${store.slug}`);
  updateTag(`product:${store.slug}:${product.slug}`);
}
