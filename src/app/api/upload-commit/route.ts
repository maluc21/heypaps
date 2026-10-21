/**
 * POST /api/upload-commit
 *
 * Confirma una subida ya hecha en ImageKit: lee el peso REAL del archivo en el
 * DAM y lo suma a la cuota de la tienda. Nunca se confía en el tamaño que
 * declara el cliente (plan §6.2).
 *
 * También valida que el archivo viva en la carpeta de la tienda: si no, un
 * vendedor podría confirmar el archivo de otra tienda y consumir su cuota.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getFileDetails, getPrivateKey } from "@/lib/imagekit-admin";
import { imageKitStorePrefix } from "@/lib/imagekit";

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

  const body = (await request.json().catch(() => null)) as {
    storeId?: string;
    fileId?: string;
  } | null;

  const storeId = body?.storeId ?? "";
  const fileId = body?.fileId ?? "";

  if (!storeId || !fileId) {
    return NextResponse.json({ error: "Faltan storeId o fileId." }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("store_members")
    .select("store_id")
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

  const details = await getFileDetails(fileId, privateKey);
  if (!details) {
    return NextResponse.json(
      { error: "El archivo no existe en el DAM." },
      { status: 404 },
    );
  }

  // El archivo debe estar en la carpeta de la tienda.
  const path = details.filePath ?? "";
  if (!path.startsWith(imageKitStorePrefix(storeId))) {
    return NextResponse.json(
      { error: "El archivo no pertenece a esta tienda." },
      { status: 403 },
    );
  }

  const size = Number(details.size);
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json(
      { error: "No se pudo determinar el peso del archivo." },
      { status: 502 },
    );
  }

  // La RPC valida la cuota del plan y suma el delta; si el límite se excede
  // lanza y el archivo queda sin contabilizar.
  const { data: bytesUsed, error } = await supabase.rpc("record_storage_usage", {
    p_store_id: storeId,
    p_delta_bytes: size,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "No se pudo registrar la imagen." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, fileId, size, bytesUsed });
}
