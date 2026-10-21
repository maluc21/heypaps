"use client";

/**
 * Etiquetas del catálogo (plan §2.5): "Nuevo", "Oferta", "Últimas unidades".
 * Cada producto lleva como máximo una. El color se usa en la card del
 * catálogo público.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  createTag,
  deleteTag,
  updateTag,
} from "@/lib/actions/tag";
import { TAG_COLORS } from "@/lib/tags";

export type EditableTag = {
  id: string;
  name: string;
  color: string | null;
  position: number;
};

type Props = {
  storeId: string;
  tags: EditableTag[];
};

export function TagManager({ storeId, tags }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(TAG_COLORS[0]);
  const [busy, setBusy] = useState(false);

  const sorted = [...tags].sort((a, b) => a.position - b.position);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("El nombre de la etiqueta es obligatorio.");
      return;
    }
    setBusy(true);
    const res = await createTag(storeId, name.trim(), color);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setName("");
    toast.success("Etiqueta creada.");
    router.refresh();
  };

  const handleColor = async (tag: EditableTag, next: string | null) => {
    const res = await updateTag(tag.id, { color: next });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    router.refresh();
  };

  const handleMove = async (id: string, direction: -1 | 1) => {
    const index = sorted.findIndex((t) => t.id === id);
    const target = sorted[index + direction];
    if (!target) return;

    setBusy(true);
    const [a, b] = await Promise.all([
      updateTag(id, { position: target.position }),
      updateTag(target.id, { position: sorted[index].position }),
    ]);
    setBusy(false);
    if (a.error || b.error) {
      toast.error(a.error ?? b.error ?? "No se pudo reordenar.");
      return;
    }
    router.refresh();
  };

  const handleDelete = async (tag: EditableTag) => {
    if (!window.confirm(`¿Eliminar la etiqueta "${tag.name}"? Los productos quedan sin ella.`)) {
      return;
    }
    setBusy(true);
    const res = await deleteTag(tag.id);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Etiqueta eliminada.");
    router.refresh();
  };

  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Etiquetas</h2>
        <Badge variant="outline">{tags.length}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Sirven para distinguir productos: “Nuevo”, “Oferta”, “Últimas unidades”. Cada
        producto lleva una sola etiqueta.
      </p>

      <div className="space-y-3 rounded-xl border border-border p-3">
        <Input
          id="new-tag"
          value={name}
          placeholder="Nombre de la etiqueta"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
        />
        <ColorPicker color={color} onChange={setColor} />
        <Button
          onClick={handleCreate}
          disabled={busy || name.trim().length === 0}
          className="w-full"
        >
          Crear etiqueta
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Todavía no tienes etiquetas.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((tag, index) => (
            <li
              key={tag.id}
              className="flex items-center gap-2 rounded-lg border border-border p-3"
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color ?? "#d4d4d8" }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {tag.name}
              </span>

              <label className="flex items-center gap-1">
                <span className="sr-only">Color de {tag.name}</span>
                <input
                  type="color"
                  value={tag.color ?? "#d4d4d8"}
                  disabled={busy}
                  onChange={(e) => void handleColor(tag, e.target.value)}
                  className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0"
                />
              </label>
              {tag.color ? (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy}
                  onClick={() => void handleColor(tag, null)}
                  aria-label={`Quitar color de ${tag.name}`}
                >
                  Sin color
                </Button>
              ) : null}

              <div className="flex flex-col">
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy || index === 0}
                  onClick={() => void handleMove(tag.id, -1)}
                  aria-label={`Subir ${tag.name}`}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy || index === sorted.length - 1}
                  onClick={() => void handleMove(tag.id, 1)}
                  aria-label={`Bajar ${tag.name}`}
                >
                  ↓
                </Button>
              </div>

              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void handleDelete(tag)}
                aria-label={`Eliminar ${tag.name}`}
              >
                Eliminar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Paleta de colores: el que se elige se marca con un borde. */
function ColorPicker({
  color,
  onChange,
}: {
  color: string | null;
  onChange: (color: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Color:</span>
      {TAG_COLORS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-label={`Color ${option}`}
          aria-pressed={color === option}
          className={`h-6 w-6 rounded-full border-2 ${
            color === option ? "border-foreground" : "border-transparent"
          }`}
          style={{ backgroundColor: option }}
        />
      ))}
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={color === null}
        className={`rounded-full border px-2 py-0.5 text-xs ${
          color === null ? "border-foreground" : "border-border"
        }`}
      >
        Sin color
      </button>
    </div>
  );
}
