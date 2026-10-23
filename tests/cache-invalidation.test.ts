/**
 * Invalidadores de caché del catálogo y del proxy.
 *
 * Verifica que al cambiar un producto o el estado de una tienda se borran
 * las claves de caché en memoria del proxy (store-published / product-published)
 * además de invalidar los tags de Next.js.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { getCache, setCache, clearCache } from "@/lib/cache";
import {
  invalidateProductCatalog,
  invalidateStoreCatalog,
} from "@/lib/catalog-cache";

const slug = "tienda-prueba";
const productSlug = "producto-prueba";
const storeId = "11111111-1111-1111-1111-111111111111";
const productId = "22222222-2222-2222-2222-222222222222";

const tags = new Set<string>();
vi.mock("next/cache", () => ({
  updateTag: vi.fn((tag: string) => tags.add(tag)),
}));

function mockSupabase(storeSlug: string | null, productSlugResult: string | null) {
  let lastTable: string | null = null;
  return {
    from: (table: string) => {
      lastTable = table;
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (lastTable === "stores") {
                return storeSlug !== null
                  ? { data: { slug: storeSlug }, error: null }
                  : { data: null, error: null };
              }
              if (lastTable === "products") {
                return productSlugResult !== null
                  ? { data: { slug: productSlugResult, store_id: storeId }, error: null }
                  : { data: null, error: null };
              }
              return { data: null, error: null };
            },
          }),
        }),
      };
    },
  };
}

beforeEach(async () => {
  await clearCache();
  tags.clear();
  vi.restoreAllMocks();
});

describe("invalidateStoreCatalog (cambios no-producto)", () => {
  it("borrará caché de proxy de la tienda", async () => {
    await setCache(`store-published:${slug}`, true, 2);
    const supabase = mockSupabase(slug, null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await invalidateStoreCatalog(supabase as any, storeId);
    await new Promise((r) => setTimeout(r, 0));
    expect(await getCache(`store-published:${slug}`)).toBeNull();
  });

  it("no falla si la tienda no tiene slug", async () => {
    const supabase = mockSupabase(null, null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(invalidateStoreCatalog(supabase as any, storeId)).resolves.toBeUndefined();
  });
});

describe("invalidateProductCatalog (cambio de precio/producto)", () => {
  it("borrará caché de proxy de tienda y producto", async () => {
    await setCache(`store-published:${slug}`, true, 2);
    await setCache(`product-published:${slug}:${productSlug}`, true, 2);
    const supabase = mockSupabase(slug, productSlug);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await invalidateProductCatalog(supabase as any, productId);
    await new Promise((r) => setTimeout(r, 0));
    expect(await getCache(`store-published:${slug}`)).toBeNull();
    expect(await getCache(`product-published:${slug}:${productSlug}`)).toBeNull();
  });

  it("no falla si el producto no tiene store_id", async () => {
    const supabase = mockSupabase(slug, null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(invalidateProductCatalog(supabase as any, productId)).resolves.toBeUndefined();
  });
});
