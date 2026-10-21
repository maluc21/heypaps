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

export function parseAmountToCents(input: string): number | null {
  const s = input.trim();
  if (!AMOUNT_RE.test(s)) return null;

  const [whole, fraction = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return cents;
}
