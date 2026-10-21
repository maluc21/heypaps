/**
 * Mensajes de WhatsApp (plan §8.3).
 *
 * La venta cierra en WhatsApp: el catálogo solo prepara el mensaje. Sin
 * variante se omite la línea de variante; la razón ("Agotado") se muestra
 * deshabilitada en la UI, no dentro del enlace.
 */

export type WhatsAppProductMessage = {
  storeName: string;
  productName: string;
  /** Etiquetas de la variante elegida, p.ej. { Talle: "M", Color: "Negro" }. */
  variantAttributes?: Record<string, string> | null;
  /** Precio final en centavos, ya formateado por la moneda de la tienda. */
  price?: string | null;
  /** URL pública del producto. */
  productUrl?: string | null;
};

export type WhatsAppCatalogMessage = {
  storeName: string;
  catalogUrl?: string | null;
};

/** Quita el prefijo '+' y deja solo dígitos: wa.me no lo acepta. */
export function normalizeWhatsAppPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Etiquetas de una variante como "Talle M / Negro". */
export function formatVariantAttributes(
  attributes: Record<string, string> | null | undefined,
): string {
  if (!attributes) return "";
  const parts = Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([name, value]) => `${name} ${value}`);
  return parts.join(" / ");
}

/** Mensaje pre-armado de la ficha de producto (plan §8.3). */
export function buildProductMessage(params: WhatsAppProductMessage): string {
  const lines = [`Hola ${params.storeName} 👋`, `Me interesa *${params.productName}*`];

  const variant = formatVariantAttributes(params.variantAttributes);
  if (variant) {
    lines.push(`Variante: ${variant}`);
  }
  if (params.price) {
    lines.push(`Precio: ${params.price}`);
  }
  if (params.productUrl) {
    lines.push(params.productUrl);
  }

  return lines.join("\n");
}

/** Mensaje del botón de WhatsApp a nivel catálogo (plan §8.3). */
export function buildCatalogMessage(params: WhatsAppCatalogMessage): string {
  const lines = [`Hola ${params.storeName} 👋`, "Vi su catálogo y quiero información."];
  if (params.catalogUrl) {
    lines.push(params.catalogUrl);
  }
  return lines.join("\n");
}

/** Enlace wa.me con el mensaje pre-armado. */
export function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = normalizeWhatsAppPhone(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
