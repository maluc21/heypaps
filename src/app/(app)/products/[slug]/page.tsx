import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { ProductEditorForm } from "@/components/product-editor-form";
import { VariantManager, type EditableVariant } from "@/components/variant-manager";
import { getPlanLimits } from "@/lib/cache";
import { PanelShell } from "@/components/panel-shell";

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
  tag_id: string | null;
  variants: EditableVariant[];
};

export default async function ProductEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
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

  const { data: store } = await supabase
    .from("stores")
    .select("plan_code, currency")
    .eq("id", product.store_id)
    .maybeSingle();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("store_id", product.store_id)
    .order("position", { ascending: true });

  const { data: tags } = await supabase
    .from("tags")
    .select("id, name, color")
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
    <PanelShell>
      <div className="p-4 space-y-4">
        <ProductEditorForm
          product={product}
          maxImages={planLimits.max_images_per_product}
          categories={categories ?? []}
          tags={tags ?? []}
          currency={store?.currency ?? "HNL"}
        />
        <div className="max-w-xl">
          <VariantManager
            productId={product.id}
            productVersion={product.version}
            currency={store?.currency ?? "HNL"}
            variants={product.variants}
          />
        </div>
      </div>
    </PanelShell>
  );
}
