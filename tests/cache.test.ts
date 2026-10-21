/**
 * Caché en memoria con TTL y límites de plan (src/lib/cache.ts).
 */

import {
  setCache,
  getCache,
  deleteCache,
  clearCache,
  cached,
  getPlanLimits,
  DEFAULT_PLAN_LIMITS,
} from "@/lib/cache";

describe("caché en memoria", () => {
  beforeEach(async () => {
    await clearCache();
  });

  it("guarda y recupera un valor dentro del TTL", async () => {
    await setCache("k1", { a: 1 }, 60);
    expect(await getCache<{ a: number }>("k1")).toEqual({ a: 1 });
  });

  it("devuelve null para claves inexistentes", async () => {
    expect(await getCache("no-existe")).toBeNull();
  });

  it("expira entradas cuyo TTL ya venció", async () => {
    await setCache("k2", "vencido", 0);
    expect(await getCache("k2")).toBeNull();
  });

  it("deleteCache elimina la clave", async () => {
    await setCache("k3", 42, 60);
    await deleteCache("k3");
    expect(await getCache("k3")).toBeNull();
  });

  it("cached ejecuta el fetcher una sola vez mientras el valor es válido", async () => {
    const fetcher = vi.fn(async () => "fresco");
    const first = await cached("k4", 60, fetcher);
    const second = await cached("k4", 60, fetcher);
    expect(first).toBe("fresco");
    expect(second).toBe("fresco");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("límites de plan cacheados", () => {
  beforeEach(async () => {
    await clearCache();
  });

  it("usa los valores por defecto cuando no hay fetcher", async () => {
    const limits = await getPlanLimits("free");
    expect(limits).toEqual(DEFAULT_PLAN_LIMITS.free);
  });

  it("prefiere el valor de la base de datos si el fetcher responde", async () => {
    const fromDb = { ...DEFAULT_PLAN_LIMITS.free, max_products: 99 };
    const limits = await getPlanLimits("free", async () => fromDb);
    expect(limits.max_products).toBe(99);
  });

  it("cae a free cuando el plan es desconocido", async () => {
    const limits = await getPlanLimits("inexistente");
    expect(limits.plan_code).toBe("free");
  });

  it("cachea el resultado: el fetcher no se vuelve a llamar", async () => {
    const fetcher = vi.fn(async () => DEFAULT_PLAN_LIMITS.pro);
    await getPlanLimits("pro", fetcher);
    await getPlanLimits("pro", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
