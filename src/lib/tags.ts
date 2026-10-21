/**
 * Colores disponibles para las etiquetas del catálogo (plan §2.5).
 *
 * Vive fuera de src/lib/actions/tag.ts porque un archivo "use server" solo
 * puede exportar funciones async: exportar una constante rompe el render.
 */

export const TAG_COLORS = [
  "#e11d48",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0d9488",
  "#2563eb",
  "#7c3aed",
  "#db2777",
] as const;

export type TagColor = (typeof TAG_COLORS)[number];
