'use server'

import { updateTag } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
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
  await invalidateCatalog(supabase);
  return {};
}

/** Elimina la categoría. Los productos quedan sin categoría. */
export async function deleteCategory(categoryId: string): Promise<{ error?: string }> {
  if (!UUID_RE.test(categoryId)) return { error: "Categoría inválida." };

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("delete_category", { p_category_id: categoryId });

  if (error) return { error: error.message ?? "No se pudo eliminar la categoría." };
  await invalidateCatalog(supabase);
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
  await invalidateCatalog(supabase);
  return {};
}

/** Invalida la caché del catálogo público de la tienda del usuario. */
async function invalidateCatalog(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: membership } = await supabase
    .from("store_members")
    .select("store_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) return;

  const { data: store } = await supabase
    .from("stores")
    .select("slug")
    .eq("id", membership.store_id)
    .maybeSingle();
  if (store?.slug) {
    updateTag(`catalog:${store.slug}`);
  }
}
