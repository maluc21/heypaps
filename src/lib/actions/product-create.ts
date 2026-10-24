'use server'

import { createServerClient } from "@/lib/supabase/server";
import { parseAmountToCents } from "@/lib/money";
import { normalizeSlug } from "@/lib/utils";
import { invalidateProductCatalog } from "@/lib/catalog-cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CreateProductInput = {
  storeId: string;
  name: string;
  description?: string;
  price: string;
  categoryId?: string | null;
  tagId?: string | null;
  stock?: string;
  madeToOrder?: boolean;
};

export type CreateProductResult = {
  error?: string;
  productId?: string;
  slug?: string;
};

/**
 * Crea un producto con su primera variante (plan §2.2, §2.3).
 *
 * El slug se deriva del nombre y la base le anade un sufijo si ya existe:
 * dos productos con el mismo nombre son legitimos.
 */
export async function createProduct(
  input: CreateProductInput,
): Promise<CreateProductResult> {
  if (!UUID_RE.test(input.storeId)) {
    return { error: "Tienda inválida." };
  }

  const name = input.name.trim();
  if (name.length < 2) {
    return { error: "El nombre del producto es obligatorio." };
  }

  const priceCents = parseAmountToCents(input.price);
  if (priceCents === null || priceCents < 0) {
    return { error: "El precio debe ser mayor que cero (usa 450 o 450.50)." };
  }

  let stock: number | null = null;
  if (!input.madeToOrder) {
    const raw = (input.stock ?? "").trim();
    if (raw === "") {
      return { error: "Indica la cantidad de unidades de producto." };
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      return { error: "El stock debe ser un número entero mayor o igual a cero." };
    }
    stock = value;
  }

  if (input.categoryId && !UUID_RE.test(input.categoryId)) {
    return { error: "Categoría inválida." };
  }
  if (input.tagId && !UUID_RE.test(input.tagId)) {
    return { error: "Etiqueta inválida." };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_product_with_variant", {
    p_store_id: input.storeId,
    p_slug: normalizeSlug(name),
    p_name: name,
    p_description: input.description ?? "",
    p_category_id: input.categoryId || null,
    p_tag_id: input.tagId || null,
    p_attributes: [],
    p_images: [],
    p_position: 0,
    p_variant_attributes: {},
    p_sku: null,
    p_price_cents: priceCents,
    p_discount_type: "none",
    p_discount_value: 0,
    p_stock: stock,
    p_image_file_id: null,
  });

  if (error) {
    return { error: error.message ?? "No se pudo crear el producto." };
  }

  const created = data as { id?: string; slug?: string } | null;
  if (!created?.id) {
    return { error: "No se pudo crear el producto." };
  }

  await invalidateProductCatalog(supabase, created.id);
  return { productId: created.id, slug: created.slug };
}
