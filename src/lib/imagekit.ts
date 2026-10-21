/**
 * URLs de ImageKit.
 *
 * El endpoint público ya trae su propio identificador
 * (https://ik.imagekit.io/<id>), así que la imagen se arma como endpoint + fileId.
 * La optimización (ancho, calidad, formato automático) la hace ImageKit, no Vercel:
 * el loader custom de next/image (src/lib/imagekit-loader.ts) evita que la
 * petición de imagen pase por el optimizador de Vercel (plan §6.2).
 */

import { getEnv } from "@/lib/env";

/** Transformations de ImageKit: ancho limitado, calidad 75 y formato automático. */
export function imageKitTransform(width: number, quality = 75): string {
  return `tr=w-${width},q-${quality},f-auto`;
}

/** URL directa de una imagen de ImageKit a partir de su fileId. */
export function imageKitUrl(fileId: string, width?: number): string {
  const { NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT } = getEnv();
  const base = `${NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT.replace(/\/+$/, "")}/${fileId.replace(/^\/+/, "")}`;
  return width ? `${base}?${imageKitTransform(width)}` : base;
}
