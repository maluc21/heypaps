/**
 * POST /api/upload-delete
 *
 * Borra una imagen: quita el archivo del DAM, purga la caché del CDN (borrar el
 * archivo no purga la caché), despeja las referencias del producto y descuenta
 * los bytes de la cuota de la tienda (plan §6.2, tarea 3.4).
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  deleteFile,
  getPrivateKey,
  purgeCache,
} from "@/lib/imagekit-admin";
import { imageKitUrl } from "@/lib/imagekit";

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
    /** Ruta del archivo en el DAM (la que forma la URL publica). */
    filePath?: string;
  } | null;

  const storeId = body?.storeId ?? "";
  // productId es opcional: el logo de la tienda no cuelga de un producto.
  const productId = body?.productId ?? null;
  const filePath = body?.filePath ?? "";

  if (!storeId || !filePath) {
    return NextResponse.json(
      { error: "Faltan storeId o filePath." },
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

  // El registro de la tienda guarda el fileId (lo que la API de ImageKit
  // necesita para borrar) junto a la ruta.
  const { data: registro, error: registroError } = await supabase.rpc("get_store_file", {
    p_store_id: storeId,
    p_file_path: filePath,
  });

  if (registroError || !registro) {
    return NextResponse.json(
      { error: "El archivo no está registrado en esta tienda." },
      { status: 404 },
    );
  }

  const fileId = (registro as { file_id?: string }).file_id ?? "";

  // Primero el DAM: si esto falla, la referencia sigue intacta y se puede
  // reintentar sin dejar el producto apuntando a una imagen inexistente.
  try {
    await deleteFile(fileId, privateKey);
    await purgeCache(imageKitUrl(filePath), privateKey);
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
      p_file_path: filePath,
    });

    if (removeError) {
      return NextResponse.json(
        { error: removeError.message ?? "No se pudo quitar la imagen del producto." },
        { status: 409 },
      );
    }
  }

  // La cuota se descuenta con el peso real que tenia registrado el archivo.
  // La resta la hace el servidor con su propia clave: un dueño no puede
  // inventarse un delta negativo para vaciar su contador.
  const admin = getAdminClient();
  const { error: releaseError } = await admin.rpc("release_store_file", {
    p_store_id: storeId,
    p_file_path: filePath,
  });

  if (releaseError) {
    return NextResponse.json(
      { error: releaseError.message ?? "No se pudo liberar el espacio de la imagen." },
      { status: 409 },
    );
  }

  const freedBytes = Number((registro as { bytes?: number }).bytes ?? 0);
  return NextResponse.json({ ok: true, fileId, filePath, freedBytes });
}
