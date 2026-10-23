import { connection } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { ProductsTable, type Product } from "@/components/products-table";
import { getCurrentStore } from "@/lib/store-context";
import { PanelShell } from "@/components/panel-shell";
import { ProductListMobile } from "@/components/product-list-mobile";

export const metadata = {
  title: "Productos · Panel",
  description: "Administra los productos y variantes de tu catálogo",
};

export const instant = false;

export default async function ProductsPage() {
  await connection();
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <PanelShell>
        <div className="p-4">
          <ProductsTable initialProducts={[]} categories={[]} tags={[]} currency="HNL" />
        </div>
      </PanelShell>
    );
  }

  const store = await getCurrentStore(user.id);

  const [{ data: products }, { data: categories }, { data: tags }] = await Promise.all([
    supabase
      .from("products")
      .select("*, variants(*)")
      .order("position", { ascending: true }),
    supabase
      .from("categories")
      .select("id, name")
      .eq("store_id", store?.id ?? "")
      .order("position", { ascending: true }),
    supabase
      .from("tags")
      .select("id, name")
      .eq("store_id", store?.id ?? "")
      .order("position", { ascending: true }),
  ]);

  return (
    <PanelShell>
      <div className="space-y-4 p-4">
        <h1 className="text-lg font-semibold">Productos</h1>
        <div className="hidden sm:block">
          <ProductsTable
            initialProducts={(products ?? []) as Product[]}
            categories={categories ?? []}
            tags={tags ?? []}
            currency={store?.currency ?? "HNL"}
          />
        </div>
        <div className="sm:hidden">
          <ProductListMobile
            products={(products ?? []).map((p: any) => ({
              id: p.id,
              name: p.name,
              slug: p.slug,
              price_cents: p.price_cents,
              active: p.active,
              category_id: p.category_id,
              image_url: p.image_url,
              version: p.version,
            }))}
          />
        </div>
      </div>
    </PanelShell>
  );
}
