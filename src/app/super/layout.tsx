import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Superadmin · Catálogo SaaS",
  description: "Operación de la plataforma",
};

export const instant = false;

/**
 * Guarda del superadmin: sesión activa y rol de plataforma.
 *
 * La comprobación real está en las RPC (validan el rol dentro de la base).
 * Aquí solo se evita mostrar la interfaz a quien no le corresponde.
 */
export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // La política platform_members_own solo deja leer la propia fila.
  const { data: member } = await supabase
    .from("platform_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) notFound();

  return <div className="min-h-dvh bg-muted/30">{children}</div>;
}
