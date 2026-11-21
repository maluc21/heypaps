import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { PackagePlus } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store-context";
import { getPlanLimits } from "@/lib/cache";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PanelShell } from "@/components/panel-shell";

export const metadata = {
  title: "Panel · Catálogo SaaS",
  description: "Resumen de tu catálogo",
};

export const instant = false;

export default async function PanelPage() {
  // Render dinámico por petición: datos privados del inquilino.
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
          <Card>
            <CardContent className="space-y-3 p-6 text-center">
              <p className="text-muted-foreground">
                Todavía no tienes una tienda. Crea la primera para empezar.
              </p>
              <Button render={<Link href="/onboarding" />} className="w-full">
                Crear mi tienda
              </Button>
            </CardContent>
          </Card>
        </div>
      </PanelShell>
    );
  }

  const [{ count: productCount }, { data: storage }] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("store_id", store.id)
      .is("deleted_at", null),
    supabase
      .from("store_storage")
      .select("bytes_used")
      .eq("store_id", store.id)
      .maybeSingle(),
  ]);

  const plan = await getPlanLimits(store.plan_code);
  const used = Number(storage?.bytes_used ?? 0);
  const productUsage = getUsagePercent(productCount ?? 0, plan.max_products);
  const storageUsage = getUsagePercent(used, plan.max_storage_bytes);
  const isPublished = store.status === "published";

  return (
    <PanelShell>
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{store.name}</h2>
          <Badge variant={isPublished ? "default" : "secondary"}>
            {isPublished ? "Publicado" : "Borrador"}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Tu catálogo</CardTitle>
              {!isPublished ? (
                <CardDescription>
                  Mientras esté en borrador, tu catálogo no es visible.
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-[auto_minmax(2rem,1fr)_auto] items-center gap-3 text-sm">
                <span className="text-muted-foreground">Productos</span>
                <UsageProgress value={productUsage} label="Uso de productos" />
                <span>
                  {productCount ?? 0} de {plan.max_products}
                </span>
              </div>
              <div className="grid grid-cols-[auto_minmax(2rem,1fr)_auto] items-center gap-3 text-sm">
                <span className="text-muted-foreground">Almacenamiento</span>
                <UsageProgress value={storageUsage} label="Uso de almacenamiento" />
                <span className="text-right text-xs">
                  {formatBytes(used)} / {formatBytes(plan.max_storage_bytes)}
                </span>
              </div>

              <Button
                render={<Link href="/products/nuevo" />}
                size="lg"
                className="w-full justify-center gap-2 font-semibold"
              >
                <PackagePlus className="size-5" aria-hidden="true" />
                Nuevo producto
              </Button>

              {productCount === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  Tu catálogo está vacío. Crea tu primer producto para compartir tu link.
                </p>
              ) : (
                <Button render={<Link href="/products" />} variant="outline" className="w-full">
                  Ver productos
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Link público</CardTitle>
              <CardDescription>Enlace directo al catálogo</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                /s/{store.slug}
              </p>
              <Button render={<Link href="/ajustes" />} variant="outline" className="mt-3 w-full">
                Compartir
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PanelShell>
  );
}

function getUsagePercent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

function UsageProgress({ value, label }: { value: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
    >
      <div
        className="h-full rounded-full bg-black transition-[width] dark:bg-gray-100"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
