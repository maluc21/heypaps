/**
 * Reglas puras del editor de variantes (plan §2.3). Sin DOM ni base de datos:
 * se pueden probar en vitest y se reutilizan en la acción de servidor.
 */

import { parseAmountToCents } from "@/lib/money";

export const MAX_ATTRIBUTES = 3;
export const MAX_ATTRIBUTE_LENGTH = 40;

export type AttributePair = { name: string; value: string };
export type DiscountType = "none" | "percent" | "fixed";

/**
 * Convierte los pares del formulario en el objeto que guarda la base.
 * Descarta filas vacías y lanza Error con un mensaje para el usuario ante
 * datos inválidos. Un nombre repetido también es error: el segundo valor
 * sobrescribiría al primero.
 */
export function attributesFromPairs(pairs: AttributePair[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const name = pair.name.trim();
    const value = pair.value.trim();
    if (!name && !value) continue;
    if (!name || !value) {
      throw new Error("Cada atributo necesita nombre y valor (por ejemplo Talle: M).");
    }
    if (name.length > MAX_ATTRIBUTE_LENGTH || value.length > MAX_ATTRIBUTE_LENGTH) {
      throw new Error(`Los atributos admiten hasta ${MAX_ATTRIBUTE_LENGTH} caracteres.`);
    }
    if (name in result) {
      throw new Error(`El atributo "${name}" aparece dos veces.`);
    }
    result[name] = value;
  }
  if (Object.keys(result).length > MAX_ATTRIBUTES) {
    throw new Error(`Una variante puede tener hasta ${MAX_ATTRIBUTES} atributos.`);
  }
  return result;
}

/** Pares del formulario a partir de lo guardado (para editar una variante). */
export function pairsFromAttributes(attributes: Record<string, unknown>): AttributePair[] {
  return Object.entries(attributes).map(([name, value]) => ({
    name,
    value: String(value),
  }));
}

/**
 * Descuento del formulario en unidades de la moneda (lempiras) o porcentaje.
 * Devuelve el valor que espera la base: centavos para el monto fijo, entero
 * 0-100 para el porcentaje.
 */
export function discountValueToStorage(
  type: DiscountType,
  input: string,
  priceCents: number,
): number {
  if (type === "none") return 0;

  if (type === "percent") {
    const pct = Number(input.trim());
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
      throw new Error("El descuento en porcentaje debe ser un entero de 0 a 100.");
    }
    return pct;
  }

  const cents = parseAmountToCents(input);
  if (cents === null || cents < 0) {
    throw new Error("El descuento fijo no es válido (usa 50 o 50.00).");
  }
  if (cents >= priceCents) {
    throw new Error("El descuento fijo debe ser menor que el precio.");
  }
  return cents;
}

/** Stock del formulario: vacío = por encargo (null), si no un entero >= 0. */
export function stockToStorage(input: string, madeToOrder: boolean): number | null {
  if (madeToOrder) return null;
  const trimmed = input.trim();
  const value = Number(trimmed);
  if (trimmed === "" || !Number.isInteger(value) || value < 0) {
    throw new Error("El stock debe ser un número entero mayor o igual a cero.");
  }
  return value;
}

/** Etiqueta corta de la variante: "Talle M / Color Negro" o "Única" sin atributos. */
export function variantLabel(attributes: Record<string, unknown>): string {
  const parts = Object.entries(attributes).map(([name, value]) => `${name} ${String(value)}`);
  return parts.length > 0 ? parts.join(" / ") : "Única";
}
