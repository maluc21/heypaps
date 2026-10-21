import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { ProductEditorForm } from "@/components/product-editor-form";
import { getPlanLimits } from "@/lib/cache";

export const instant = false;

type Product = {
  id: string;
  store_id: string;
  slug: string;
  name: string;
  description: string | null;
  active: boolean;
  paused: boolean;
  featured: boolean;
  position: number;
  version: number;
  images: string[];
  category_id: string | null;
  variants: Array<{
    id: string;
    attributes: Record<string, unknown>;
    price_cents: number;
    final_price_cents: number;
    stock: number | null;
    active: boolean;
    position: number;
  }>;
};

export default async function ProductEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("*, variants(*)")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    notFound();
  }

  const product = data as Product;

  // El límite de imágenes por producto depende del plan de la tienda.
  const { data: store } = await supabase
    .from("stores")
    .select("plan_code")
    .eq("id", product.store_id)
    .maybeSingle();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("store_id", product.store_id)
    .order("position", { ascending: true });

  const planCode = store?.plan_code ?? "free";
  const planLimits = await getPlanLimits(planCode, async () => {
    const { data: limits } = await supabase
      .from("plan_limits")
      .select("*")
      .eq("plan_code", planCode)
      .maybeSingle();
    return limits;
  });

  return (
    <ProductEditorForm
      product={product}
      maxImages={planLimits.max_images_per_product}
      categories={categories ?? []}
    />
  );
}
