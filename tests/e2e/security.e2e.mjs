/**
 * E2E de seguridad: control de acceso del panel, CSP, XSS en el catálogo
 * público, endpoints de subida, enumeración de tiendas y open redirect.
 *
 *   node --env-file-if-exists=.env.local tests/e2e/security.e2e.mjs
 *
 * Variables:
 *   E2E_APP_URL             (default http://localhost:3000)
 *   E2E_SEC_OWNER_SESSION   cookies del dueño de la tienda A
 *   E2E_SEC_OTHER_SESSION   cookies del dueño de la tienda B
 *   E2E_SEC_INTRUDER_SESSION cookies de un usuario sin tienda
 *   E2E_SEC_SUPER_SESSION   cookies de un superadmin de plataforma
 *
 * Escribe fixtures en la base enlazada (prefijos 'e2e-sec-') y deja que
 * tests/e2e/cleanup-e2e.sql los borre al terminar.
 */

import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { chromium } from "playwright-core";

const APP = process.env.E2E_APP_URL ?? "http://localhost:3000";
const CHROME = process.env.E2E_CHROME_PATH || undefined;
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const IMAGEKIT_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY;
const IMAGEKIT_PUBLIC_KEY = process.env.IMAGEKIT_PUBLIC_KEY;

const OWNER = "e2e-sec-owner@test.test";
const OTHER = "e2e-sec-other@test.test";
const SUPER = "e2e-sec-super@test.test";

const STAMP = Date.now();
const STORE_A = randomUUID();
const STORE_B = randomUUID();
const STORE_DRAFT = randomUUID();
const STORE_XSS = randomUUID();
const PRODUCT_XSS = randomUUID();
const VARIANT_XSS = randomUUID();
const SLUG_A = `e2e-sec-a-${STAMP}`;
const SLUG_B = `e2e-sec-b-${STAMP}`;
const SLUG_DRAFT = `e2e-sec-c-${STAMP}`;
const SLUG_XSS = `e2e-sec-xss-${STAMP}`;

const results = [];
/**
 * Registra una comprobación.
 * `expected = false` marca un hallazgo conocido: se muestra como FAIL pero no
 * rompe la batería (igual que en supabase/tests/security.sql).
 */
function check(name, ok, detail = "", expected = true) {
  results.push({ name, ok, detail, expected });
  const marca = ok ? "PASS" : expected ? "FAIL" : "FAIL*";
  console.log(`${marca}  ${name}${detail ? `  (${detail})` : ""}`);
}

