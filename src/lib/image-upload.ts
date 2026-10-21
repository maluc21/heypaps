/**
 * Subida de una imagen al DAM de ImageKit (plan §6.2, tareas 3.2 y 3.3).
 *
 * Flujo: comprime en el navegador → pide firma a /api/upload-auth → sube
 * directo a ImageKit → confirma con /api/upload-commit (que suma el peso real
 * a la cuota de la tienda).
 *
 * La clave privada de ImageKit nunca llega al navegador.
 */

import { compressImageFile, isAcceptedType, isTooLarge, toKb } from "@/lib/image";
import { IMAGEKIT_UPLOAD_ENDPOINT } from "@/lib/imagekit";

export type UploadedImage = {
  fileId: string;
  size: number;
};

type AuthResponse = {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
  folder: string;
};

/**
 * Sube una imagen y la contabiliza en la cuota de la tienda.
 * Lanza Error con un mensaje listo para mostrar al usuario.
 */
export async function uploadImage(file: File, storeId: string): Promise<UploadedImage> {
  if (!isAcceptedType(file.type)) {
    throw new Error(`${file.name}: solo se aceptan JPG, PNG o WebP.`);
  }
  if (isTooLarge(file.size)) {
    throw new Error(`${file.name} pesa más de 25 MB.`);
  }

  const compressed = await compressImageFile(file);
  if (compressed.overTarget) {
    console.warn(
      `${file.name} quedó en ${toKb(compressed.blob.size)} KB (el objetivo es 350 KB).`,
    );
  }

  const auth = await requestUploadAuth(storeId);

  const formData = new FormData();
  formData.append("file", compressed.blob, file.name.replace(/\.[^.]+$/, ".jpg"));
  formData.append("fileName", file.name.replace(/\.[^.]+$/, ".jpg"));
  formData.append("publicKey", auth.publicKey);
  formData.append("signature", auth.signature);
  formData.append("expire", String(auth.expire));
  formData.append("token", auth.token);
  formData.append("folder", auth.folder);
  formData.append("useUniqueFileName", "true");

  const uploadRes = await fetch(IMAGEKIT_UPLOAD_ENDPOINT, {
    method: "POST",
    body: formData,
  });
  if (!uploadRes.ok) {
    throw new Error(`No se pudo subir ${file.name}.`);
  }
  const uploaded = (await uploadRes.json()) as { fileId?: string };
  if (!uploaded.fileId) {
    throw new Error(`ImageKit no devolvió el id de ${file.name}.`);
  }

  const commitRes = await fetch("/api/upload-commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storeId, fileId: uploaded.fileId }),
  });
  if (!commitRes.ok) {
    const data = await commitRes.json().catch(() => null);
    throw new Error(data?.error ?? `No se pudo contabilizar ${file.name}.`);
  }
  const committed = (await commitRes.json()) as { size?: number };

  return { fileId: uploaded.fileId, size: committed.size ?? compressed.blob.size };
}

/** Pide al servidor una firma de subida de un solo uso. */
async function requestUploadAuth(storeId: string): Promise<AuthResponse> {
  const res = await fetch("/api/upload-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storeId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "No se pudo autorizar la subida.");
  }
  return (await res.json()) as AuthResponse;
}

/**
 * Borra una imagen del DAM y libera sus bytes. `productId` es opcional: el logo
 * de la tienda no cuelga de ningún producto.
 */
export async function deleteUploadedImage(
  storeId: string,
  fileId: string,
  productId?: string | null,
): Promise<{ freedBytes: number }> {
  const res = await fetch("/api/upload-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storeId, productId: productId ?? null, fileId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "No se pudo borrar la imagen.");
  }
  const data = (await res.json()) as { freedBytes?: number };
  return { freedBytes: data.freedBytes ?? 0 };
}
