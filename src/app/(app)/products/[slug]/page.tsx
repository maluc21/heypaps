import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { ProductEditorForm } from "@/components/product-editor-form";

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

  return <ProductEditorForm product={data as Product} />;
}
