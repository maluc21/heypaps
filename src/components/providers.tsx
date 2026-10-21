"use client";

import { useSyncExternalStore } from "react";
import { Toaster } from "@/components/ui/sonner";

/** El ancho no cambia durante la vida de la página: sin suscripciones. */
function subscribeToNothing(): () => void {
  return () => {};
}

const MOBILE_BREAKPOINT = 640;

function isMobileViewport(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // En móvil el toast abajo tapa los botones del pie de la tarjeta (el panel es
  // móvil-first, plan §2.3). Arriba no estorba; en escritorio se mantiene abajo.
  // useSyncExternalStore evita el desajuste de hidratación: "" en el servidor.
  const isMobile = useSyncExternalStore(
    subscribeToNothing,
    isMobileViewport,
    () => false,
  );

  return (
    <>
      {children}
      <Toaster position={isMobile ? "top-center" : "bottom-right"} richColors />
    </>
  );
}
