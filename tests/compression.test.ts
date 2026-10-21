/**
 * Compresión de imagen en cliente: peso y dimensiones resultantes (especificación §6.2 / 3.1).
 *
 * Largo máximo 1600 px, calidad 0.8, objetivo <= 350 KB, rechazo > 25 MB.
 *
 * Prueba el código real de src/lib/image.ts: si los parámetros cambian, el
 * presupuesto de 3 GB del DAM deja de cuadrar y el test debeaversarse.
 */

import {
  ACCEPTED_IMAGE_TYPES,
  IMAGE_QUALITY,
  MAX_IMAGE_LENGTH,
  MAX_UPLOAD_BYTES,
  TARGET_MAX_BYTES,
  computeOutputDimensions,
  isAcceptedType,
  isTooLarge,
  toKb,
} from "@/lib/image";

describe("compresión de imagen", () => {
  it("imagen menor al límite no se escala", () => {
    expect(computeOutputDimensions({ width: 800, height: 600 })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("imagen paisaje se escala al largo máximo 1600 preservando proporción", () => {
    expect(computeOutputDimensions({ width: 3200, height: 2400 })).toEqual({
      width: 1600,
      height: 1200,
    });
  });

  it("imagen retrato se escala al largo máximo 1600", () => {
    expect(computeOutputDimensions({ width: 1200, height: 3200 })).toEqual({
      width: 600,
      height: 1600,
    });
  });

  it("usa los parámetros del plan por defecto", () => {
    expect(MAX_IMAGE_LENGTH).toBe(1600);
    expect(IMAGE_QUALITY).toBe(0.8);
    expect(TARGET_MAX_BYTES).toBe(350 * 1024);
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
  });

  it("objetivo <= 350 KB", () => {
    expect(toKb(350 * 1024)).toBe(350);
    expect(toKb(200 * 1024)).toBeLessThanOrEqual(350);
  });

  it("rechazo de archivos > 25 MB", () => {
    expect(isTooLarge(26 * 1024 * 1024)).toBe(true);
    expect(isTooLarge(24 * 1024 * 1024)).toBe(false);
    expect(isTooLarge(MAX_UPLOAD_BYTES)).toBe(false);
  });

  it("acepta solo JPG, PNG y WebP", () => {
    expect(ACCEPTED_IMAGE_TYPES).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(isAcceptedType("image/jpeg")).toBe(true);
    expect(isAcceptedType("image/png")).toBe(true);
    expect(isAcceptedType("image/webp")).toBe(true);
    expect(isAcceptedType("image/gif")).toBe(false);
    expect(isAcceptedType("application/pdf")).toBe(false);
  });
});
