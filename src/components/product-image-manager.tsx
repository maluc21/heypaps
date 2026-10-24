"use client";

/**
 * Subida y borrado de imágenes del producto (plan §6.2, tareas 3.1, 3.2 y 3.3).
 *
 * La lógica de subida vive en src/lib/image-upload.ts; este componente solo
 * maneja la lista de imágenes y el estado de la interfaz.
 */

import { useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { deleteUploadedImage, uploadImage } from "@/lib/image-upload";

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
        setProgress(`Subiendo ${file.name}…`);
        const result = await uploadImage(file, storeId);
        uploaded.push(result.filePath);
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

  const handleRemove = async (filePath: string) => {
    setBusy(true);
    try {
      await deleteUploadedImage(storeId, filePath, productId);
      onChange(images.filter((id) => id !== filePath));
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
          {images.map((filePath) => (
            <li
              key={filePath}
              className="relative aspect-square overflow-hidden rounded-lg border border-border"
            >
              <Image
                src={filePath}
                alt=""
                fill
                sizes="120px"
                className="object-cover"
              />
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => handleRemove(filePath)}
                className="absolute right-1 top-1 h-7 px-2 text-xs bg-white text-red-600 hover:bg-white/90"
              >
                Quitar
              </Button>
            </li>
          ))}
          {slotsLeft > 0 ? (
            <li
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              className="relative aspect-square overflow-hidden rounded-lg border border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-muted/50"
            >
              <span className="text-2xl text-muted-foreground">+</span>
            </li>
          ) : null}
        </ul>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className="relative aspect-square w-full max-w-[200px] overflow-hidden rounded-lg border border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-muted/50"
        >
          <span className="text-3xl text-muted-foreground">+</span>
        </div>
      )}

      <input
        ref={inputRef}
        id="product-images"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={busy || slotsLeft === 0}
        onChange={(e) => void handleFiles(e.target.files)}
        className="hidden"
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
