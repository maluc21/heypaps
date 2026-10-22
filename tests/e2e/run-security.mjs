/**
 * Arnés de la E2E de seguridad: limpieza → sesiones → battery → limpieza.
 *
 *   node --env-file-if-exists=.env.local tests/e2e/run-security.mjs
 *
 * Requiere el servidor de la app levantado en el puerto 3000 (pnpm start) y el
 * CLI de Supabase enlazado al proyecto. La limpieza usa
 * tests/e2e/cleanup-e2e.sql, que borra tiendas 'e2e-%' y usuarios
 * 'e2e-%@test.test' (incluidos los de esta batería) y sus filas de
 * platform_members.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLEANUP_SQL = join(ROOT, "tests", "e2e", "cleanup-e2e.sql");

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Faltan variables: ${missing.join(", ")}`);
  console.error("Usa: node --env-file-if-exists=.env.local tests/e2e/run-security.mjs");
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  return result.status === 0;
}

function sql(file) {
  console.log(`\n$ supabase db query --linked -f ${file}`);
  return run("supabase", ["db", "query", "--linked", "-f", file]);
}

const workdir = mkdtempSync(join(tmpdir(), "catalogo-security-"));
const sesiones = {
  E2E_SEC_OWNER_SESSION: join(workdir, "owner.json"),
  E2E_SEC_OTHER_SESSION: join(workdir, "other.json"),
  E2E_SEC_INTRUDER_SESSION: join(workdir, "intruder.json"),
  E2E_SEC_SUPER_SESSION: join(workdir, "super.json"),
};
const usuarios = [
  ["e2e-sec-owner@test.test", sesiones.E2E_SEC_OWNER_SESSION],
  ["e2e-sec-other@test.test", sesiones.E2E_SEC_OTHER_SESSION],
  ["e2e-sec-intruder@test.test", sesiones.E2E_SEC_INTRUDER_SESSION],
  ["e2e-sec-super@test.test", sesiones.E2E_SEC_SUPER_SESSION],
];

let exitCode = 1;
try {
  if (!sql(CLEANUP_SQL)) {
    console.error("Falló la limpieza previa");
    process.exit(1);
  }

  console.log("\n$ creando sesiones de prueba");
  for (const [email, out] of usuarios) {
    if (!run("node", ["tests/e2e/session-bootstrap.mjs", email, out])) {
      console.error(`No se pudo crear la sesión de ${email}`);
      process.exit(1);
    }
  }

  console.log("\n$ E2E de seguridad (panel, CSP, XSS, subidas, enumeración, redirect)");
  const e2eOk = run("node", ["tests/e2e/security.e2e.mjs"], {
    env: { ...process.env, ...sesiones },
  });

  console.log("\n$ E2E de seguridad de la subida de imágenes (ImageKit)");
  const uploadOk = run("node", ["tests/e2e/security-upload.mjs"], {
    env: { ...process.env, ...sesiones },
  });

  exitCode = e2eOk && uploadOk ? 0 : 1;
} finally {
  console.log("\n$ limpieza final");
  sql(CLEANUP_SQL);
  rmSync(workdir, { recursive: true, force: true });
}

process.exit(exitCode);
