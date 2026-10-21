"use client";

/**
 * Subida y borrado de imágenes del producto (plan §6.2, tareas 3.1, 3.2 y 3.3).
 *
 * Flujo: comprime en el navegador → pide firma a /api/upload-auth → sube
 * directo a ImageKit → confirma con /api/upload-commit (que suma el peso real
 * a la cuota de la tienda).
 *
 * La clave privada de ImageKit nunca llega al navegador.
 */

import { useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  compressImageFile,
  isAcceptedType,
  isTooLarge,
  toKb,
} from "@/lib/image";
import { IMAGEKIT_UPLOAD_ENDPOINT } from "@/lib/imagekit";

type AuthResponse = {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
  folder: string;
};

type Props = {
  storeId: string;
  productId: string;
  images: string[];
  maxImages: number;
  onChange: (images: string[]) => void;
};

export function ProductImageManager({
  storeId,
  productId,
  images,
  maxImages,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const slotsLeft = Math.max(0, maxImages - images.length);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);

    if (list.length > slotsLeft) {
      toast.error(`Tu plan permite ${maxImages} imágenes por producto.`);
      return;
    }

    setBusy(true);
    const uploaded: string[] = [];

    try {
      for (const file of list) {
        if (!isAcceptedType(file.type)) {
          toast.error(`${file.name}: solo JPG, PNG o WebP.`);
          continue;
        }
        if (isTooLarge(file.size)) {
          toast.error(`${file.name} pesa más de 25 MB.`);
          continue;
        }

        setProgress(`Comprimiendo ${file.name}…`);
        const compressed = await compressImageFile(file);
        if (compressed.overTarget) {
          toast.warning(
            `${file.name} quedó en ${toKb(compressed.blob.size)} KB (el objetivo es 350 KB).`,
          );
        }

        setProgress(`Subiendo ${file.name}…`);
        const authRes = await fetch("/api/upload-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId }),
        });
        if (!authRes.ok) {
          const data = await authRes.json().catch(() => null);
          throw new Error(data?.error ?? "No se pudo autorizar la subida.");
        }
        const auth = (await authRes.json()) as AuthResponse;

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
        const uploadedFile = (await uploadRes.json()) as { fileId?: string };
        if (!uploadedFile.fileId) {
          throw new Error(`ImageKit no devolvió el id de ${file.name}.`);
        }

        setProgress(`Registrando ${file.name}…`);
        const commitRes = await fetch("/api/upload-commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId, fileId: uploadedFile.fileId }),
        });
        if (!commitRes.ok) {
          const data = await commitRes.json().catch(() => null);
          throw new Error(data?.error ?? `No se pudo contabilizar ${file.name}.`);
        }

        uploaded.push(uploadedFile.fileId);
      }

      if (uploaded.length > 0) {
        onChange([...images, ...uploaded]);
        toast.success(`${uploaded.length} imagen(es) subida(s).`);
      }
    } catch (err) {
      toast.error(String((err as Error)?.message ?? "Falló la subida."));
    } finally {
      setBusy(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async (fileId: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/upload-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, productId, fileId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "No se pudo borrar la imagen.");
      }
      onChange(images.filter((id) => id !== fileId));
      toast.success("Imagen borrada.");
    } catch (err) {
      toast.error(String((err as Error)?.message ?? "No se pudo borrar la imagen."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">Imágenes</p>
        <Badge variant="outline">
          {images.length}/{maxImages}
        </Badge>
      </div>

      {images.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {images.map((fileId) => (
            <li
              key={fileId}
              className="relative aspect-square overflow-hidden rounded-lg border border-border"
            >
              <Image
                src={fileId}
                alt=""
                fill
                sizes="120px"
                className="object-cover"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => handleRemove(fileId)}
                className="absolute right-1 top-1 h-7 px-2 text-xs"
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Sin imágenes. Se muestra un marcador con las iniciales del producto.
        </p>
      )}

      <input
        ref={inputRef}
        id="product-images"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={busy || slotsLeft === 0}
        onChange={(e) => void handleFiles(e.target.files)}
        className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
      />

      {progress ? (
        <p className="text-xs text-muted-foreground">{progress}</p>
      ) : null}
      {slotsLeft === 0 && images.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Llegaste al máximo de imágenes de tu plan.
        </p>
      ) : null}
    </div>
  );
}