function cookiesFrom(envVar) {
  const file = process.env[envVar];
  if (!file) throw new Error(`falta ${envVar}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

function cookieHeader(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/**
 * Petición HTTP con cookies opcionales y sin seguir redirecciones.
 *
 * Reintenta ante errores de red transitorios (ECONNRESET, ETIMEDOUT): con
 * casi 60 comprobaciones encadenadas, un reset de conexión del servidor no
 * debe tumbar la batería. Un fallo de seguridad (status o cuerpo) no se
 * reintenta: eso sí es un resultado.
 */
async function http(path, { cookies, method = "GET", body, headers = {} } = {}) {
  const ultimoError = { message: "", cause: "" };

  for (let intento = 0; intento < 3; intento++) {
    try {
      const res = await fetch(`${APP}${path}`, {
        method,
        headers: {
          ...(cookies ? { cookie: cookieHeader(cookies) } : {}),
          ...(body ? { "content-type": "application/json" } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "manual",
      });
      const text = await res.text();
      return { status: res.status, headers: res.headers, location: res.headers.get("location"), text };
    } catch (err) {
      const codigo = err?.cause?.code ?? "";
      ultimoError.message = String(err?.message ?? err).split("\n")[0];
      ultimoError.cause = codigo;
      const transitorio = ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED"].includes(codigo);
      if (!transitorio || intento === 2) break;
      await new Promise((r) => setTimeout(r, 250 * (intento + 1)));
    }
  }

  throw new Error(`${ultimoError.message}${ultimoError.cause ? ` (${ultimoError.cause})` : ""} — ${method} ${path}`);
}

function runSql(sql) {
  const file = join(tmpdir(), `qa-security-seed-${Date.now()}.sql`);
  writeFileSync(file, sql, "utf8");
  try {
    return execFileSync("supabase", ["db", "query", "--linked", "-f", file], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
  } finally {
    rmSync(file, { force: true });
  }
}

/** Lee una tabla del SQL de la CLI: devuelve las filas como arrays de texto. */
function sqlRows(sql) {
  const out = runSql(sql);
  const lineas = out.split(/\r?\n/).filter((l) => l.includes("│"));
  return lineas.slice(1).map((l) =>
    l
      .split("│")
      .map((c) => c.trim())
      .filter((c) => c !== ""),
  );
}

function seedFixtures() {
  const sql = `
insert into public.stores (id, slug, name, description, status) values
  ('${STORE_A}', '${SLUG_A}', 'Tienda QA A', 'Tienda de pruebas de seguridad', 'published'),
  ('${STORE_B}', '${SLUG_B}', 'Tienda QA B', 'Segunda tienda de pruebas', 'published'),
  ('${STORE_DRAFT}', '${SLUG_DRAFT}', 'Tienda QA en borrador', 'No debe verse', 'draft'),
  ('${STORE_XSS}', '${SLUG_XSS}', 'Tienda <script>alert("XSS-STORE")</script>', 'Prueba de escape', 'published')
on conflict (id) do nothing;

insert into public.store_members (store_id, user_id, role)
select '${STORE_A}', id, 'owner' from auth.users where email = '${OWNER}'
on conflict (store_id, user_id) do nothing;
insert into public.store_members (store_id, user_id, role)
select '${STORE_B}', id, 'owner' from auth.users where email = '${OTHER}'
on conflict (store_id, user_id) do nothing;
insert into public.store_members (store_id, user_id, role)
select '${STORE_DRAFT}', id, 'owner' from auth.users where email = '${OWNER}'
on conflict (store_id, user_id) do nothing;
insert into public.store_members (store_id, user_id, role)
select '${STORE_XSS}', id, 'owner' from auth.users where email = '${OWNER}'
on conflict (store_id, user_id) do nothing;

insert into public.platform_members (user_id, role)
select id, 'superadmin' from auth.users where email = '${SUPER}'
on conflict (user_id) do nothing;

insert into public.products (id, store_id, slug, name) values
  ('${PRODUCT_XSS}', '${STORE_XSS}', 'xss', '"><img src=x onerror=alert("XSS-PRODUCT")>')
on conflict (id) do nothing;

insert into public.variants (id, store_id, product_id, attributes, sku, price_cents, stock) values
  ('${VARIANT_XSS}', '${STORE_XSS}', '${PRODUCT_XSS}', '{}', 'XSS-1', 1000, 1)
on conflict (id) do nothing;
`;
  runSql(sql);
}

async function imageKitUpload({ folder, fileName, token, expire, signature, publicKey }) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([readFileSync(join(FIXTURES, "sample.png"))], { type: "image/png" }),
    fileName,
  );
  form.append("fileName", fileName);
  form.append("publicKey", publicKey);
  form.append("signature", signature);
  form.append("expire", String(expire));
  form.append("token", token);
  form.append("folder", folder);
  form.append("useUniqueFileName", "true");
  const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    body: form,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* respuesta no JSON */
  }
  return { status: res.status, json };
}

const cookiesOwner = cookiesFrom("E2E_SEC_OWNER_SESSION");
const cookiesOther = cookiesFrom("E2E_SEC_OTHER_SESSION");
const cookiesIntruder = cookiesFrom("E2E_SEC_INTRUDER_SESSION");
const cookiesSuper = cookiesFrom("E2E_SEC_SUPER_SESSION");

seedFixtures();

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

try {
  // =====================================================================
  // 1. Control de acceso del panel
  // =====================================================================
  const rutasPanel = ["/panel", "/products", "/products/nuevo", "/ajustes", "/categorias", "/etiquetas"];

  for (const ruta of rutasPanel) {
    // En Next 16 la redirección a /login viaja en el flujo de la respuesta
    // (status 200 + redirección en el cliente), así que el destino final se
    // comprueba en el navegador. Además se verifica que la respuesta no
    // contiene datos del panel.
    const res = await http(ruta);
    const sinDatos = !res.text.includes("Tienda QA A") && !res.text.includes("Tienda QA B");

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${APP}${ruta}`, { waitUntil: "networkidle" });
    const destino = new URL(page.url()).pathname;
    await ctx.close();

    check(
      `sin sesión ${ruta} acaba en /login`,
      destino === "/login",
      `destino final: ${destino} (HTTP ${res.status})`,
    );
    check(`sin sesión ${ruta} no devuelve datos del panel`, sinDatos, `HTTP ${res.status}`);
  }

  {
    const res = await http("/super");
    check(
      "sin sesión /super responde 404 (no redirige ni revela nada)",
      res.status === 404,
      `HTTP ${res.status}`,
    );
  }

  {
    const res = await http("/super", { cookies: cookiesIntruder });
    check(
      "un usuario sin rol de plataforma recibe 404 en /super",
      res.status === 404,
      `HTTP ${res.status}`,
    );
  }

  {
    const res = await http("/super", { cookies: cookiesOwner });
    check(
      "el dueño de una tienda (sin rol de plataforma) recibe 404 en /super",
      res.status === 404,
      `HTTP ${res.status}`,
    );
  }

  {
    const res = await http("/super", { cookies: cookiesSuper });
    check(
      "un superadmin de plataforma entra en /super",
      res.status === 200,
      `HTTP ${res.status}`,
    );
  }

  {
    // El intruso no puede ver los datos de la tienda A en el panel.
    const res = await http("/products", { cookies: cookiesIntruder });
    check(
      "un usuario sin tienda no ve datos ajenos en /products",
      res.status === 200 && !res.text.includes("Tienda QA A"),
      `HTTP ${res.status}`,
    );
  }

  {
    const res = await http("/ajustes", { cookies: cookiesIntruder });
    check(
      "un usuario sin tienda no ve los ajustes de otra tienda",
      !res.text.includes("Tienda QA A"),
      `HTTP ${res.status}`,
    );
  }

  {
    // El dueño de la tienda B no puede ver los productos de la tienda A.
    const res = await http("/products", { cookies: cookiesOther });
    check(
      "el dueño de la tienda B no ve los productos de la tienda A",
      !res.text.includes("Tienda QA A"),
      `HTTP ${res.status}`,
    );
  }

  // =====================================================================
  // 2. CSP y cabeceras de seguridad
  // =====================================================================
  {
    const res = await http(`/s/${SLUG_A}`);
    const csp = res.headers.get("content-security-policy") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];

    check("la respuesta trae cabecera CSP", csp.length > 0);
    check(
      "la CSP no permite unsafe-eval en producción",
      !csp.includes("unsafe-eval"),
      csp.includes("unsafe-eval") ? "aparece unsafe-eval" : "sin unsafe-eval",
    );
    check("la CSP incluye un nonce", Boolean(nonce), nonce ?? "sin nonce");
    check(
      "la CSP no permite scripts inline sin nonce",
      !/script-src[^;]*'unsafe-inline'/.test(csp),
      "script-src",
    );
    check(
      "la CSP bloquea iframes y objetos",
      csp.includes("frame-src 'none'") && csp.includes("object-src 'none'"),
      "frame-src/object-src",
    );
    check(
      "la CSP restringe form-action y base-uri al propio origen",
      csp.includes("form-action 'self'") && csp.includes("base-uri 'self'"),
      "form-action/base-uri",
    );
    check(
      "connect-src permite Supabase y la subida a ImageKit, y nada en claro",
      /connect-src[^;]*https:\/\/\*\.supabase\.co/.test(csp) &&
        /connect-src[^;]*https:\/\/upload\.imagekit\.io/.test(csp) &&
        !/connect-src[^;]*\bhttp:\/\//.test(csp),
      "connect-src",
    );
    check(
      "img-src permite ImageKit y los data/blob, y nada en claro",
      /img-src[^;]*https:\/\/ik\.imagekit\.io/.test(csp) &&
        /img-src[^;]*data:/.test(csp) &&
        !/img-src[^;]*\bhttp:\/\//.test(csp),
      "img-src",
    );

    // Todos los scripts del HTML deben llevar el nonce (o ser cargados por un
    // script con nonce, gracias a 'strict-dynamic').
    const scripts = [...res.text.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
    const sinNonce = scripts.filter((attrs) => !/nonce=/.test(attrs));
    check(
      "todos los scripts de la página llevan el nonce de la CSP",
      sinNonce.length === 0,
      `${sinNonce.length} de ${scripts.length} sin nonce`,
    );

    const conNonceDistinto = scripts.filter((attrs) => {
      const n = /nonce="([^"]+)"/.exec(attrs)?.[1];
      return n && nonce && n !== nonce;
    });
    check(
      "el nonce de los scripts es el mismo que el de la cabecera",
      conNonceDistinto.length === 0,
      `${conNonceDistinto.length} script(s) con otro nonce`,
    );

    check(
      "la respuesta trae X-Content-Type-Options, X-Frame-Options y Referrer-Policy",
      res.headers.get("x-content-type-options") === "nosniff" &&
        res.headers.get("x-frame-options") === "DENY" &&
        Boolean(res.headers.get("referrer-policy")),
      "cabeceras base",
    );
  }

  {
    // La CSP también debe venir en el panel y en el login.
    const panel = await http("/login");
    check(
      "la página de login también trae CSP con nonce",
      (panel.headers.get("content-security-policy") ?? "").includes("'nonce-"),
      `HTTP ${panel.status}`,
    );
  }

  // =====================================================================
  // 3. XSS en el catálogo público
  // =====================================================================
  {
    const res = await http(`/s/${SLUG_XSS}`);
    const html = res.text;
    check(
      "el nombre de la tienda con <script> sale escapado en el HTML",
      !/<script>alert\("XSS-STORE"\)<\/script>/i.test(html) &&
        html.includes("&lt;script&gt;alert(&quot;XSS-STORE&quot;)&lt;/script&gt;"),
      "inyección en el nombre de la tienda",
    );
    check(
      "el nombre del producto con onerror sale escapado en el HTML",
      !/<img src=x onerror=alert/i.test(html) && html.includes("&lt;img src=x onerror="),
      "inyección en el nombre del producto",
    );
  }

  {
    // En el navegador: ningún diálogo y ningún elemento inyectado.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const dialogos = [];
    page.on("dialog", async (d) => {
      dialogos.push(d.message());
      await d.dismiss();
    });
    await page.goto(`${APP}/s/${SLUG_XSS}`, { waitUntil: "networkidle" });
    const inyectado = await page.locator('img[onerror], script:has-text("XSS-STORE")').count();
    check(
      "el navegador no ejecuta el payload ni inyecta elementos",
      dialogos.length === 0 && inyectado === 0,
      `diálogos: ${dialogos.length}, elementos inyectados: ${inyectado}`,
    );
    await ctx.close();
  }

  // =====================================================================
  // 4. Endpoints de subida de imágenes
  // =====================================================================
  {
    const auth = await http("/api/upload-auth", { method: "POST", body: { storeId: STORE_A } });
    check(
      "un cliente anónimo no puede pedir una firma de subida",
      auth.status === 401,
      `HTTP ${auth.status}`,
    );
    const commit = await http("/api/upload-commit", {
      method: "POST",
      body: { storeId: STORE_A, fileId: "inexistente" },
    });
    check(
      "un cliente anónimo no puede confirmar una subida",
      commit.status === 401,
      `HTTP ${commit.status}`,
    );
    const del = await http("/api/upload-delete", {
      method: "POST",
      body: { storeId: STORE_A, fileId: "inexistente" },
    });
    check(
      "un cliente anónimo no puede borrar una imagen",
      del.status === 401,
      `HTTP ${del.status}`,
    );
  }

  {
    // El dueño de la tienda B no puede pedir firma para la tienda A.
    const res = await http("/api/upload-auth", {
      cookies: cookiesOther,
      method: "POST",
      body: { storeId: STORE_A },
    });
    check(
      "el dueño de otra tienda no obtiene firma para la tienda A",
      res.status === 403,
      `HTTP ${res.status}`,
    );
  }

  {
    const res = await http("/api/upload-commit", {
      cookies: cookiesOwner,
      method: "POST",
      body: { storeId: STORE_A, fileId: "65f0a1b2c3d4e5f6a7b8c9d0" },
    });
    check(
      "confirmar un fileId que no existe responde 404",
      res.status === 404,
      `HTTP ${res.status} ${res.text.slice(0, 80)}`,
    );
  }

  if (IMAGEKIT_PRIVATE_KEY && IMAGEKIT_PUBLIC_KEY) {
    // Firma propia de la tienda A, pero el archivo se sube a la carpeta de B.
    const auth = await http("/api/upload-auth", {
      cookies: cookiesOwner,
      method: "POST",
      body: { storeId: STORE_A },
    });
    const authJson = auth.status === 200 ? JSON.parse(auth.text) : null;

    if (!authJson) {
      check("el dueño de la tienda obtiene firma de subida", false, `HTTP ${auth.status}`);
    } else {
      check("el dueño de la tienda obtiene firma de subida", true, `HTTP ${auth.status}`);

      // Archivo en la carpeta de la tienda B con la firma de la tienda A.
      const ajeno = await imageKitUpload({
        folder: `/stores/${STORE_B}/`,
        fileName: "ajena.png",
        token: authJson.token,
        expire: authJson.expire,
        signature: authJson.signature,
        publicKey: authJson.publicKey,
      });
      const fileIdAjeno = ajeno.json?.fileId;

      if (fileIdAjeno) {
        const commitAjeno = await http("/api/upload-commit", {
          cookies: cookiesOwner,
          method: "POST",
          body: { storeId: STORE_A, fileId: fileIdAjeno },
        });
        check(
          "confirmar un archivo que vive en la carpeta de otra tienda se rechaza",
          commitAjeno.status === 403,
          `HTTP ${commitAjeno.status} ${commitAjeno.text.slice(0, 90)}`,
        );

        // El commit borra del DAM el archivo que no era suyo.
        const dam = await fetch(
          `https://api.imagekit.io/v1/files/${encodeURIComponent(fileIdAjeno)}/details`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${IMAGEKIT_PRIVATE_KEY}:`).toString("base64")}`,
            },
          },
        );
        check(
          "el archivo rechazado se borra del DAM (no queda basura ajena)",
          dam.status === 404,
          `HTTP ${dam.status}`,
        );

        // Para probar el borrado hace falta un archivo ajeno que siga existiendo:
        // la firma es de un solo uso, así que se pide una nueva.
        const auth2 = await http("/api/upload-auth", {
          cookies: cookiesOwner,
          method: "POST",
          body: { storeId: STORE_A },
        });
        const auth2Json = auth2.status === 200 ? JSON.parse(auth2.text) : null;
        const ajeno2 = auth2Json
          ? await imageKitUpload({
              folder: `/stores/${STORE_B}/`,
              fileName: "ajena-borrar.png",
              token: auth2Json.token,
              expire: auth2Json.expire,
              signature: auth2Json.signature,
              publicKey: auth2Json.publicKey,
            })
          : null;

        if (ajeno2?.json?.fileId) {
          const delAjeno = await http("/api/upload-delete", {
            cookies: cookiesOwner,
            method: "POST",
            body: { storeId: STORE_A, filePath: ajeno2.json.filePath },
          });
          check(
            "borrar un archivo de otra tienda se rechaza",
            delAjeno.status === 403 || delAjeno.status === 404,
            `HTTP ${delAjeno.status} ${delAjeno.text.slice(0, 90)}`,
          );
          // Limpieza del archivo ajeno que quedó en el DAM.
          await fetch(
            `https://api.imagekit.io/v1/files/${encodeURIComponent(ajeno2.json.fileId)}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Basic ${Buffer.from(`${IMAGEKIT_PRIVATE_KEY}:`).toString("base64")}`,
              },
            },
          );
        } else {
          check("no se pudo subir el segundo archivo ajeno (reproducción)", false, "sin fileId");
        }
      } else {
        check("no se pudo subir el archivo a la carpeta ajena (reproducción)", false, ajeno.text?.slice(0, 90));
      }

      // Subida legítima: el commit usa el peso real del archivo, no el que
      // declara el cliente. La firma es de un solo uso: se pide otra.
      const antes = sqlRows(
        `select bytes_used from public.store_storage where store_id = '${STORE_A}';`,
      );
      const bytesAntes = antes.length > 0 ? Number(antes[0][0]) : 0;

      const auth3 = await http("/api/upload-auth", {
        cookies: cookiesOwner,
        method: "POST",
        body: { storeId: STORE_A },
      });
      const auth3Json = auth3.status === 200 ? JSON.parse(auth3.text) : null;

      const propio = auth3Json
        ? await imageKitUpload({
            folder: auth3Json.folder,
            fileName: "legitima.png",
            token: auth3Json.token,
            expire: auth3Json.expire,
            signature: auth3Json.signature,
            publicKey: auth3Json.publicKey,
          })
        : null;
      const fileId = propio.json?.fileId;
      const filePath = propio.json?.filePath;
      const tamanoReal = propio.json?.size ?? 0;

      if (!fileId || !filePath) {
        check("subida legítima al DAM", false, propio.text?.slice(0, 90));
      } else {
        // El cliente "declara" un tamaño falso: el servidor lo debe ignorar.
        const commit = await http("/api/upload-commit", {
          cookies: cookiesOwner,
          method: "POST",
          body: { storeId: STORE_A, fileId, size: 1, bytes: 1 },
        });
        const commitJson = commit.status === 200 ? JSON.parse(commit.text) : {};
        check(
          "el commit cobra el peso real del archivo, no el que declara el cliente",
          commit.status === 200 && commitJson.size === tamanoReal && tamanoReal > 0,
          `HTTP ${commit.status}, tamaño declarado 1, real ${commitJson.size}`,
        );
        check(
          "el commit devuelve la ruta del archivo en el DAM",
          commitJson.filePath === filePath,
          `${commitJson.filePath} vs ${filePath}`,
        );

        const despues = sqlRows(
          `select bytes_used from public.store_storage where store_id = '${STORE_A}';`,
        );
        const bytesDespues = despues.length > 0 ? Number(despues[0][0]) : 0;
        check(
          "la cuota de la tienda sube exactamente el peso real del archivo",
          bytesDespues - bytesAntes === tamanoReal,
          `antes=${bytesAntes}, después=${bytesDespues}, real=${tamanoReal}`,
        );

        const borrado = await http("/api/upload-delete", {
          cookies: cookiesOwner,
          method: "POST",
          body: { storeId: STORE_A, filePath },
        });
        const borradoJson = borrado.status === 200 ? JSON.parse(borrado.text) : {};
        check(
          "el borrado descuenta exactamente el peso real del archivo",
          borrado.status === 200 && borradoJson.freedBytes === tamanoReal,
          `HTTP ${borrado.status}, freedBytes=${borradoJson.freedBytes}, real=${tamanoReal}`,
        );

        const final = sqlRows(
          `select bytes_used from public.store_storage where store_id = '${STORE_A}';`,
        );
        const bytesFinal = final.length > 0 ? Number(final[0][0]) : 0;
        check(
          "la cuota de la tienda vuelve a su valor inicial tras borrar",
          bytesFinal === bytesAntes,
          `antes=${bytesAntes}, final=${bytesFinal}`,
        );
      }
    }
  } else {
    check("hay credenciales de ImageKit para probar la subida", false, "faltan IMAGEKIT_*");
  }

  // =====================================================================
  // 5. Enumeración y existencia
  // =====================================================================
  {
    const borrador = await http(`/s/${SLUG_DRAFT}`);
    const inexistente = await http(`/s/${SLUG_A}-no-existe`);
    check(
      "una tienda en borrador y una inexistente devuelven el mismo status",
      borrador.status === inexistente.status && borrador.status === 404,
      `borrador=${borrador.status}, inexistente=${inexistente.status}`,
    );
    check(
      "una tienda en borrador y una inexistente devuelven el mismo cuerpo",
      borrador.text === inexistente.text,
      `mismos bytes: ${borrador.text.length === inexistente.text.length}`,
    );
  }

  {
    const sitemap = await http("/sitemap.xml");
    check(
      "el sitemap no incluye tiendas en borrador",
      !sitemap.text.includes(SLUG_DRAFT),
      `HTTP ${sitemap.status}`,
    );
    check(
      "el sitemap incluye las tiendas publicadas",
      sitemap.text.includes(SLUG_A),
      `HTTP ${sitemap.status}`,
    );
  }

  {
    // El catálogo de la tienda A no puede incluir productos de la tienda B.
    const cat = await http(`/s/${SLUG_A}`);
    check(
      "el catálogo de la tienda A no incluye el producto de la tienda B",
      !cat.text.includes("Tienda QA B"),
      `HTTP ${cat.status}`,
    );
  }

  {
    // El producto de la tienda XSS no resuelve en otra tienda: la respuesta
    // no puede traer sus datos (el status puede ser 200 con un "no
    // encontrado" en pantalla: el 404 real solo lo hace el Proxy para la
    // tienda, no para el producto).
    const res = await http(`/s/${SLUG_A}/xss`);
    const filtra =
      !res.text.includes("XSS-PRODUCT") &&
      !res.text.includes('onerror=alert("XSS-PRODUCT")') &&
      !res.text.includes("Tienda <script>");
    check(
      "un producto de otra tienda no filtra datos en su URL",
      filtra,
      `HTTP ${res.status}`,
    );
    check(
      "un producto inexistente devuelve 404 y no un 200 con la página vacía",
      res.status === 404,
      `HTTP ${res.status} (soft 404: la página de producto no devuelve 404 real)`,
      false,
    );
  }

  // =====================================================================
  // 6. Open redirect y manipulación de URL
  // =====================================================================
  {
    const res = await http("/auth/callback?next=https%3A%2F%2Fevil.example.com%2Frobo");
    const destino = res.location ?? "";
    check(
      "/auth/callback con next externo no redirige fuera del origen",
      !destino.includes("evil.example.com"),
      `HTTP ${res.status} -> ${destino}`,
    );
  }

  {
    const res = await http("/auth/callback?code=abc&next=https%3A%2F%2Fevil.example.com%2Frobo");
    const destino = res.location ?? "";
    check(
      "/auth/callback con código y next externo no redirige fuera del origen",
      !destino.includes("evil.example.com"),
      `HTTP ${res.status} -> ${destino}`,
    );
  }

  {
    const res = await http("/login?next=https%3A%2F%2Fevil.example.com%2Frobo");
    check(
      "/login con next externo no redirige fuera del origen",
      !String(res.location ?? "").includes("evil.example.com"),
      `HTTP ${res.status} -> ${res.location ?? "(sin redirección)"}`,
    );
  }

  {
    const res = await http("/login?redirect=https%3A%2F%2Fevil.example.com%2Frobo");
    check(
      "/login con redirect externo no redirige fuera del origen",
      !String(res.location ?? "").includes("evil.example.com"),
      `HTTP ${res.status} -> ${res.location ?? "(sin redirección)"}`,
    );
  }

  {
    // El login con sesión válida no debe aceptar un next como destino.
    const res = await http("/login?next=https%3A%2F%2Fevil.example.com%2Frobo", {
      cookies: cookiesOwner,
    });
    check(
      "/login con sesión y next externo no redirige fuera del origen",
      !String(res.location ?? "").includes("evil.example.com"),
      `HTTP ${res.status} -> ${res.location ?? "(sin redirección)"}`,
    );
  }
} catch (err) {
  // El mensaje de Node no dice por qué fallo el fetch: la causa real esta en
  // err.cause (ECONNRESET, ETIMEDOUT, ...). Sin ella el fallo es opaco.
  const causa = err?.cause?.code ?? err?.cause?.message ?? "";
  check(
    "ejecución sin excepciones",
    false,
    `${String(err?.message ?? err).split("\n")[0]}${causa ? ` (${causa})` : ""}`,
  );
} finally {
  await browser.close();
}

const inesperados = results.filter((r) => !r.ok && r.expected);
const documentados = results.filter((r) => !r.ok && !r.expected);
console.log(
  `\n${results.length - inesperados.length - documentados.length}/${results.length} comprobaciones de seguridad superadas`,
);
if (documentados.length > 0) {
  console.log(`HALLAZGOS DOCUMENTADOS (${documentados.length}):`);
  for (const f of documentados) console.log(`  - ${f.name} (${f.detail})`);
}
if (inesperados.length > 0) {
  console.log(`FALLOS INESPERADOS (${inesperados.length}):`);
  for (const f of inesperados) console.log(`  - ${f.name} (${f.detail})`);
}
process.exit(inesperados.length > 0 ? 1 : 0);
