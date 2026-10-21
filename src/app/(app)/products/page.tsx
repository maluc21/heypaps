import { connection } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { ProductsTable, type Product } from "@/components/products-table";

export const metadata = {
  title: "Productos · Panel",
  description: "Administra los productos y variantes de tu catálogo",
};

export const instant = false;

export default async function ProductsPage() {
  // Render dinámico por petición: datos privados del inquilino, nunca prerenderizados.
  await connection();
  const supabase = await createServerClient();
  const { data: products } = await supabase
    .from("products")
    .select("*, variants(*)")
    .order("position", { ascending: true });

  return <ProductsTable initialProducts={(products ?? []) as Product[]} />;
}
