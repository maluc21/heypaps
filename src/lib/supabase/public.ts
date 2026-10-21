/**
 * Supabase cliente para lecturas públicas del catálogo.
 *
 * Usa la clave publicable (rol `anon`) sin sesión ni persistencia: el comprador
 * nunca se registra y la RPC pública `public_catalog` / `public_product` es la
 * única superficie de lectura (plan §5.4).
 */

import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

export function createPublicClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getEnv();
  return createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
