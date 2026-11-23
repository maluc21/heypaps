"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

function Switch({
  className,
  ...props
}: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer group/switch relative inline-flex h-5 w-9 shrink-0 appearance-none items-center rounded-full border border-transparent p-0 transition-colors outline-none group-has-focus-visible/field-label:border-transparent group-has-focus-visible/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
      // Base UI manda el `id` al input oculto y deja el control visible como un
      // <span> sin id. Con nativeButton el id queda en el control visible (como
      // antes con Radix), para que <label htmlFor> lo etiquete y las pruebas
      // apunten al switch, no al input oculto de 1px.
      nativeButton
      render={<button />}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-[#128b2b] ring-0 transition-transform data-checked:translate-x-4"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
