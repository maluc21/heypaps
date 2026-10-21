'use server'

import { createServerClient } from "@/lib/supabase/server";
import { parseAmountToCents } from "@/lib/money";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StoreResult = { error?: string; storeId?: string };

export async function createStore(formData: FormData): Promise<StoreResult> {
  const slug = String(formData.get("slug") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").trim();
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
    p_whatsapp_e164: whatsapp,
    p_currency: currency,
    p_appearance: {},
  });

  if (error) {
    return { error: error.message ?? "No se pudo crear la tienda." };
  }

  return { storeId: String(data) };
}

export async function createFirstProduct(formData: FormData): Promise<{ error?: string }> {
  const storeId = String(formData.get("store_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  // El precio llega en unidades monetarias (ej. "450.50"); la conversión a centavos ocurre aquí.
  const priceCents = parseAmountToCents(String(formData.get("price") ?? ""));

  if (!UUID_RE.test(storeId) || !name || priceCents === null || priceCents <= 0) {
    return { error: "Datos del producto incompletos o precio no válido (usa 450 o 450.50)." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("create_product_with_variant", {
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

  return {};
}
