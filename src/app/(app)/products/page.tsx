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

  if (!store) {
    return (
      <PanelShell>
        <div className="p-4">
          <p className="rounded-xl border border-[#efefeb] bg-card p-6 text-center text-muted-foreground">
            Todavía no tienes una tienda.{" "}
            <a href="/onboarding" className="underline">
              Crea la primera
            </a>
            .
          </p>
        </div>
      </PanelShell>
    );
  }

  const [{ data: products }, { data: categories }, { data: tags }] = await Promise.all([
    supabase
      .from("products")
      .select("*, variants(*)")
      .is("deleted_at", null)
      .order("position", { ascending: true }),
    supabase
      .from("categories")
      .select("id, name")
      .eq("store_id", store.id)
      .order("position", { ascending: true }),
    supabase
      .from("tags")
      .select("id, name")
      .eq("store_id", store.id)
      .order("position", { ascending: true }),
  ]);

  return (
    <PanelShell>
      <div className="space-y-4 p-3 sm:p-4">
        <div className="hidden sm:block">
          <ProductsTable
            initialProducts={(products ?? []) as Product[]}
            categories={categories ?? []}
            tags={tags ?? []}
            currency={store.currency ?? "HNL"}
          />
        </div>
        <div className="sm:hidden">
          <ProductListMobile
            products={(products ?? []).map((p) => {
              const row = p as {
                id: string;
                name: string;
                slug: string;
                description: string | null;
                price_cents: number | null;
                active: boolean;
                paused: boolean;
                category_id: string | null;
                tag_id: string | null;
                variants: {
                  sku: string | null;
                  stock: number | null;
                  stock_unit: string | null;
                  active: boolean;
                  final_price_cents: number;
                }[];
              };
              return {
                id: row.id,
                name: row.name,
                slug: row.slug,
                description: row.description,
                price_cents: row.price_cents,
                active: row.active,
                paused: row.paused,
                category_id: row.category_id,
                tag_id: row.tag_id,
                variants: row.variants,
              };
            })}
            categories={categories ?? []}
            tags={tags ?? []}
            currency={store.currency ?? "HNL"}
          />
        </div>
      </div>
    </PanelShell>
  );
}
