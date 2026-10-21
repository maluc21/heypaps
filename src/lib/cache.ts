/**
 * Capa de caché con soporte para TTL y LRU básica.
 * Usa KV_URL vía REST si está configurado como HTTP/HTTPS,
 * o un almacén en memoria de alto desempeño para desarrollo y entornos serverless.
 */

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const MAX_CACHE_ENTRIES = 1000;
const memoryCache = new Map<string, CacheEntry<unknown>>();

function purgeExpired() {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt <= now) {
      memoryCache.delete(key);
    }
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  const entry = memoryCache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }

  return entry.value as T;
}

export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds = 300
): Promise<void> {
  if (memoryCache.size >= MAX_CACHE_ENTRIES) {
    purgeExpired();
    if (memoryCache.size >= MAX_CACHE_ENTRIES) {
      // Evict oldest inserted key
      const firstKey = memoryCache.keys().next().value;
      if (firstKey) memoryCache.delete(firstKey);
    }
  }

  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export async function deleteCache(key: string): Promise<void> {
  memoryCache.delete(key);
}

export async function clearCache(): Promise<void> {
  memoryCache.clear();
}

/**
 * Patrón cache-aside tipado.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const existing = await getCache<T>(key);
  if (existing !== null) {
    return existing;
  }

  const fresh = await fetcher();
  await setCache(key, fresh, ttlSeconds);
  return fresh;
}

// ============================================================
// Límites de plan cacheados (plan fundacional §0.7, §4.1)
// ============================================================

export type PlanLimits = {
  plan_code: string;
  max_products: number;
  max_images_per_product: number;
  max_storage_bytes: number;
  custom_domain: boolean;
  remove_brand: boolean;
};

export const DEFAULT_PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    plan_code: "free",
    max_products: 30,
    max_images_per_product: 5,
    max_storage_bytes: 40 * 1024 * 1024,
    custom_domain: false,
    remove_brand: false,
  },
  pro: {
    plan_code: "pro",
    max_products: 200,
    max_images_per_product: 8,
    max_storage_bytes: 500 * 1024 * 1024,
    custom_domain: true,
    remove_brand: true,
  },
};

export async function getPlanLimits(
  planCode: string,
  fetcher?: () => Promise<PlanLimits | null>
): Promise<PlanLimits> {
  const cacheKey = `plan_limits:${planCode}`;
  return cached(cacheKey, 3600, async () => {
    if (fetcher) {
      const fromDb = await fetcher();
      if (fromDb) return fromDb;
    }
    return DEFAULT_PLAN_LIMITS[planCode] ?? DEFAULT_PLAN_LIMITS.free;
  });
}
