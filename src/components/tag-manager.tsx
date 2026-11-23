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
import { ArrowDown, ArrowUp, Check, Edit, Trash2, X } from "lucide-react";
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
  const [openColorId, setOpenColorId] = useState<string | null>(null);

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
    <div className="space-y-4 pb-24">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Etiquetas</h2>
          <Badge variant="outline">{tags.length}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Ej. “Nuevo”, “Promoción”, “Últimos”, etc.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-[#efefeb] bg-white p-3">
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
          size="sm"
          className="h-11 w-full lg:h-9"
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
        <ul className="space-y-2">
          {sorted.map((tag, index) => {
            const isEditing = editingId === tag.id;

            return (
              <li
                key={tag.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-[#efefeb] bg-white p-2"
              >
                <div
                  className={`flex min-w-0 items-center gap-2 ${
                    isEditing ? "col-span-2 row-start-1" : "col-start-1 row-start-1"
                  }`}
                >
                  {isEditing ? (
                    <>
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
                        className="min-w-0 flex-1"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="bg-white text-green-700 hover:bg-green-50 hover:text-green-800"
                        disabled={busy || editingName.trim().length < 2}
                        onClick={() => void handleRename(tag)}
                        aria-label={`Guardar nombre de ${tag.name}`}
                        title="Guardar"
                      >
                        <Check className="size-5" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="bg-white"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                        aria-label={`Cancelar edición de ${tag.name}`}
                        title="Cancelar"
                      >
                        <X className="size-5" aria-hidden="true" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color ?? "#d4d4d8" }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-base font-semibold">
                        {tag.name}
                      </span>
                    </>
                  )}
                </div>

                <div
                  className={`flex items-center gap-2 ${
                    isEditing
                      ? "col-start-2 row-start-2 flex-col"
                      : "col-start-2 row-start-1 row-span-2 flex-col"
                  }`}
                >
                  {!isEditing ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-12 gap-1.5 px-2 text-sm"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(tag.id);
                        setEditingName(tag.name);
                      }}
                      aria-label={`Editar nombre de ${tag.name}`}
                    >
                      <Edit className="size-6" aria-hidden="true" />
                      Editar
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="bg-white text-foreground hover:bg-muted hover:text-foreground"
                    disabled={busy}
                    onClick={() => void handleDelete(tag)}
                    aria-label={`Eliminar ${tag.name}`}
                    title={`Eliminar ${tag.name}`}
                  >
                    <Trash2 className="size-5" aria-hidden="true" />
                  </Button>
                </div>

                <div className="col-start-1 row-start-2 flex min-h-11 min-w-0 flex-nowrap items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy || index === 0}
                    onClick={() => void handleMove(tag.id, -1)}
                    aria-label={`Subir ${tag.name}`}
                    title="Subir"
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy || index === sorted.length - 1}
                    onClick={() => void handleMove(tag.id, 1)}
                    aria-label={`Bajar ${tag.name}`}
                    title="Bajar"
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </Button>
                  <div
                    className="relative shrink-0"
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) {
                        setOpenColorId(null);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setOpenColorId(null);
                    }}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="bg-white"
                      disabled={busy}
                      aria-label={`Color de ${tag.name}`}
                      aria-expanded={openColorId === tag.id}
                      onClick={() =>
                        setOpenColorId((current) => current === tag.id ? null : tag.id)
                      }
                    >
                      <span
                        className="size-6 rounded-full border border-border"
                        style={{ backgroundColor: tag.color ?? "#d4d4d8" }}
                        aria-hidden="true"
                      />
                    </Button>
                    {openColorId === tag.id ? (
                      <div className="absolute bottom-full left-0 z-50 mb-1 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-[#efefeb] bg-white p-2 shadow-lg">
                        <ColorPicker
                          color={tag.color}
                          onChange={(next) => {
                            void handleColor(tag, next);
                            setOpenColorId(null);
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
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
    <div className="flex w-full flex-nowrap items-center gap-1 overflow-x-auto">
      <span className="text-xs text-muted-foreground">Color:</span>
      {TAG_COLORS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-label={`Color ${option}`}
          title={option}
          aria-pressed={color === option}
          className={`grid size-11 shrink-0 place-items-center rounded-full border-2 ${
            color === option ? "border-foreground" : "border-transparent"
          }`}
        >
          <span
            className="size-6 rounded-full"
            style={{ backgroundColor: option }}
            aria-hidden="true"
          />
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={color === null}
        className={`min-h-11 shrink-0 rounded-full border px-3 py-1 text-xs ${
          color === null ? "border-foreground" : "border-border"
        }`}
      >
        Sin color
      </button>
    </div>
  );
}
