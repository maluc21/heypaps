/**
 * Reglas puras del editor de variantes (plan §2.3). Sin DOM ni base de datos:
 * se pueden probar en vitest y se reutilizan en la acción de servidor.
 */

import { parseAmountToCents } from "@/lib/money";

export const MAX_ATTRIBUTES = 3;
export const MAX_ATTRIBUTE_LENGTH = 40;

export const WEIGHT_UNITS = ["g", "kg", "oz", "lb"] as const;
export const SIZE_UNITS = ["mm", "cm", "m", "pulg"] as const;

export type AttributeTypeKey =
  | "color"
  | "talla-palabra"
  | "talla-codigo"
  | "peso"
  | "tamano"
  | "libre";

export type SizeDimensions = {
  height: string;
  width: string;
  depth: string;
};

export type AttributePair = {
  name: string;
  value: string;
  type?: AttributeTypeKey;
  unit?: string;
  dimensions?: SizeDimensions;
};
export type DiscountType = "none" | "percent" | "fixed";

function normalizePositiveMeasurement(input: string, label: string): string {
  const normalized = input.trim().replace(",", ".");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized) || Number(normalized) <= 0) {
    throw new Error(`Indica un valor numérico mayor que cero para ${label}.`);
  }
  return normalized.startsWith(".") ? `0${normalized}` : normalized;
}

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
    if (!name && !pair.value.trim() && !pair.dimensions) continue;
    if (!name) {
      throw new Error("Cada atributo necesita un nombre.");
    }

    let value: string;
    if (pair.type === "peso") {
      const unit = WEIGHT_UNITS.find((candidate) => candidate === pair.unit);
      if (!unit) throw new Error("Selecciona una unidad válida para el peso.");
      value = `${normalizePositiveMeasurement(pair.value, "el peso")} ${unit}`;
    } else if (pair.type === "tamano") {
      const unit = SIZE_UNITS.find((candidate) => candidate === pair.unit);
      if (!unit) throw new Error("Selecciona una unidad válida para las dimensiones.");
      const dimensions = pair.dimensions;
      if (!dimensions) throw new Error("Completa alto, ancho y profundidad.");
      value = [
        normalizePositiveMeasurement(dimensions.height, "el alto"),
        normalizePositiveMeasurement(dimensions.width, "el ancho"),
        normalizePositiveMeasurement(dimensions.depth, "la profundidad"),
      ].join(" × ") + ` ${unit}`;
    } else {
      value = pair.value.trim();
    }

    if (!value) {
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
  return Object.entries(attributes).map(([name, rawValue]) => {
    const value = String(rawValue);
    const normalizedName = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    if (normalizedName === "peso") {
      const match = value.match(/^(\d+(?:[.,]\d+)?|\.\d+)\s*(g|kg|oz|lb)$/i);
      const unit = match && WEIGHT_UNITS.find(
        (candidate) => candidate === match[2].toLowerCase(),
      );
      if (match && unit) {
        return {
          name,
          value: match[1].replace(",", "."),
          type: "peso",
          unit,
        };
      }
    }

    if (normalizedName === "tamano") {
      const match = value.match(
        /^(\d+(?:[.,]\d+)?|\.\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?|\.\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?|\.\d+)\s*(mm|cm|m|pulg)$/i,
      );
      const unit = match && SIZE_UNITS.find(
        (candidate) => candidate === match[4].toLowerCase(),
      );
      if (match && unit) {
        return {
          name,
          value: "",
          type: "tamano",
          unit,
          dimensions: {
            height: match[1].replace(",", "."),
            width: match[2].replace(",", "."),
            depth: match[3].replace(",", "."),
          },
        };
      }
    }

    if (normalizedName === "color") return { name, value, type: "color" };
    if (normalizedName.startsWith("talla")) {
      return { name, value, type: "talla-codigo" };
    }
    return { name, value, type: "libre" };
  });
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

/**
 * Stock del formulario. Cuando el modo es inventario (madeToOrder=false) se
 * requiere una cantidad numérica. Sin stock no se guarda: un campo vacío no
 * debe significar agotado ni ilimitado por accidente.
 */
export function stockToStorage(input: string, madeToOrder: boolean): number | null {
  if (madeToOrder) return null;
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new Error("Indica la cantidad de unidades de producto.");
  }
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("El stock debe ser un número entero mayor o igual a cero.");
  }
  return value;
}

/** Nombre opcional para describir la unidad del inventario ("cajas", "sacos"). */
export function stockUnitToStorage(input: string, madeToOrder: boolean): string | null {
  if (madeToOrder) return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (trimmed.length > MAX_ATTRIBUTE_LENGTH) {
    throw new Error(`El nombre de la cantidad admite hasta ${MAX_ATTRIBUTE_LENGTH} caracteres.`);
  }
  return trimmed;
}

/**
 * ¿Guardar esta variante activa va a ocultar la presentación única?
 * Lo hace la base: si una variante con atributos queda activa, la variante sin
 * atributos (la presentación única) se oculta en la misma operación.
 */
export function hidesSinglePresentation(
  attributes: Record<string, unknown>,
  active: boolean,
  variants: Array<{ id: string; attributes: Record<string, unknown>; active: boolean }>,
  editingId: string | null,
): boolean {
  if (!active || Object.keys(attributes).length === 0) return false;
  return variants.some(
    (v) => v.active && Object.keys(v.attributes).length === 0 && v.id !== editingId,
  );
}

/** Etiqueta corta de la variante: "Talle M / Color Negro" o "Única" sin atributos. */
export function variantLabel(attributes: Record<string, unknown>): string {
  const parts = Object.entries(attributes).map(([name, value]) => `${name} ${String(value)}`);
  return parts.length > 0 ? parts.join(" / ") : "Única";
}
