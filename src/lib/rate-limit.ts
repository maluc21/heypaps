/**
 * Limitador de tasas en memoria (dev).
 * En producción reemplazar por KV/Redis para compartir estado entre instancias.
 */

type Record = { count: number; first: number };
const attempts = new Map<string, Record>();

export function checkRateLimit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.first > windowMs) {
    attempts.set(key, { count: 1, first: now });
    return { ok: true, remaining: Math.max(0, limit - 1) };
  }

  if (entry.count >= limit) {
    return { ok: false, remaining: 0 };
  }

  entry.count++;
  return { ok: true, remaining: Math.max(0, limit - entry.count) };
}
