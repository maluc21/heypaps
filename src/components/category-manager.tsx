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
    const res = await updateCategory(id, { name: nextName });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    router.refresh();
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
    <div className="space-y-4 p-4 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Categorías</h2>
        <Badge variant="outline">{categories.length}</Badge>
      </div>

      <div className="flex gap-2">
        <Input
          id="new-category"
          value={name}
          placeholder="Nueva categoría"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
        />
        <Button onClick={handleCreate} disabled={busy || name.trim().length < 2}>
          Crear
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        El identificador se genera del nombre: “Zapatos de cuero” → “zapatos-de-cuero”.
      </p>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Todavía no tienes categorías. Agrégalas para organizar tu catálogo.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((category, index) => (
            <li
              key={category.id}
              className="flex items-center gap-2 rounded-lg border border-border p-2"
            >
              <div className="min-w-0 flex-1">
                <input
                  defaultValue={category.name}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next && next !== category.name) {
                      void handleRename(category.id, next);
                    }
                  }}
                  className="w-full truncate bg-transparent text-sm outline-none"
                  aria-label={`Nombre de ${category.name}`}
                />
                <p className="truncate text-xs text-muted-foreground">/{category.slug}</p>
              </div>

              <Switch
                checked={category.active}
                onCheckedChange={(checked) => void handleToggle(category.id, checked)}
                aria-label={`Mostrar ${category.name}`}
              />

              <div className="flex flex-col">
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy || index === 0}
                  onClick={() => void handleMove(category.id, -1)}
                  aria-label={`Subir ${category.name}`}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy || index === sorted.length - 1}
                  onClick={() => void handleMove(category.id, 1)}
                  aria-label={`Bajar ${category.name}`}
                >
                  ↓
                </Button>
              </div>

              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void handleDelete(category.id, category.name)}
                aria-label={`Eliminar ${category.name}`}
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
