/**
 * Client de la API de ImageKit que requiere la clave privada (solo servidor).
 *
 * Nada de esto debe llegar al navegador: la clave privada no se expone nunca.
 * El navegador sube directo a ImageKit con una firma de un solo uso.
 */

import { createHmac, randomUUID } from "node:crypto";
import { getEnv } from "@/lib/env";

const API_BASE = "https://api.imagekit.io";

export type UploadAuthParams = {
  token: string;
  expire: number;
  signature: string;
};

/**
 * Firma de subida: HMAC-SHA1 de `token + expire` con la clave privada.
 * ImageKit exige lowercase hex y `expire` menor a una hora en el futuro.
 */
export function signUpload(token: string, expire: number, privateKey: string): string {
  return createHmac("sha1", privateKey).update(`${token}${expire}`).digest("hex");
}

/** Parámetros de autenticación para una subida desde el navegador. */
export function getUploadAuthParams(
  privateKey: string,
  ttlSeconds = 60,
  token: string = randomUUID(),
): UploadAuthParams {
  const expire = Math.floor(Date.now() / 1000) + ttlSeconds;
  return { token, expire, signature: signUpload(token, expire, privateKey) };
}

/** Basic Auth de ImageKit: usuario = clave privada, contraseña vacía. */
function basicAuth(privateKey: string): string {
  return `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}`;
}

export type ImageKitFileDetails = {
  id: string;
  name: string;
  /** Ruta del archivo dentro del DAM, p.ej. /stores/{storeId}/foto.jpg */
  filePath: string;
  size: number;
  url?: string;
};

async function imageKitRequest(
  path: string,
  init: RequestInit & { privateKey: string },
): Promise<Response> {
  const { privateKey, ...rest } = init;
  return fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      Accept: "application/json",
      Authorization: basicAuth(privateKey),
      ...(rest.headers ?? {}),
    },
    cache: "no-store",
  });
}

/**
 * Metadatos reales del archivo en el DAM. `size` es el peso verdadero del
 * archivo: es lo que se cobra y lo que debe descontarse de la cuota de la
 * tienda (plan §6.2).
 */
export async function getFileDetails(
  fileId: string,
  privateKey: string,
): Promise<ImageKitFileDetails | null> {
  const res = await imageKitRequest(
    `/v1/files/${encodeURIComponent(fileId)}/details`,
    { method: "GET", privateKey },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`ImageKit details falló con HTTP ${res.status}`);
  }
  const data = (await res.json()) as ImageKitFileDetails;
  return { ...data, filePath: data.filePath ?? "" };
}

/** Borra el archivo del DAM (y todas sus versiones). */
export async function deleteFile(fileId: string, privateKey: string): Promise<boolean> {
  const res = await imageKitRequest(`/v1/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    privateKey,
  });
  if (res.status === 404) return false;
  if (!res.ok) {
    throw new Error(`ImageKit delete falló con HTTP ${res.status}`);
  }
  return true;
}

/**
 * Purga la caché del CDN para una URL. Borrar el archivo no purga la caché:
 * sin este paso la imagen seguiría sirviéndose desde el CDN.
 */
export async function purgeCache(url: string, privateKey: string): Promise<boolean> {
  const res = await imageKitRequest("/v1/files/purge", {
    method: "POST",
    privateKey,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    throw new Error(`ImageKit purge falló con HTTP ${res.status}`);
  }
  return true;
}

export type ImageKitFileListItem = {
  fileId: string;
  filePath: string;
  createdAt?: string;
};

/** Lista los archivos de una carpeta del DAM (no recursiva). */
export async function listFiles(
  folderPath: string,
  privateKey: string,
): Promise<ImageKitFileListItem[]> {
  const normalized = folderPath.startsWith("/") ? folderPath : `/${folderPath}`;
  const url = `/v1/files?path=${encodeURIComponent(normalized)}&fileType=file&limit=1000`;
  const res = await imageKitRequest(url, { method: "GET", privateKey });
  if (!res.ok) {
    throw new Error(`ImageKit list falló con HTTP ${res.status}`);
  }
  const data = (await res.json()) as unknown;
  const list = Array.isArray(data)
    ? data
    : (data as { data?: unknown[] })?.data ?? [];
  return (list as Record<string, unknown>[]).map((f) => ({
    fileId: String(f.fileId ?? f.id ?? ""),
    filePath: String(f.filePath ?? f.path ?? ""),
    createdAt: f.createdAt ? String(f.createdAt) : undefined,
  }));
}
/** Clave privada configurada, o null si el proyecto no habilitó subidas. */
export function getPrivateKey(): string | null {
  return getEnv().IMAGEKIT_PRIVATE_KEY ?? null;
}
