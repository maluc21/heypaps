/**
 * POST /api/upload-delete
 *
 * Borra una imagen: quita el archivo del DAM, purga la caché del CDN (borrar el
 * archivo no purga la caché), despeja las referencias del producto y descuenta
 * los bytes de la cuota de la tienda (plan §6.2, tarea 3.4).
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  deleteFile,
  getFileDetails,
  getPrivateKey,
  purgeCache,
} from "@/lib/imagekit-admin";
import { imageKitStorePrefix, imageKitUrl } from "@/lib/imagekit";

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
    productId?: string | null;
    fileId?: string;
  } | null;

  const storeId = body?.storeId ?? "";
  // productId es opcional: el logo de la tienda no cuelga de un producto.
  const productId = body?.productId ?? null;
  const fileId = body?.fileId ?? "";

  if (!storeId || !fileId) {
    return NextResponse.json(
      { error: "Faltan storeId o fileId." },
      { status: 400 },
    );
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
  const path = details?.filePath ?? "";
  if (details && !path.startsWith(imageKitStorePrefix(storeId))) {
    return NextResponse.json(
      { error: "El archivo no pertenece a esta tienda." },
      { status: 403 },
    );
  }

  // Primero el DAM: si esto falla, la referencia sigue intacta y se puede
  // reintentar sin dejar el producto apuntando a una imagen inexistente.
  try {
    await deleteFile(fileId, privateKey);
    await purgeCache(imageKitUrl(fileId), privateKey);
  } catch {
    return NextResponse.json(
      { error: "No se pudo borrar la imagen del DAM." },
      { status: 502 },
    );
  }

  if (productId) {
    const { error: removeError } = await supabase.rpc("remove_product_image", {
      p_store_id: storeId,
      p_product_id: productId,
      p_file_id: fileId,
    });

    if (removeError) {
      return NextResponse.json(
        { error: removeError.message ?? "No se pudo quitar la imagen del producto." },
        { status: 409 },
      );
    }
  }

  // La cuota se descuenta con el peso real del archivo.
  const size = Number(details?.size ?? 0);
  if (size > 0) {
    await supabase.rpc("record_storage_usage", {
      p_store_id: storeId,
      p_delta_bytes: -size,
    });
  }

  return NextResponse.json({ ok: true, fileId, freedBytes: size });
}
