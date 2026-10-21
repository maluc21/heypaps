import { connection } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { ProductsTable, type Product } from "@/components/products-table";
import { getCurrentStore } from "@/lib/store-context";

export const metadata = {
  title: "Productos · Panel",
  description: "Administra los productos y variantes de tu catálogo",
};

export const instant = false;

export default async function ProductsPage() {
  // Render dinámico por petición: datos privados del inquilino, nunca prerenderizados.
  await connection();
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <ProductsTable
        initialProducts={[]}
        categories={[]}
        tags={[]}
        currency="HNL"
      />
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
    <ProductsTable
      initialProducts={(products ?? []) as Product[]}
      categories={categories ?? []}
      tags={tags ?? []}
      currency={store?.currency ?? "HNL"}
    />
  );
}
