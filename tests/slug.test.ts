/**
 * Normalización de slug y formato de mensaje de WhatsApp (§8.1, §8.3).
 */

function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const RESERVED = new Set([
  "www", "app", "super", "admin", "api", "assets", "cdn", "mail", "staging",
]);

function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug);
}

function whatsAppMessage({
  storeName,
  product,
  variant,
  priceCents,
  currency = "HNL",
  url,
}: {
  storeName: string;
  product: string;
  variant?: string | null;
  priceCents: number;
  currency?: string;
  url: string;
}): string {
  const formatted = new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(priceCents / 100);
  const lines = [
    `Hola ${storeName} 👋`,
    `Me interesa *${product}*`,
  ];
  if (variant) lines.push(`Variante: ${variant}`);
  lines.push(`Precio: ${formatted}`);
  lines.push(url);
  return lines.join("\n");
}

describe("slug", () => {
  it("normaliza espacios y mayúsculas", () => {
    expect(normalizeSlug("Mi Tienda")).toBe("mi-tienda");
    expect(normalizeSlug("  Camiseta Roja  ")).toBe("camiseta-roja");
  });

  it("elimina caracteres especiales", () => {
    expect(normalizeSlug("Producto #1 (oferta!)")).toBe("producto-1-oferta");
  });

  it("colapsa múltiples separadores", () => {
    expect(normalizeSlug("a___b---c")).toBe("a-b-c");
  });

  it("detiene slugs reservados", () => {
    expect(isReservedSlug("app")).toBe(true);
    expect(isReservedSlug("super")).toBe(true);
    expect(isReservedSlug("tienda")).toBe(false);
  });
});

describe("mensaje de WhatsApp", () => {
  it("sin variante omite la línea de variante", () => {
    const m = whatsAppMessage({
      storeName: "Mi Tienda",
      product: "Camiseta",
      variant: null,
      priceCents: 45000,
      currency: "HNL",
      url: "https://tienda.midominio.com/s/tienda-a/producto/camiseta",
    });
    expect(m).not.toContain("Variante:");
    expect(m).toContain("450.00");
    expect(m).toContain("Me interesa *Camiseta*");
  });

  it("con variante incluye la línea de variante", () => {
    const m = whatsAppMessage({
      storeName: "Mi Tienda",
      product: "Camiseta",
      variant: "Talle M / Negro",
      priceCents: 45000,
      currency: "HNL",
      url: "https://tienda.midominio.com/s/tienda-a/producto/camiseta",
    });
    expect(m).toContain("Variante: Talle M / Negro");
    expect(m).toContain("450.00");
  });
});
