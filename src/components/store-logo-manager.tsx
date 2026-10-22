"use client";

/**
 * Logo de la tienda (plan §2.6). Una sola imagen, opcional: sin logo el
 * catálogo público muestra las iniciales de la tienda.
 */

import { useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteUploadedImage, uploadImage } from "@/lib/image-upload";

type Props = {
  storeId: string;
  logo: string | null;
  storeName: string;
  onChange: (logo: string | null) => void;
};

export function StoreLogoManager({ storeId, logo, storeName, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const initials = storeName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    setBusy(true);
    try {
      // El logo anterior se borra del DAM para no dejar archivos huerfanos
      // siguenusercontent contando en la cuota.
      if (logo) {
        await deleteUploadedImage(storeId, logo).catch(() => undefined);
      }
      const uploaded = await uploadImage(file, storeId);
      onChange(uploaded.filePath);
      toast.success("Logo actualizado.");
    } catch (err) {
      toast.error(String((err as Error)?.message ?? "No se pudo subir el logo."));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!logo) return;
    setBusy(true);
    try {
      await deleteUploadedImage(storeId, logo);
      onChange(null);
      toast.success("Logo quitado.");
    } catch (err) {
      toast.error(String((err as Error)?.message ?? "No se pudo quitar el logo."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
          {logo ? (
            <Image src={logo} alt="" fill sizes="64px" className="object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
              {initials || "?"}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            id="store-logo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => void handleFile(e.target.files)}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
          />
          {logo ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={handleRemove}
              className="self-start text-xs"
            >
              Quitar logo
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
