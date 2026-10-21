"use client";

/**
 * Botón de WhatsApp del catálogo público.
 *
 * Registra el evento `wa_click` (KPI central de venta, plan §4.3) antes de
 * abrir el chat. El registro es best-effort: si falla, el enlace igual abre.
 */

import { useCallback, useState, type ReactNode } from "react";
import { createPublicClient } from "@/lib/supabase/public";

type Props = {
  phone: string;
  message: string;
  storeId: string;
  productId?: string | null;
  className?: string;
  label?: string;
  children?: ReactNode;
};

export function WhatsAppButton({
  phone,
  message,
  storeId,
  productId = null,
  className,
  label = "Pedir por WhatsApp",
  children,
}: Props) {
  const [sending, setSending] = useState(false);

  const href = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;

  const onClick = useCallback(() => {
    setSending(true);
    // Best-effort: si el registro falla, el enlace de WhatsApp abre igual.
    void (async () => {
      try {
        await createPublicClient().rpc("record_event", {
          p_store_id: storeId,
          p_product_id: productId,
          p_kind: "wa_click",
        });
      } catch {
        // sin registro, el enlace sigue funcionando
      } finally {
        setSending(false);
      }
    })();
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
      {children ?? label}
    </a>
  );
}
