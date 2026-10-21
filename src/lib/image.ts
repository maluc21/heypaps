/**
 * Compresión de imágenes en el cliente (plan §6.2, tarea 3.1).
 *
 * Sin esto, los 3 GB del DAM se agotan en ~250 productos en vez de ~2.100.
 * El navegador recorta a 1600 px del lado más largo, exporta a JPEG con calidad
 * 0.8 y baja la calidad en pasos hasta acercarse al objetivo de 350 KB.
 *
 * La orientación EXIF la aplica createImageBitmap con imageOrientation
 * "from-image", que es el valor por defecto: las fotos de móvil no salen
 * giradas.
 */

/** Largo máximo del lado más largo, en píxeles. */
export const MAX_IMAGE_LENGTH = 1600;

/** Calidad inicial de la exportación JPEG. */
export const IMAGE_QUALITY = 0.8;

/** Objetivo de peso por imagen. */
export const TARGET_MAX_BYTES = 350 * 1024;

/** Peso máximo aceptado de un archivo original. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Tipos de imagen aceptados. */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Dimensiones de salida conservando la proporción.
 * Función pura: sin DOM, testeable.
 */
export function computeOutputDimensions({
  width,
  height,
  maxLength = MAX_IMAGE_LENGTH,
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

/** El archivo supera el límite de ImageKit (25 MB). */
export function isTooLarge(bytes: number, maxBytes = MAX_UPLOAD_BYTES): boolean {
  return bytes > maxBytes;
}

/** El tipo de archivo no es una imagen aceptada. */
export function isAcceptedType(type: string): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(type);
}

/** Tamaño en KB, para mensajes al usuario. */
export function toKb(bytes: number): number {
  return Math.round(bytes / 1024);
}

export type CompressResult = {
  blob: Blob;
  width: number;
  height: number;
  /** true si seExportó en JPEG (el canvas no conserva PNG ni WebP). */
  converted: boolean;
};

/**
 * Comprime una imagen. Recorta y exporta a JPEG; si el resultado sigue por
 * encima del objetivo, reduce la calidad en pasos (mínimo 0.5) y vuelve a
 * medir. Si aun así no llega, devuelve el mejor resultado y avisa con
 * `overTarget`.
 */
export async function compressImageFile(
  file: File,
  options: {
    maxLength?: number;
    quality?: number;
    targetBytes?: number;
  } = {},
): Promise<CompressResult & { overTarget: boolean }> {
  const maxLength = options.maxLength ?? MAX_IMAGE_LENGTH;
  const quality = options.quality ?? IMAGE_QUALITY;
  const targetBytes = options.targetBytes ?? TARGET_MAX_BYTES;

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = computeOutputDimensions({
    width: bitmap.width,
    height: bitmap.height,
    maxLength,
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("El navegador no pudo crear el contexto 2D para comprimir la imagen.");
  }
  // Fondo blanco: al exportar a JPEG, un PNG con transparencia quedaría negro.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let blob = await canvasToBlob(canvas, quality);
  let currentQuality = quality;

  while (blob.size > targetBytes && currentQuality > 0.5) {
    currentQuality = Math.max(0.5, currentQuality - 0.1);
    blob = await canvasToBlob(canvas, currentQuality);
  }

  return {
    blob,
    width,
    height,
    converted: file.type !== "image/jpeg",
    overTarget: blob.size > targetBytes,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("El navegador no pudo exportar la imagen."));
      },
      "image/jpeg",
      quality,
    );
  });
}
