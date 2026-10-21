import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { adminListStores } from "@/lib/actions/admin";
import { StoreAdmin } from "@/components/superadmin/store-admin";

export const metadata = {
  title: "Superadmin · Catálogo SaaS",
  description: "Listado de tiendas y operación de la plataforma",
};

export const instant = false;

export default async function SuperAdminPage() {
  await connection();
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const data = await adminListStores();
  if (!data) notFound();

  return <StoreAdmin initial={data} />;
}
