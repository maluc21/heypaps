import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store-context";
import {
  StoreSettingsForm,
  type PlanSummary,
  type StoreSettingsData,
  type UsageSummary,
} from "@/components/store-settings-form";
import { getPlanLimits } from "@/lib/cache";
import { PanelShell } from "@/components/panel-shell";

export const metadata = {
  title: "Ajustes · Panel",
  description: "Datos de tu tienda, link público y uso del plan",
};

export const instant = false;

export default async function SettingsPage() {
  await connection();
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const store = await getCurrentStore(user.id);

  if (!store) {
    return (
      <PanelShell>
        <div className="p-4">
          <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
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

  const storeId = store.id;

  const [{ data: storage }, { count: productCount }] = await Promise.all([
    supabase.from("store_storage").select("bytes_used").eq("store_id", storeId).maybeSingle(),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .is("deleted_at", null),
  ]);

  const plan = await getPlanLimits(store.plan_code ?? "free");
  const planSummary: PlanSummary = {
    max_products: plan.max_products,
    max_images_per_product: plan.max_images_per_product,
    max_storage_bytes: plan.max_storage_bytes,
    remove_brand: plan.remove_brand,
    custom_domain: plan.custom_domain,
  };

  const usage: UsageSummary = {
    products: productCount ?? 0,
    bytesUsed: Number(storage?.bytes_used ?? 0),
  };

  return (
    <PanelShell>
      <div className="p-4">
        <StoreSettingsForm
          store={store as unknown as StoreSettingsData}
          role={store.role}
          plan={planSummary}
          usage={usage}
        />
      </div>
    </PanelShell>
  );
}
