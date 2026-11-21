"use client";

export type InventoryMode = "none" | "global" | "variants";

const options: Array<{
  value: InventoryMode;
  title: string;
  description: string;
}> = [
  {
    value: "none",
    title: "Sin inventario",
    description: "No llevar control de unidades disponibles.",
  },
  {
    value: "global",
    title: "Con inventario global",
    description: "Una cantidad para todo el producto, sin variantes.",
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
}: {
  idPrefix: string;
  value: InventoryMode;
  onChange: (mode: InventoryMode) => void;
  variantDescription?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Gestión de inventario</legend>
      <div className="grid gap-2">
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
              <span className="block rounded-xl border border-border p-3 transition-colors peer-checked:border-primary peer-checked:bg-muted peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2">
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
  );
}
