/**
 * Arnés E2E completo: limpieza → sesiones → suite → limpieza.
 *
 * Uso (local):
 *   node --env-file-if-exists=.env.local tests/e2e/run-e2e.mjs
 *
 * El orden importa: `cleanup-e2e.sql` borra los usuarios e2e-%@test.test y sus
 * sesiones, así que si se ejecuta después de crear las sesiones, estas quedan
 * huérfanas y la app responde "No hay una sesión activa". Este script fija el
 * orden correcto y repite la limpieza al final.
 *
 * Requiere el CLI de Supabase enlazado al proyecto (supabase link) y
 * SUPABASE_SERVICE_ROLE_KEY para crear las sesiones de prueba.
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
  console.error("Usa: node --env-file-if-exists=.env.local tests/e2e/run-e2e.mjs");
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

const workdir = mkdtempSync(join(tmpdir(), "catalogo-e2e-"));
const ownerSession = join(workdir, "owner.json");
const intruderSession = join(workdir, "intruder.json");

let exitCode = 1;
try {
  if (!sql(CLEANUP_SQL)) {
    console.error("Falló la limpieza previa");
    process.exit(1);
  }

  console.log("\n$ creando sesiones de prueba");
  const sessions = [
    ["e2e-owner@test.test", ownerSession],
    ["e2e-intruder@test.test", intruderSession],
  ];
  for (const [email, out] of sessions) {
    if (!run("node", ["tests/e2e/session-bootstrap.mjs", email, out])) {
      console.error(`No se pudo crear la sesión de ${email}`);
      process.exit(1);
    }
  }

  console.log("\n$ suite E2E");
  exitCode = run("node", ["tests/e2e/panel.e2e.mjs"], {
    env: {
      ...process.env,
      E2E_OWNER_SESSION: ownerSession,
      E2E_INTRUDER_SESSION: intruderSession,
    },
  })
    ? 0
    : 1;
} finally {
  console.log("\n$ limpieza final");
  sql(CLEANUP_SQL);
  rmSync(workdir, { recursive: true, force: true });
}

process.exit(exitCode);
