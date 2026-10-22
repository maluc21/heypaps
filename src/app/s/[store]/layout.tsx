import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCatalog } from "@/lib/catalog";

/**
 * Guarda del catalogo publico.
 *
 * La comprobacion va aqui, antes de que la pagina suspenda: con Partial
 * Prerender, un notFound() en la pagina llega con status 200 (soft 404) y
 * un crawler lo indexaria. Verificar si aqui dentro da 404 real.
 */
export default async function PublicStoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ store: string }>;
}) {
  await connection();
  const { store } = await params;

  const data = await getCatalog(store, 1, 0, null);
  if (!data?.store) notFound();

  return <>{children}</>;
}
