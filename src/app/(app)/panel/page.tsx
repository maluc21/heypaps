import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store-context";
import { getPlanLimits } from "@/lib/cache";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
  const isPublished = store.status === "published";

  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{store.name}</h2>
        <Badge variant={isPublished ? "default" : "secondary"}>
          {isPublished ? "Publicado" : "Borrador"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tu catálogo</CardTitle>
          <CardDescription>
            {isPublished
              ? "Comparte tu link por WhatsApp con tus clientes."
              : "Mientras esté en borrador, tu catálogo no es visible."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Productos</span>
            <span>
              {productCount ?? 0} de {plan.max_products}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Almacenamiento</span>
            <span>{formatBytes(used)}</span>
          </div>

          <Button render={<Link href="/products/nuevo" />} className="w-full">
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
          <CardTitle>Enlace público</CardTitle>
          <CardDescription>Donde te encuentran tus clientes.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs">
            /s/{store.slug}
          </p>
          <Button render={<Link href="/ajustes" />} variant="outline" className="mt-3 w-full">
            Compartir y publicar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
