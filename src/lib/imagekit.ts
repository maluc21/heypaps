/**
 * URLs y transformaciones de ImageKit (parte pública, sin credenciales).
 *
 * El endpoint público ya trae su propio identificador
 * (https://ik.imagekit.io/<id>), así que la imagen se arma como endpoint + ruta
 * del archivo. OJO: la ruta, no el fileId. ImageKit solo sirve
 * {endpoint}/{filePath}: con carpetas, el fileId es un identificador opaco que
 * no forma parte de la URL y {endpoint}/{fileId} devuelve 404.
 *
 * La optimización (ancho, calidad, formato automático) la hace ImageKit, no Vercel:
 * el loader custom de next/image (src/lib/imagekit-loader.ts) evita que la
 * petición de imagen pase por el optimizador de Vercel (plan §6.2).
 */

import { getEnv } from "@/lib/env";

/** Endpoint de subida de ImageKit: el navegador sube directo, sin pasar por Vercel. */
export const IMAGEKIT_UPLOAD_ENDPOINT = "https://upload.imagekit.io/api/v1/files/upload";

/** Transformations de ImageKit: ancho limitado, calidad 75 y formato automático. */
export function imageKitTransform(width: number, quality = 75): string {
  return `tr=w-${width},q-${quality},f-auto`;
}

/** URL directa de una imagen de ImageKit a partir de su ruta en el DAM. */
export function imageKitUrl(filePath: string, width?: number): string {
  const { NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT } = getEnv();
  const base = `${NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT.replace(/\/+$/, "")}${normalizeFilePath(filePath)}`;
  return width ? `${base}?${imageKitTransform(width)}` : base;
}

/** Normaliza la ruta del DAM: siempre empieza por "/" y sin barra final. */
export function normalizeFilePath(filePath: string): string {
  const limpio = filePath.trim().replace(/\\/g, "/");
  const conBarra = limpio.startsWith("/") ? limpio : `/${limpio}`;
  return conBarra === "/" ? "" : conBarra.replace(/\/+$/, "");
}

/** Carpeta del DAM donde se suben los archivos de una tienda. */
export function imageKitFolder(storeId: string): string {
  return `stores/${storeId}`;
}

/** Prefijo de ruta que debe tener un archivo para pertenecer a una tienda. */
export function imageKitStorePrefix(storeId: string): string {
  return `/${imageKitFolder(storeId)}/`;
}
