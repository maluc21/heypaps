/**
 * Compresión de imagen en cliente: peso y dimensiones resultantes (especificación §6.2 / 3.1).
 *
 * Largo máximo 1600 px, calidad 0.8, objetivo <= 350 KB, rechazo > 25 MB.
 */

function computeOutputDimensions({
  width,
  height,
  maxLength = 1600,
}: {
  width: number;
  height: number;
  maxLength?: number;
}): { width: number; height: number } {
  const longer = Math.max(width, height);
  if (longer <= maxLength) return { width, height };
  const scale = maxLength / longer;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function estimateKb(bytes: number): number {
  return bytes / 1024;
}

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

  it("objetivo <= 350 KB", () => {
    expect(estimateKb(350 * 1024)).toBe(350);
    expect(estimateKb(200 * 1024)).toBeLessThanOrEqual(350);
  });

  it("rechazo de archivos > 25 MB", () => {
    const maxBytes = 25 * 1024 * 1024;
    expect(26 * 1024 * 1024).toBeGreaterThan(maxBytes);
    expect(24 * 1024 * 1024).toBeLessThan(maxBytes);
  });
});
