'use server'

import { createServerClient } from "@/lib/supabase/server";
import { parseAmountToCents } from "@/lib/money";
import { invalidateProductCatalog } from "@/lib/catalog-cache";
import {
  attributesFromPairs,
  discountValueToStorage,
  stockToStorage,
  type AttributePair,
  type DiscountType,
} from "@/lib/variants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Datos del formulario tal como los escribe el usuario (montos en lempiras). */
export type VariantInput = {
  variantId: string | null;
  attributes: AttributePair[];
  sku: string;
  price: string;
  discountType: DiscountType;
  discountValue: string;
  madeToOrder: boolean;
  stock: string;
  active: boolean;
};

/**
 * Crea o actualiza una variante. `expectedVersion` es la versión del producto
 * que el formulario vio: si otra pestaña cambió el producto, la base rechaza
 * el guardado (45000) y el usuario recarga.
 */
export async function saveVariant(
  productId: string,
  expectedVersion: number,
  input: VariantInput,
): Promise<{ error?: string; variantId?: string }> {
  if (!UUID_RE.test(productId)) return { error: "Producto inválido." };
  if (input.variantId && !UUID_RE.test(input.variantId)) {
    return { error: "Variante inválida." };
  }

  let payload;
  try {
    const priceCents = parseAmountToCents(input.price);
    if (priceCents === null || priceCents <= 0) {
      throw new Error("El precio debe ser mayor que cero (usa 450 o 450.50).");
    }
    payload = {
      attributes: attributesFromPairs(input.attributes),
      priceCents,
      discountType: input.discountType,
      discountValue: discountValueToStorage(input.discountType, input.discountValue, priceCents),
      stock: stockToStorage(input.stock, input.madeToOrder),
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
  const supabase = await createServerClient();

  // Regla: las variantes con atributos no pueden costar menos que la variante
  // base (la de atributos vacíos). Si existe una base, se valida aquí.
  if (payload.attributes && Object.keys(payload.attributes).length > 0) {
    const { data: baseVariant } = await supabase
      .from("variants")
      .select("id, price_cents")
      .eq("product_id", productId)
      .eq("attributes", {})
      .maybeSingle();
    if (baseVariant && payload.priceCents < (baseVariant as { price_cents: number }).price_cents) {
      return { error: "El precio de la variante no puede ser menor al precio base." };
    }
  }

  const { data, error } = await supabase.rpc("upsert_variant", {
    p_product_id: productId,
    p_variant_id: input.variantId,
    p_attributes: payload.attributes,
    p_sku: input.sku.trim() || null,
    p_price_cents: payload.priceCents,
    p_discount_type: payload.discountType,
    p_discount_value: payload.discountValue,
    p_stock: payload.stock,
    p_active: input.active,
    p_position: 0,
    p_expected_version: expectedVersion,
  });

  if (error) {
    if (error.code === "45000") return { error: "CONFLICT" };
    return { error: error.message ?? "No se pudo guardar la variante." };
  }

  await invalidateProductCatalog(supabase, productId);
  return { variantId: String(data) };
}

/** Borra una variante. La base rechaza borrar la última activa. */
export async function deleteVariant(
  productId: string,
  variantId: string,
  expectedVersion: number,
): Promise<{ error?: string }> {
  if (!UUID_RE.test(productId) || !UUID_RE.test(variantId)) {
    return { error: "Datos inválidos." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("delete_variant", {
    p_product_id: productId,
    p_variant_id: variantId,
    p_expected_version: expectedVersion,
  });

  if (error) {
    if (error.code === "45000") return { error: "CONFLICT" };
    return { error: error.message ?? "No se pudo borrar la variante." };
  }

  await invalidateProductCatalog(supabase, productId);
  return {};
}
