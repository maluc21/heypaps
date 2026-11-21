"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type InventoryMode = "none" | "global" | "variants";
type EnabledInventoryMode = Exclude<InventoryMode, "none">;

const options: Array<{
  value: EnabledInventoryMode;
  title: string;
  description: string;
}> = [
  {
    value: "global",
    title: "Con inventario global",
    description: "Una cantidad compartida para todo el producto.",
  },
  {
    value: "variants",
    title: "Inventario por variantes",
    description: "Cada variante puede tener su propia cantidad.",
  },
];

export function InventoryModeOptions({
  idPrefix,
  value,
  onChange,
  variantDescription,
  children,
}: {
  idPrefix: string;
  value: InventoryMode;
  onChange: (mode: InventoryMode) => void;
  variantDescription?: string;
  children?: ReactNode;
}) {
  const enabled = value !== "none";
  const switchId = `${idPrefix}-enabled`;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex items-center gap-2">
        <Switch
          id={switchId}
          checked={enabled}
          onCheckedChange={(checked) =>
            onChange(checked ? (enabled ? value : "global") : "none")
          }
        />
        <Label htmlFor={switchId}>{enabled ? "Con Inventario" : "Sin Inventario"}</Label>
      </div>
      {enabled ? (
        <div className="space-y-3">
          <fieldset className="space-y-2">
            <legend className="sr-only">Tipo de inventario</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {options.map((option) => {
                const id = `${idPrefix}-${option.value}`;
                return (
                  <label key={option.value} htmlFor={id} className="min-w-0 cursor-pointer">
                    <input
                      id={id}
                      type="radio"
                      name={`${idPrefix}-mode`}
                      checked={value === option.value}
                      onChange={() => onChange(option.value)}
                      className="peer sr-only"
                    />
                    <span className="block h-full rounded-xl border border-border bg-background p-3 transition-colors peer-checked:border-primary peer-checked:bg-primary/10 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2">
                      <span className="block text-sm font-semibold leading-tight">
                        {option.title}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {option.value === "variants" && variantDescription
                          ? variantDescription
                          : option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {children}
        </div>
      ) : null}
    </div>
  );
}
