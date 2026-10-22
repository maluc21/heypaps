"use client";

/**
 * Copia el link de la ficha para compartirlo por WhatsApp (plan §4.2).
 *
 * Copia la URL que el comprador ve: si la tienda se sirve desde un
 * subdominio, esa es la que se comparte.
 *
 * Sin sonner: el aviso va en el propio boton. El catálogo público es la ruta
 * mas visitada y cada KB de JavaScript se paga en cada visita.
 */

import { useState } from "react";

export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      data-copy-link
      className="w-full rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground"
    >
      {copied ? "Link copiado" : "Copiar link"}
    </button>
  );
}
