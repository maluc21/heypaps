import { describe, expect, it } from "vitest";
import {
  buildCatalogMessage,
  buildProductMessage,
  buildWhatsAppUrl,
  formatVariantAttributes,
  normalizeWhatsAppPhone,
} from "@/lib/whatsapp";

describe("normalizeWhatsAppPhone", () => {
  it("deja solo dígitos", () => {
    expect(normalizeWhatsAppPhone("+504 3123-4567")).toBe("50431234567");
  });

  it("acepta un número ya sin formato", () => {
    expect(normalizeWhatsAppPhone("50431234567")).toBe("50431234567");
  });
});

describe("formatVariantAttributes", () => {
  // Se muestra nombre + valor de cada atributo ("Talle M / Color Negro"): el
  // plan escribe "Talle M / Negro" como abreviatura, pero repetir el nombre
  // evita que el comprador confunda dos atributos con valores parecidos.
  it("une los atributos con nombre y valor", () => {
    expect(formatVariantAttributes({ Talle: "M", Color: "Negro" })).toBe("Talle M / Color Negro");
  });

  it("devuelve vacío sin atributos", () => {
    expect(formatVariantAttributes({})).toBe("");
    expect(formatVariantAttributes(null)).toBe("");
  });

  it("omite atributos vacíos", () => {
    expect(formatVariantAttributes({ Talle: "M", Color: "" })).toBe("Talle M");
  });
});

describe("buildProductMessage", () => {
  it("arma el mensaje pre-armado con tienda, producto, precio y link", () => {
    const message = buildProductMessage({
      storeName: "Tienda A",
      productName: "Camisa",
      variantAttributes: { Talle: "M" },
      price: "L 450.00",
      productUrl: "/s/tienda-a/camisa",
    });

    expect(message).toContain("Hola Tienda A");
    expect(message).toContain("Me interesa *Camisa*");
    expect(message).toContain("Variante: Talle M");
    expect(message).toContain("Precio: L 450.00");
    expect(message).toContain("/s/tienda-a/camisa");
  });

  it("omite la línea de variante si el producto no tiene", () => {
    const message = buildProductMessage({
      storeName: "Tienda A",
      productName: "Camisa",
      price: "L 450.00",
    });

    expect(message).not.toContain("Variante:");
    expect(message).toContain("Precio: L 450.00");
  });
});

describe("buildCatalogMessage", () => {
  it("arma el mensaje del botón de catálogo", () => {
    const message = buildCatalogMessage({ storeName: "Tienda A", catalogUrl: "/s/tienda-a" });
    expect(message).toContain("Hola Tienda A");
    expect(message).toContain("Vi su catálogo y quiero información.");
  });
});

describe("buildWhatsAppUrl", () => {
  it("arma el enlace wa.me con el mensaje codificado", () => {
    const url = buildWhatsAppUrl("+504 3123 4567", "Hola Tienda A");
    expect(url.startsWith("https://wa.me/50431234567?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toBe("Hola Tienda A");
  });
});
