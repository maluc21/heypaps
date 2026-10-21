'use server'

import { createServerClient } from "@/lib/supabase/server";
import { invalidateProductCatalog, invalidateStoreCatalog } from "@/lib/catalog-cache";
import { normalizeSlug } from "@/lib/utils";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CategoryResult = { error?: string; id?: string };

/** Crea una categoría en la tienda. */
export async function createCategory(
  storeId: string,
  name: string,
  slug: string,
): Promise<CategoryResult> {
  if (!UUID_RE.test(storeId)) return { error: "Tienda inválida." };
  if (!name.trim()) return { error: "El nombre es obligatorio." };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_category", {
    p_store_id: storeId,
    p_name: name.trim(),
    p_slug: normalizeSlug(slug || name),
  });

  if (error) return { error: error.message ?? "No se pudo crear la categoría." };
  await invalidateStoreCatalog(supabase, storeId);
  return { id: String(data) };
}

/** Renombra, cambia el identificador, oculta o reordena una categoría. */
export async function updateCategory(
  categoryId: string,
  updates: { name?: string; slug?: string; active?: boolean; position?: number },
): Promise<{ error?: string }> {
  if (!UUID_RE.test(categoryId)) return { error: "Categoría inválida." };

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("update_category", {
    p_category_id: categoryId,
    p_name: updates.name ?? null,
    p_slug: updates.slug ? normalizeSlug(updates.slug) : null,
    p_active: updates.active ?? null,
    p_position: updates.position ?? null,
  });

  if (error) return { error: error.message ?? "No se pudo guardar la categoría." };
  const storeId = await storeIdOfCategory(supabase, categoryId);
  if (storeId) {
    await invalidateStoreCatalog(supabase, storeId);
  }
  return {};
}

/** Elimina la categoría. Los productos quedan sin categoría. */
export async function deleteCategory(categoryId: string): Promise<{ error?: string }> {
  if (!UUID_RE.test(categoryId)) return { error: "Categoría inválida." };

  const supabase = await createServerClient();
  // El storeId se resuelve antes de borrar: después la categoría ya no existe.
  const storeId = await storeIdOfCategory(supabase, categoryId);

  const { error } = await supabase.rpc("delete_category", { p_category_id: categoryId });

  if (error) return { error: error.message ?? "No se pudo eliminar la categoría." };
  if (storeId) {
    await invalidateStoreCatalog(supabase, storeId);
  }
  return {};
}

/**
 * Asigna o quita la categoría de un producto. `null` la quita: es el caso que
 * update_product no podía resolver (null = conservar).
 */
export async function setProductCategory(
  productId: string,
  categoryId: string | null,
): Promise<{ error?: string }> {
  if (!UUID_RE.test(productId)) return { error: "Producto inválido." };
  if (categoryId && !UUID_RE.test(categoryId)) return { error: "Categoría inválida." };

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_product_category", {
    p_product_id: productId,
    p_category_id: categoryId,
  });

  if (error) return { error: error.message ?? "No se pudo cambiar la categoría." };
  await invalidateProductCatalog(supabase, productId);
  return {};
}

/** Tienda a la que pertenece una categoría. */
async function storeIdOfCategory(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  categoryId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("categories")
    .select("store_id")
    .eq("id", categoryId)
    .maybeSingle();
  return data?.store_id ?? null;
}
