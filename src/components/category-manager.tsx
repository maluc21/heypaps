"use client";

/**
 * Categorías del catálogo (plan §2.4): crear, renombrar, ocultar, reordenar y
 * eliminar. Las categorías alimentan los chips del catálogo público.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowDown, ArrowUp, Check, Pencil, Trash2, X } from "lucide-react";
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/lib/actions/category";
import { normalizeSlug } from "@/lib/utils";

export type Category = {
  id: string;
  name: string;
  slug: string;
  position: number;
  active: boolean;
};

type Props = {
  storeId: string;
  categories: Category[];
};

export function CategoryManager({ storeId, categories }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // La lista viene del servidor: tras cada cambio, router.refresh() trae los
  // datos frescos. Mantener una copia en estado la desincronizaba.
  const sorted = [...categories].sort((a, b) => a.position - b.position);

  const handleCreate = async () => {
    if (name.trim().length < 2) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    setBusy(true);
    const res = await createCategory(storeId, name.trim(), normalizeSlug(name));
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setName("");
    toast.success("Categoría creada.");
    router.refresh();
  };

  const handleRename = async (id: string, nextName: string) => {
    const trimmedName = nextName.trim();
    if (trimmedName.length < 2) {
      toast.error("El nombre debe tener al menos 2 caracteres.");
      return;
    }
    setBusy(true);
    try {
      const res = await updateCategory(id, { name: trimmedName });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setEditingId(null);
      toast.success("Nombre de categoría actualizado.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    const res = await updateCategory(id, { active });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    router.refresh();
  };

  const handleMove = async (id: string, direction: -1 | 1) => {
    const index = sorted.findIndex((c) => c.id === id);
    const target = sorted[index + direction];
    if (!target) return;

    setBusy(true);
    const [a, b] = await Promise.all([
      updateCategory(id, { position: target.position }),
      updateCategory(target.id, { position: sorted[index].position }),
    ]);
    setBusy(false);
    if (a.error || b.error) {
      toast.error(a.error ?? b.error ?? "No se pudo reordenar.");
      return;
    }
    router.refresh();
  };

  const handleDelete = async (id: string, categoryName: string) => {
    if (!window.confirm(`¿Eliminar "${categoryName}"? Los productos quedan sin categoría.`)) {
      return;
    }
    setBusy(true);
    const res = await deleteCategory(id);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Categoría eliminada.");
    router.refresh();
  };

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Categorías</h2>
        <Badge variant="outline">{categories.length}</Badge>
      </div>

      <div className="flex min-w-0 gap-2">
        <Input
          id="new-category"
          value={name}
          placeholder="Nueva categoría"
          aria-label="Nombre de la nueva categoría"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
        />
        <Button onClick={handleCreate} disabled={busy || name.trim().length < 2}>
          Crear
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Todavía no tienes categorías. Agrégalas para organizar tu catálogo.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((category, index) => (
            <li
              key={category.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border p-2"
            >
              <div
                className={`flex min-w-0 items-center gap-1 ${
                  editingId === category.id ? "col-span-2" : "col-start-1 row-start-1"
                }`}
              >
                {editingId === category.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleRename(category.id, editingName);
                        }
                        if (event.key === "Escape") setEditingId(null);
                      }}
                      aria-label={`Nuevo nombre para ${category.name}`}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="bg-white text-green-700 hover:bg-green-50 hover:text-green-800"
                      disabled={busy || editingName.trim().length < 2}
                      onClick={() => void handleRename(category.id, editingName)}
                      aria-label={`Guardar nombre de ${category.name}`}
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
                      aria-label={`Cancelar edición de ${category.name}`}
                      title="Cancelar"
                    >
                      <X className="size-5" aria-hidden="true" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-base font-semibold">
                      {category.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11 shrink-0 gap-1 px-2 text-sm"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(category.id);
                        setEditingName(category.name);
                      }}
                      aria-label={`Editar nombre de ${category.name}`}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      Editar
                    </Button>
                  </>
                )}
              </div>

              <div
                className={`flex items-center gap-2 ${
                  editingId === category.id ? "col-start-2 row-start-2" : "col-start-2 row-start-1"
                }`}
              >
                <Switch
                  checked={category.active}
                  onCheckedChange={(checked) => void handleToggle(category.id, checked)}
                  aria-label={`Mostrar ${category.name}`}
                />
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="bg-white text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={busy}
                  onClick={() => void handleDelete(category.id, category.name)}
                  aria-label={`Eliminar ${category.name}`}
                  title={`Eliminar ${category.name}`}
                >
                  <Trash2 className="size-5" aria-hidden="true" />
                </Button>
              </div>

              <div className="col-start-1 row-start-2 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={busy || index === 0}
                  onClick={() => void handleMove(category.id, -1)}
                  aria-label={`Subir ${category.name}`}
                  title="Subir"
                >
                  <ArrowUp className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={busy || index === sorted.length - 1}
                  onClick={() => void handleMove(category.id, 1)}
                  aria-label={`Bajar ${category.name}`}
                  title="Bajar"
                >
                  <ArrowDown className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
