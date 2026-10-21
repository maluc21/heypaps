import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store-context";
import {
  CategoryManager,
  type Category,
} from "@/components/category-manager";

export const metadata = {
  title: "Categorías · Panel",
  description: "Organiza tu catálogo por categorías",
};

export const instant = false;

export default async function CategoriesPage() {
  await connection();
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const store = await getCurrentStore(user.id);
  if (!store) redirect("/onboarding");

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, slug, position, active")
    .eq("store_id", store.id)
    .order("position", { ascending: true });

  return (
    <CategoryManager
      storeId={store.id}
      categories={(categories ?? []) as Category[]}
    />
  );
}
