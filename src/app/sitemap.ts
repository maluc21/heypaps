import type { MetadataRoute } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { getEnv } from "@/lib/env";
import { publicUrl } from "@/lib/public-url";

/**
 * sitemap.xml con las tiendas publicadas y sus productos (plan §4.5).
 *
 * Las entradas salen de la RPC publica: solo slug, nombre y fecha, que ya son
 * publicos. Las tiendas en borrador o suspendidas no aparecen.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { NEXT_PUBLIC_APP_URL } = getEnv();
  const supabase = createPublicClient();

  const { data, error } = await supabase.rpc("public_sitemap_entries");
  if (error || !data) {
    return [];
  }

  const stores = (data as { stores?: SitemapStore[] }).stores ?? [];
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [];

  for (const store of stores) {
    entries.push({
      url: publicUrl({
        host: null,
        appUrl: NEXT_PUBLIC_APP_URL,
        storeSlug: store.slug,
      }),
      lastModified: store.updated_at ? new Date(store.updated_at) : now,
      changeFrequency: "weekly",
      priority: 0.8,
    });

    for (const product of store.products) {
      entries.push({
        url: publicUrl({
          host: null,
          appUrl: NEXT_PUBLIC_APP_URL,
          storeSlug: store.slug,
          path: `/${product.slug}`,
        }),
        lastModified: product.updated_at ? new Date(product.updated_at) : now,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  return entries;
}

type SitemapStore = {
  slug: string;
  name: string;
  updated_at: string | null;
  products: Array<{ slug: string; updated_at: string | null }>;
};
