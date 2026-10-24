import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getPrivateKey, listFiles, deleteFile } from "@/lib/imagekit-admin";

const ONE_HOUR_MS = 60 * 60 * 1000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }
  }

  const privateKey = getPrivateKey();
  if (!privateKey) {
    return NextResponse.json(
      { error: "Subida de imágenes no habilitada." },
      { status: 501 },
    );
  }

  const admin = getAdminClient();
  const { data: stores, error: storesError } = await admin
    .from("stores")
    .select("id")
    .is("deleted_at", null);

  if (storesError) {
    return NextResponse.json({ error: storesError.message }, { status: 500 });
  }

  let scanned = 0;
  let deleted = 0;
  const errors: string[] = [];

  for (const store of stores ?? []) {
    const storeId = String(store.id);
    const prefix = `/stores/${storeId}/`;

    let files;
    try {
      files = await listFiles(prefix, privateKey);
    } catch (err) {
      errors.push(`list ${storeId}: ${(err as Error).message}`);
      continue;
    }

    // Archivos registrados en la base para esta tienda.
    const { data: registered } = await admin
      .from("store_files")
      .select("file_id")
      .eq("store_id", storeId);
    const registeredIds = new Set((registered ?? []).map((r) => String(r.file_id)));

    for (const file of files) {
      if (!file.fileId) continue;
      if (registeredIds.has(file.fileId)) continue;
      if (!file.createdAt) continue;
      const age = Date.now() - new Date(file.createdAt).getTime();
      if (age < ONE_HOUR_MS) continue; // gracia para subidas en curso

      scanned++;
      const ok = await deleteFile(file.fileId, privateKey).catch(() => false);
      if (ok) deleted++;
      else errors.push(`delete ${file.fileId}`);
    }
  }

  return NextResponse.json({ scanned, deleted, errors });
}
