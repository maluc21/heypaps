import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Panel · Catálogo SaaS",
  description: "Panel de tu catálogo digital",
};

const NAV_ITEMS = [
  { href: "/panel", label: "Panel", icon: "🏠" },
  { href: "/products", label: "Productos", icon: "📦" },
  { href: "/categorias", label: "Categorías", icon: "🏷️" },
  { href: "/etiquetas", label: "Etiquetas", icon: "🔖" },
  { href: "/ajustes", label: "Ajustes", icon: "⚙️" },
];

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

  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
