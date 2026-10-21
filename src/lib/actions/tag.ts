'use server'

import { createServerClient } from "@/lib/supabase/server";
import { invalidateProductCatalog, invalidateStoreCatalog } from "@/lib/catalog-cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TagResult = { error?: string; id?: string };

/** Crea una etiqueta para la tienda. */
export async function createTag(
  storeId: string,
  name: string,
  color: string | null,
): Promise<TagResult> {
  if (!UUID_RE.test(storeId)) return { error: "Tienda inválida." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "El nombre de la etiqueta es obligatorio." };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_tag", {
    p_store_id: storeId,
    p_name: trimmed,
    p_color: color,
  });

  if (error) return { error: error.message ?? "No se pudo crear la etiqueta." };
  await invalidateStoreCatalog(supabase, storeId);
  return { id: String(data) };
}

/** Renombra, recolorea o reordena una etiqueta. */
export async function updateTag(
  tagId: string,
  updates: { name?: string; color?: string | null; position?: number },
): Promise<{ error?: string }> {
  if (!UUID_RE.test(tagId)) return { error: "Etiqueta inválida." };

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("update_tag", {
    p_tag_id: tagId,
    p_name: updates.name ?? null,
    p_color: updates.color ?? null,
    p_position: updates.position ?? null,
  });

  if (error) return { error: error.message ?? "No se pudo guardar la etiqueta." };
  await invalidateTagCatalog(supabase, tagId);
  return {};
}

/** Elimina la etiqueta. Los productos quedan sin ella. */
export async function deleteTag(tagId: string): Promise<{ error?: string }> {
  if (!UUID_RE.test(tagId)) return { error: "Etiqueta inválida." };

  const supabase = await createServerClient();
  // El storeId se resuelve antes de borrar: después la etiqueta ya no existe.
  const { data: tag } = await supabase
    .from("tags")
    .select("store_id")
    .eq("id", tagId)
    .maybeSingle();

  const { error } = await supabase.rpc("delete_tag", { p_tag_id: tagId });

  if (error) return { error: error.message ?? "No se pudo eliminar la etiqueta." };
  if (tag?.store_id) {
    await invalidateStoreCatalog(supabase, tag.store_id);
  }
  return {};
}

/**
 * Asigna o quita la etiqueta de un producto. `null` la quita: update_product
 * trata null como "conservar", por eso hace falta esta RPC.
 */
export async function setProductTag(
  productId: string,
  tagId: string | null,
): Promise<{ error?: string }> {
  if (!UUID_RE.test(productId)) return { error: "Producto inválido." };
  if (tagId && !UUID_RE.test(tagId)) return { error: "Etiqueta inválida." };

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_product_tag", {
    p_product_id: productId,
    p_tag_id: tagId,
  });

  if (error) return { error: error.message ?? "No se pudo cambiar la etiqueta." };
  await invalidateProductCatalog(supabase, productId);
  return {};
}

/** Invalida la caché del catálogo de la tienda a la que pertenece la etiqueta. */
async function invalidateTagCatalog(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  tagId: string,
): Promise<void> {
  const { data: tag } = await supabase
    .from("tags")
    .select("store_id")
    .eq("id", tagId)
    .maybeSingle();
  if (tag?.store_id) {
    await invalidateStoreCatalog(supabase, tag.store_id);
  }
}
