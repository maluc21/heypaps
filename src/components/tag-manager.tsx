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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, CircleOff, Edit, Trash2, X } from "lucide-react";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [colorPickerTarget, setColorPickerTarget] = useState<string | null>();

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

  const chooseColor = async (next: string | null) => {
    const target = colorPickerTarget;
    setColorPickerTarget(undefined);
    if (target === null) {
      setColor(next);
      return;
    }
    const tag = tags.find((item) => item.id === target);
    if (tag) await handleColor(tag, next);
  };

  const handleRename = async (tag: EditableTag) => {
    const nextName = editingName.trim();
    if (nextName.length < 2) {
      toast.error("El nombre debe tener al menos 2 caracteres.");
      return;
    }

    setBusy(true);
    try {
      const res = await updateTag(tag.id, { name: nextName });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setEditingId(null);
      toast.success("Nombre de etiqueta actualizado.");
      router.refresh();
    } finally {
      setBusy(false);
    }
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

  const activeColorTag =
    colorPickerTarget != null
      ? tags.find((tag) => tag.id === colorPickerTarget)
      : undefined;

  return (
    <div className="space-y-3 pb-24">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Etiquetas</h2>
          <Badge variant="outline">{tags.length}</Badge>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 lg:flex lg:items-center">
        <Input
          id="new-tag"
          className="min-w-0 lg:flex-1"
          value={name}
          placeholder="Ej. Nuevo, Oferta"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
        />
        <div className="col-start-2 row-start-1 flex size-11 shrink-0 items-center justify-center rounded-md border border-[#efefeb] bg-white">
          <ColorSelector
            color={color}
            label="Elegir color de la nueva etiqueta"
            onClick={() => setColorPickerTarget(null)}
          />
        </div>
        <Button
          size="sm"
          className="col-span-2 row-start-2 h-11 w-full shrink-0 lg:col-span-1 lg:row-auto lg:h-11 lg:w-40"
          onClick={handleCreate}
          disabled={busy || name.trim().length === 0}
        >
          Crear etiqueta
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#efefeb] p-6 text-center text-sm text-muted-foreground">
          Todavía no tienes etiquetas.
        </p>
      ) : (
        <ul className="space-y-1">
          {sorted.map((tag) => {
            const isEditing = editingId === tag.id;

            return (
              <li
                key={tag.id}
                className="flex min-w-0 items-center gap-1.5 rounded-lg border border-[#efefeb] bg-white p-1.5"
              >
                <ColorSelector
                  color={tag.color}
                  label={`Cambiar color de ${tag.name}`}
                  onClick={() => setColorPickerTarget(tag.id)}
                />

                {isEditing ? (
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleRename(tag);
                      }
                      if (event.key === "Escape") setEditingId(null);
                    }}
                    aria-label={`Nuevo nombre para ${tag.name}`}
                    className="h-10 min-w-0 flex-1"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-base font-semibold">
                    {tag.name}
                  </span>
                )}

                {isEditing ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-10 shrink-0 text-green-700 hover:bg-green-50 hover:text-green-800"
                      disabled={busy || editingName.trim().length < 2}
                      onClick={() => void handleRename(tag)}
                      aria-label={`Guardar nombre de ${tag.name}`}
                      title="Guardar"
                    >
                      <Check className="size-5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-10 shrink-0"
                      disabled={busy}
                      onClick={() => setEditingId(null)}
                      aria-label={`Cancelar edición de ${tag.name}`}
                      title="Cancelar"
                    >
                      <X className="size-5" aria-hidden="true" />
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 shrink-0 gap-1 px-2 text-sm"
                    disabled={busy}
                    onClick={() => {
                      setEditingId(tag.id);
                      setEditingName(tag.name);
                    }}
                    aria-label={`Editar nombre de ${tag.name}`}
                  >
                    <Edit className="size-4" aria-hidden="true" />
                    Editar
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 shrink-0 text-foreground hover:bg-muted hover:text-foreground"
                  disabled={busy}
                  onClick={() => void handleDelete(tag)}
                  aria-label={`Eliminar ${tag.name}`}
                  title={`Eliminar ${tag.name}`}
                >
                  <Trash2 className="size-5" aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={colorPickerTarget !== undefined}
        onOpenChange={(open) => {
          if (!open) setColorPickerTarget(undefined);
        }}
      >
        <DialogContent className="aspect-square w-[min(20rem,calc(100vw-2rem))] max-w-none content-start">
          <div className="space-y-1">
            <DialogTitle>Seleccionar color</DialogTitle>
            <DialogDescription>
              {colorPickerTarget === null
                ? "Elige el color de la nueva etiqueta."
                : `Elige el color de ${activeColorTag?.name ?? "la etiqueta"}.`}
            </DialogDescription>
          </div>
          <div className="grid grid-cols-3 justify-items-center gap-3">
            {TAG_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => void chooseColor(option)}
                aria-label={`Color ${option}`}
                aria-pressed={
                  colorPickerTarget === null
                    ? color === option
                    : activeColorTag?.color === option
                }
                className="grid size-14 place-items-center rounded-full border-2 border-transparent transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-foreground"
              >
                <span
                  className="size-9 rounded-full"
                  style={{ backgroundColor: option }}
                  aria-hidden="true"
                />
              </button>
            ))}
            <button
              type="button"
              onClick={() => void chooseColor(null)}
              aria-label="Sin color"
              aria-pressed={
                colorPickerTarget === null ? color === null : activeColorTag?.color === null
              }
              className="grid size-14 place-items-center rounded-full border-2 border-transparent text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-foreground"
            >
              <CircleOff className="size-8" aria-hidden="true" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ColorSelector({
  color,
  label,
  onClick,
}: {
  color: string | null;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-10 shrink-0 rounded-full p-0"
      aria-label={label}
      onClick={onClick}
    >
      <span
        className="grid size-7 place-items-center rounded-full border border-border"
        style={color ? { backgroundColor: color } : undefined}
        aria-hidden="true"
      >
        {color === null ? <CircleOff className="size-4 text-muted-foreground" /> : null}
      </span>
    </Button>
  );
}
