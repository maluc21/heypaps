'use server'

import { updateTag } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { parseAmountToCents } from "@/lib/money";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** E.164: opcional '+' y solo dígitos (plan §4.1). Vacío se guarda como NULL. */
function normalizeE164(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

export type StoreResult = { error?: string; storeId?: string; slug?: string; productId?: string };

export async function createStore(formData: FormData): Promise<StoreResult> {
  const slug = String(formData.get("slug") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const whatsapp = normalizeE164(String(formData.get("whatsapp") ?? ""));
  const currency = String(formData.get("currency") ?? "HNL");

  if (!slug || !name) {
    return { error: "Nombre de tienda y slug son obligatorios." };
  }

  const supabase = await createServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "No hay una sesión activa." };
  }

  const { data, error } = await supabase.rpc("create_store", {
    p_slug: slug,
    p_name: name,
    p_description: description,
    p_whatsapp_e164: whatsapp === "" ? null : whatsapp,
    p_currency: currency,
    p_appearance: {},
  });

  if (error) {
    return { error: error.message ?? "No se pudo crear la tienda." };
  }

  return { storeId: String(data), slug };
}

/**
 * Publica la tienda: pasa de 'draft' a 'published' y la hace visible en el
 * catálogo público. Solo el owner puede (lo valida la RPC).
 */
export async function publishStore(storeId: string): Promise<{ error?: string }> {
  if (!UUID_RE.test(storeId)) {
    return { error: "Tienda inválida." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("publish_store", { p_store_id: storeId });

  if (error) {
    return { error: error.message ?? "No se pudo publicar la tienda." };
  }

  // El catálogo público se cachea por tag de tienda: hay que invalidarlo para
  // que el link recién publicado sirva los productos (plan §6.1).
  const { data: store } = await supabase
    .from("stores")
    .select("slug")
    .eq("id", storeId)
    .single();
  if (store?.slug) {
    updateTag(`catalog:${store.slug}`);
  }

  return {};
}

export async function createFirstProduct(
  formData: FormData,
): Promise<{ error?: string; productId?: string; slug?: string }> {
  const storeId = String(formData.get("store_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  // El precio llega en unidades monetarias (ej. "450.50"); la conversión a centavos ocurre aquí.
  const priceCents = parseAmountToCents(String(formData.get("price") ?? ""));

  if (!UUID_RE.test(storeId) || !name || priceCents === null || priceCents <= 0) {
    return { error: "Datos del producto incompletos o precio no válido (usa 450 o 450.50)." };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_product_with_variant", {
    p_store_id: storeId,
    p_slug: `${name.toLowerCase().replace(/\s+/g, "-")}-1`,
    p_name: name,
    p_description: "",
    p_category_id: null,
    p_tag_id: null,
    p_attributes: [],
    p_images: [],
    p_position: 0,
    p_variant_attributes: {},
    p_sku: null,
    p_price_cents: priceCents,
    p_discount_type: "none",
    p_discount_value: 0,
    p_stock: null,
    p_image_file_id: null,
  });

  if (error) {
    return { error: error.message ?? "No se pudo crear el producto." };
  }

  // La RPC devuelve { id, slug }: el slug real puede llevar sufijo si ya habia
  // un producto con ese nombre.
  const created = data as { id?: string; slug?: string } | null;
  return { productId: created?.id, slug: created?.slug };
}

// ============================================================
// Ajustes de la tienda (plan §2.6, §2.7 y §2.8)
// ============================================================

export type StoreSettings = {
  name: string;
  description?: string | null;
  whatsapp?: string | null;
  currency?: string;
  secondaryCurrency?: string | null;
  fxRate?: number | null;
};

/** Datos visibles de la tienda para el panel. */
export async function updateStoreSettings(
  storeId: string,
  settings: StoreSettings,
): Promise<{ error?: string }> {
  if (!UUID_RE.test(storeId)) {
    return { error: "Tienda inválida." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("update_store", {
    p_store_id: storeId,
    p_name: settings.name,
    p_description: settings.description ?? null,
    p_whatsapp_e164:
      settings.whatsapp === undefined || settings.whatsapp === null
        ? null
        : normalizeE164(settings.whatsapp),
    p_currency: settings.currency ?? "HNL",
    p_secondary_currency: settings.secondaryCurrency ?? null,
    p_fx_rate: settings.fxRate ?? null,
  });

  if (error) {
    return { error: error.message ?? "No se pudieron guardar los ajustes." };
  }

  await invalidateStoreCatalog(supabase, storeId);
  return {};
}

/** Logo de la tienda. `null` lo quita. */
export async function setStoreLogo(
  storeId: string,
  fileId: string | null,
): Promise<{ error?: string }> {
  if (!UUID_RE.test(storeId)) {
    return { error: "Tienda inválida." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_store_logo", {
    p_store_id: storeId,
    p_file_id: fileId,
  });

  if (error) {
    return { error: error.message ?? "No se pudo cambiar el logo." };
  }

  await invalidateStoreCatalog(supabase, storeId);
  return {};
}

/** Despublica la tienda: deja de estar visible en el catálogo público. */
export async function unpublishStore(storeId: string): Promise<{ error?: string }> {
  if (!UUID_RE.test(storeId)) {
    return { error: "Tienda inválida." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("unpublish_store", { p_store_id: storeId });

  if (error) {
    return { error: error.message ?? "No se pudo despublicar la tienda." };
  }

  await invalidateStoreCatalog(supabase, storeId);
  return {};
}

/**
 * Cambia el link público. Los enlaces ya compartidos dejan de funcionar:
 * la UI advierte de esto antes de llamar.
 */
export async function regenerateStoreSlug(
  storeId: string,
  newSlug: string,
): Promise<{ error?: string; slug?: string }> {
  if (!UUID_RE.test(storeId)) {
    return { error: "Tienda inválida." };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("regenerate_store_slug", {
    p_store_id: storeId,
    p_new_slug: newSlug,
  });

  if (error) {
    return { error: error.message ?? "No se pudo cambiar el link." };
  }

  // El tag de la tienda vieja deja de servir y el nuevo empieza.
  await invalidateStoreCatalog(supabase, storeId);
  updateTag(`catalog:${String(data)}`);

  return { slug: String(data) };
}

/** Invalida la caché del catálogo público de una tienda. */
async function invalidateStoreCatalog(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  storeId: string,
): Promise<void> {
  const { data: store } = await supabase
    .from("stores")
    .select("slug")
    .eq("id", storeId)
    .maybeSingle();
  if (store?.slug) {
    updateTag(`catalog:${store.slug}`);
  }
}
