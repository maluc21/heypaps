export { cn } from "cn";

export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const RESERVED_SLUGS = new Set([
  "www", "app", "super", "admin", "api", "assets", "cdn", "mail", "staging",
]);

export function formatMoney(cents: number, currency = "HNL"): string {
  return new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
