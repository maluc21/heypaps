import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store-context";
import { TopBar } from "@/components/top-bar";

export const metadata = {
  title: "Panel · Catálogo SaaS",
  description: "Panel de tu catálogo digital",
};

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guarda de ruta: todo el panel exige sesión. La RLS ya impide datos ajenos;
  // esta redirección evita render vacío y deja clara la experiencia sin sesión.
  await connection();
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const store = await getCurrentStore(user.id, supabase);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar storeName={store?.name || "Catálogo"} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
