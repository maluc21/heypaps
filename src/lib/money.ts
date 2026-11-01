/**
 * Conversión de montos ingresados en unidades monetarias (ej. lempiras) a centavos enteros.
 *
 * Formato aceptado: dígitos, con opcionalmente un punto decimal y hasta 2 decimales.
 * "450" -> 45000, "450.5" -> 45050, "450.50" -> 45050.
 * Rechaza comas, signos, notación científica y montos fuera del rango de la columna int.
 * Trabaja con cadenas (no con floats) para no perder centavos por redondeo binario.
 */

const MAX_CENTS = 2_147_483_647; // límite de int4 en variants.price_cents
const AMOUNT_RE = /^\d{1,7}(\.\d{1,2})?$/;

/**
 * Mensaje de error para un monto inválido. Devuelve null si el monto es válido.
 * Centraliza la validación para que todos los formularios reporten el mismo error.
 */
export function amountError(input: string): string | null {
  const s = input.trim();
  if (AMOUNT_RE.test(s)) return null;
  if (s.includes(",")) {
    return "No uses comas para separar miles: escribe el precio corrido (ej. 1500). Puedes usar punto para los decimales (ej. 1500.50).";
  }
  return "El precio debe ser mayor que cero (usa 450 o 450.50).";
}

export function parseAmountToCents(input: string): number | null {
  const s = input.trim();
  if (!AMOUNT_RE.test(s)) return null;

  const [whole, fraction = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return cents;
}