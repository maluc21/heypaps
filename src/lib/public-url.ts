/**
 * URL pública de una tienda y sus productos (plan §4.5: canonical por subdominio).
 *
 * El proxy reescribe `{tienda}.dominio.com` a la ruta interna `/s/{slug}`,
 * pero la URL del navegador no cambia. La URL canonica debe ser la que el
 * comprador ve y comparte: con subdominio si lo hay, con la ruta si no.
 */

/** Subdominios que sirven la aplicación, no una tienda. */
const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "super",
  "admin",
  "api",
  "assets",
  "cdn",
  "mail",
  "staging",
]);

/** true si el host es un subdominio de tienda (no reservado). */
export function isStoreSubdomain(host: string | null | undefined): boolean {
  if (!host) return false;
  const hostname = host.split(":")[0];
  const parts = hostname.split(".");
  if (parts.length < 3) return false;
  return !RESERVED_SUBDOMAINS.has(parts[0]);
}

/**
 * URL canonica de una pagina del catalogo.
 *
 * - Con subdominio: https://{tienda}.dominio.com/{ruta}
 * - Sin subdominio: {APP_URL}/s/{slug}/{ruta}
 */
export function publicUrl(params: {
  host: string | null | undefined;
  appUrl: string;
  storeSlug: string;
  /** Ruta dentro de la tienda, sin el prefijo /s/{slug}. */
  path?: string;
}): string {
  const { host, appUrl, storeSlug, path = "" } = params;
  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";

  if (isStoreSubdomain(host)) {
    const hostname = host!.split(":")[0];
    return `https://${hostname}${suffix}`;
  }

  const base = appUrl.replace(/\/+$/, "");
  return `${base}/s/${storeSlug}${suffix}`;
}
