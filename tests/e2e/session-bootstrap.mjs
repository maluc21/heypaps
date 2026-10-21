/**
 * Arnés de pruebas E2E: crea una sesión autenticada real para un usuario de prueba.
 *
 * Uso (solo entorno de pruebas, nunca en runtime de la app):
 *   SUPABASE_SERVICE_ROLE_KEY=... node tests/e2e/session-bootstrap.mjs <email> <salida.json>
 *
 * - Crea (o reutiliza) el usuario con la API admin.
 * - Genera un magic link y verifica su token_hash en el servidor, así no hace falta buzón.
 * - Escribe las cookies de sesión que @supabase/ssr usa en la app.
 *
 * service_role solo vive en el entorno de este script; la app no lo usa (plan §5.2).
 */

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { writeFileSync } from "node:fs";

const [, , email, outFile] = process.argv;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !outFile || !url || !anon || !serviceKey) {
  console.error("Faltan argumentos o variables (URL, ANON, SERVICE_ROLE, email, salida).");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { error: createErr } = await admin.auth.admin.createUser({ email, email_confirm: true });
if (createErr && !/already|registered|exists/i.test(createErr.message)) {
  console.error("createUser:", createErr.message);
  process.exit(1);
}

const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (linkErr) {
  console.error("generateLink:", linkErr.message);
  process.exit(1);
}

const jar = new Map();
const ssr = createServerClient(url, anon, {
  cookies: {
    getAll() {
      return [...jar.entries()].map(([name, value]) => ({ name, value }));
    },
    setAll(cookies) {
      for (const c of cookies) jar.set(c.name, c.value);
    },
  },
});

const { error: verifyErr } = await ssr.auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: "magiclink",
});
if (verifyErr) {
  console.error("verifyOtp:", verifyErr.message);
  process.exit(1);
}

const cookies = [...jar.entries()].map(([name, value]) => ({ name, value }));
writeFileSync(outFile, JSON.stringify(cookies), { encoding: "utf8" });
console.log(`sesion creada para ${email}: ${cookies.length} cookie(s) escritas en ${outFile}`);
