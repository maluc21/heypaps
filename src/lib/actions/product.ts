'use server'

import { createServerClient } from "@/lib/supabase/server";
import { invalidateProductCatalog } from "@/lib/catalog-cache";

export type ProductResult = { error?: string; ok?: boolean };

export async function updateProduct(
  productId: string,
  expectedVersion: number,
  updates: {
    name?: string;
    description?: string;
    active?: boolean;
    paused?: boolean;
    featured?: boolean;
    position?: number;
    /** Array completo de fileIds. `[]` quita todas; undefined conserva. */
    images?: string[];
    showPrice?: boolean;
  },
): Promise<ProductResult> {
  // null = conservar el valor actual (semántica parcial de update_product, migración 0005).
  // Nunca enviar valores por defecto: sobrescribirían imágenes, banderas y posición.
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("update_product", {
    p_product_id: productId,
    p_name: updates.name ?? null,
    p_description: updates.description ?? null,
    p_category_id: null,
    p_tag_id: null,
    p_attributes: null,
    p_images: updates.images ?? null,
    p_position: updates.position ?? null,
    p_active: updates.active ?? null,
    p_paused: updates.paused ?? null,
    p_featured: updates.featured ?? null,
    p_show_price: updates.showPrice ?? null,
    p_expected_version: expectedVersion,
  });

  if (error) {
    const isConflict = error.code === "45000" || String(error.message).includes("conflicto");
    if (isConflict) {
      return { error: "CONFLICT" };
    }
    return { error: error.message ?? "No se pudo actualizar el producto." };
  }

  // El catálogo público se cachea por tag: sin invalidarlo, una foto nueva o
  // un producto recién mostrado no aparecerían en la tienda (plan §6.1).
  await invalidateProductCatalog(supabase, productId);

  return { ok: true };
}

export async function bulkUpdateProducts(
  ids: string[],
  action: string,
  payload: Record<string, unknown> = {}
): Promise<{ error?: string; count?: number }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("bulk_update_products", {
    p_ids: ids,
    p_action: action,
    p_payload: payload,
  });

  if (error) {
    return { error: error.message ?? "La acción masiva falló." };
  }

  return { count: Number(data) };
}
