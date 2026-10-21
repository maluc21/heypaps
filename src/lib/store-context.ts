/**
 * Contexto de la tienda del usuario actual (servidor).
 *
 * El panel siempre trabaja sobre una tienda: la primera a la que pertenece el
 * usuario. Centralizar la búsqueda evita duplicar la misma consulta en cada
 * pantalla del panel.
 */

import { createServerClient } from "@/lib/supabase/server";

export type CurrentStore = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_file_id: string | null;
  whatsapp_e164: string | null;
  currency: string;
  secondary_currency: string | null;
  fx_rate: number | null;
  plan_code: string;
  status: "draft" | "published" | "suspended";
  role: "owner" | "editor" | "viewer";
};

/**
 * Tienda actual del usuario, o null si todavía no tiene ninguna.
 * `userId` se recibe para no repetir la llamada a getUser en cada pantalla.
 */
export async function getCurrentStore(userId: string): Promise<CurrentStore | null> {
  const supabase = await createServerClient();

  const { data: membership } = await supabase
    .from("store_members")
    .select("store_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  const { data: store } = await supabase
    .from("stores")
    .select("*")
    .eq("id", membership.store_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!store) return null;

  return { ...store, role: membership.role } as CurrentStore;
}
