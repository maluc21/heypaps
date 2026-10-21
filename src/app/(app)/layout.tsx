import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

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

  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-auto pb-20">{children}</main>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-muted bg-background/90 backdrop-blur-md px-4 pt-2 pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="flex justify-around">
          <a
            href="/panel"
            className="flex flex-col items-center gap-1 text-xs text-primary"
          >
            <span className="relative">🏠</span>
            <span>Panel</span>
          </a>
          <Link
            href="/products"
            className="flex flex-col items-center gap-1 text-xs text-muted-foreground"
          >
            <span className="relative">📦</span>
            <span>Productos</span>
          </Link>
          <a
            href="/categorias"
            className="flex flex-col items-center gap-1 text-xs text-muted-foreground"
          >
            <span className="relative">🏷️</span>
            <span>Categorías</span>
          </a>
          <a
            href="/ajustes"
            className="flex flex-col items-center gap-1 text-xs text-muted-foreground"
          >
            <span className="relative">⚙️</span>
            <span>Ajustes</span>
          </a>
        </div>
      </nav>
    </div>
  );
}
