'use server'

import { updateTag } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminStoreStatus = "draft" | "published" | "suspended";

export type AdminStore = {
  id: string;
  slug: string;
  name: string;
  status: AdminStoreStatus;
  plan_code: string;
  created_at: string;
  updated_at: string;
  products: number;
  bytes_used: number;
  max_storage_bytes: number;
  max_products: number;
  owner_email: string | null;
  last_sign_in_at: string | null;
};

export type AdminPlan = {
  plan_code: string;
  max_products: number;
  max_images_per_product: number;
  max_storage_bytes: number;
  remove_brand: boolean;
  custom_domain: boolean;
};

export type AdminList = {
  role: "superadmin" | "support";
  plans: AdminPlan[];
  stores: AdminStore[];
};

/** Listado de tiendas con metadatos de operacion. */
export async function adminListStores(): Promise<AdminList | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("admin_list_stores");
  if (error || !data) return null;
  return data as AdminList;
}

/** Suspende, reactiva o despublica una tienda. */
export async function adminSetStoreStatus(
  storeId: string,
  status: AdminStoreStatus,
): Promise<{ error?: string }> {
  if (!UUID_RE.test(storeId)) return { error: "Tienda inválida." };

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("admin_set_store_status", {
    p_store_id: storeId,
    p_status: status,
  });

  if (error) {
    return { error: error.message ?? "No se pudo cambiar el estado." };
  }

  await invalidateStore(supabase, storeId);
  return {};
}

/** Cambia el plan de una tienda. */
export async function adminSetStorePlan(
  storeId: string,
  planCode: string,
): Promise<{ error?: string }> {
  if (!UUID_RE.test(storeId)) return { error: "Tienda inválida." };

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("admin_set_store_plan", {
    p_store_id: storeId,
    p_plan_code: planCode,
  });

  if (error) {
    return { error: error.message ?? "No se pudo cambiar el plan." };
  }

  await invalidateStore(supabase, storeId);
  return {};
}

export type AuditEntry = {
  id: number;
  action: string;
  entity: string | null;
  entity_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  actor_email: string | null;
};

/** Auditoría de una tienda. */
export async function adminAuditLog(
  storeId: string,
  limit = 100,
): Promise<AuditEntry[]> {
  if (!UUID_RE.test(storeId)) return [];

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("admin_audit_log", {
    p_store_id: storeId,
    p_limit: limit,
  });
  if (error || !data) return [];

  return ((data as { entries?: AuditEntry[] }).entries ?? []);
}

/**
 * El catálogo de una tienda suspendida deja de servirse: su caché debe
 * invalidarse para que el cambio se vea de inmediato.
 */
async function invalidateStore(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  storeId: string,
): Promise<void> {
  const { data: store } = await supabase
    .from("stores")
    .select("slug")
    .eq("id", storeId)
    .maybeSingle();
  if (store?.slug) {
    updateTag(`catalog:${store.slug}`);
  }
}
