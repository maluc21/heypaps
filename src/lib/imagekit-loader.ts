/**
 * Loader custom de ImageKit para next/image (plan §6.2, tarea 3.5).
 *
 * Con `images.loader = "custom"` Next no toca los bytes: solo pide la URL
 * transformada a ImageKit. Así el cómputo de Vercel no se cobra y el original
 * nunca pasa por el servidor.
 */

import type { ImageLoaderProps } from "next/image";

/**
 * Loader custom de ImageKit para next/image (plan §6.2, tarea 3.5).
 *
 * Con `images.loader = "custom"` Next no toca los bytes: solo pide la URL
 * transformada a ImageKit. Así el cómputo de Vercel no se cobra y el original
 * nunca pasa por el servidor.
 *
 * El `src` es la RUTA del archivo en el DAM (no el fileId): ImageKit solo
 * sirve {endpoint}/{filePath}.
 */
export default function imagekitLoader({
  src,
  width,
  quality,
}: ImageLoaderProps): string {
  const endpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT?.replace(/\/+$/, "");
  if (!endpoint) {
    throw new Error("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT no está definida");
  }
  const path = src.startsWith("/") ? src : `/${src}`;
  const params = [`tr=w-${width}`, `q-${quality ?? 75}`, "f-auto"];
  return `${endpoint}${path}?${params.join(",")}`;
}
