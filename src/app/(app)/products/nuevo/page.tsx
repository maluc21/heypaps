import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store-context";
import { getPlanLimits } from "@/lib/cache";
import { NewProductForm } from "@/components/new-product-form";
import { PanelShell } from "@/components/panel-shell";

export const metadata = {
  title: "Nuevo producto · Panel",
  description: "Añade un producto a tu catálogo",
};

export const instant = false;

export default async function NewProductPage() {
  await connection();
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const store = await getCurrentStore(user.id);
  if (!store) redirect("/onboarding");

  const [{ data: categories }, { data: tags }, { count: productCount }] = await Promise.all([
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
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("store_id", store.id)
      .is("deleted_at", null),
  ]);

  const plan = await getPlanLimits(store.plan_code);

  return (
    <PanelShell>
      <div className="p-4">
        <NewProductForm
          storeId={store.id}
          currency={store.currency}
          categories={categories ?? []}
          tags={tags ?? []}
          maxProducts={plan.max_products}
          currentProducts={productCount ?? 0}
        />
      </div>
    </PanelShell>
  );
}
