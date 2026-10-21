/**
 * POST /api/upload-auth
 *
 * Autoriza una subida a ImageKit: comprueba sesión, membresía de la tienda,
 * cuota de almacenamiento y límite de subidas por hora; después devuelve una
 * firma de un solo uso (60 s) y la carpeta del DAM de esa tienda.
 *
 * La clave privada nunca sale del servidor: el navegador sube directo a
 * ImageKit con esta firma (plan §6.2).
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getUploadAuthParams, getPrivateKey } from "@/lib/imagekit-admin";
import { imageKitFolder } from "@/lib/imagekit";
import { getPlanLimits } from "@/lib/cache";

/** Subidas permitidas por hora y por tienda. */
const UPLOADS_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No hay una sesión activa." }, { status: 401 });
  }

  const privateKey = getPrivateKey();
  if (!privateKey) {
    return NextResponse.json(
      { error: "Subida de imágenes no habilitada en este entorno." },
      { status: 501 },
    );
  }

  const body = (await request.json().catch(() => null)) as { storeId?: string } | null;
  const storeId = body?.storeId ?? "";

  const { data: membership } = await supabase
    .from("store_members")
    .select("store_id, role")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .in("role", ["owner", "editor"])
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "No perteneces a esa tienda." },
      { status: 403 },
    );
  }

  const limit = checkRateLimit(`upload:${storeId}`, UPLOADS_PER_HOUR, HOUR_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Superaste el límite de subidas por hora. Intenta en unos minutos." },
      { status: 429 },
    );
  }

  // Cuota: el plan define el tope de bytes de la tienda.
  const { data: store } = await supabase
    .from("stores")
    .select("plan_code")
    .eq("id", storeId)
    .maybeSingle();

  const { data: storage } = await supabase
    .from("store_storage")
    .select("bytes_used")
    .eq("store_id", storeId)
    .maybeSingle();

  const planLimits = await getPlanLimits(store?.plan_code ?? "free");
  const used = storage?.bytes_used ?? 0;
  if (used >= planLimits.max_storage_bytes) {
    return NextResponse.json(
      { error: "Alcanzaste el límite de almacenamiento de tu plan." },
      { status: 409 },
    );
  }

  const { token, expire, signature } = getUploadAuthParams(privateKey, 60);

  return NextResponse.json({
    token,
    expire,
    signature,
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    folder: `/${imageKitFolder(storeId)}/`,
    remainingUploads: limit.remaining,
    bytesUsed: used,
    maxStorageBytes: planLimits.max_storage_bytes,
  });
}
