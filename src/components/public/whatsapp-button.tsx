"use client";

/**
 * Botón de WhatsApp del catálogo público.
 *
 * Registra el evento `wa_click` (KPI central de venta, plan §4.3) antes de
 * abrir el chat. El registro es best-effort: si falla, el enlace igual abre.
 *
 * El evento se pide con un fetch a la API REST en lugar del cliente de
 * Supabase: importar el SDK entero en el bundle del catálogo público añade
 * más de 100 KB de JavaScript a la ruta más visitada, y aquí solo hace falta
 * una llamada POST.
 */

import { useCallback, useState } from "react";

type Props = {
  phone: string;
  message: string;
  storeId: string;
  productId?: string | null;
  className?: string;
  label?: string;
};

export function WhatsAppButton({
  phone,
  message,
  storeId,
  productId = null,
  className,
  label = "Pedir por WhatsApp",
}: Props) {
  const [sending, setSending] = useState(false);

  const href = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;

  const onClick = useCallback(() => {
    setSending(true);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setSending(false);
      return;
    }

    void fetch(`${url}/rest/v1/rpc/record_event`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_store_id: storeId,
        p_product_id: productId,
        p_kind: "wa_click",
      }),
    })
      .catch(() => undefined)
      .finally(() => setSending(false));
  }, [storeId, productId]);

  return (
    <a
      href={href}
      onClick={onClick}
      target="_blank"
      rel="noopener noreferrer"
      data-wa-label={label}
      aria-busy={sending}
      className={className}
    >
      {label}
    </a>
  );
}
