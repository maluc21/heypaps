/**
 * E2E del flujo principal con sesiones reales (requiere dev server y session-bootstrap).
 *
 * Variables:
 *   E2E_APP_URL          (default http://localhost:3000)
 *   E2E_OWNER_SESSION    JSON de cookies del owner (salida de session-bootstrap.mjs)
 *   E2E_INTRUDER_SESSION JSON de cookies de un usuario sin tienda
 *   E2E_CHROME_PATH      ejecutable de Chromium (opcional)
 *
 * Cubre: onboarding (tienda + primer producto), render del panel, ocultar/mostrar con
 * persistencia tras recarga, aislamiento entre inquilinos, headers de seguridad,
 * redirección a /login sin sesión y CSP/nonce en una respuesta de subdominio.
 */

import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const APP = process.env.E2E_APP_URL ?? "http://localhost:3000";
// Sin E2E_CHROME_PATH se usa el Chromium instalado por `playwright-core install chromium`.
const CHROME = process.env.E2E_CHROME_PATH || undefined;
const slug = `e2e-${Date.now()}`;
const PRODUCT = `Producto E2E ${slug}`;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

function loadCookies(envVar) {
  const file = process.env[envVar];
  if (!file) throw new Error(`falta ${envVar}`);
  return JSON.parse(readFileSync(file, "utf8")).map((c) => ({ ...c, url: APP }));
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
// (CHROME indefinido = ejecutable por defecto de Playwright)

try {
  // ---------------------------------------------------------------
  // 1. Owner: onboarding (tienda + primer producto)
  // ---------------------------------------------------------------
  const owner = await browser.newContext();
  await owner.addCookies(loadCookies("E2E_OWNER_SESSION"));
  const page = await owner.newPage();

  // Cualquier violación de CSP es fallo: el nonce debe cubrir todos los scripts de Next
  const cspViolations = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) cspViolations.push(m.text());
  });

  await page.goto(`${APP}/onboarding`);
  await page.locator("#name").fill("Tienda E2E");
  await page.locator("#slug").fill(slug);
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.locator("#productName").waitFor({ timeout: 15000 });
  await page.locator("#productName").fill(PRODUCT);
  // Precio en lempiras: "450.50" = 45050 centavos
  await page.locator("#price").fill("450.50");
  await page.getByRole("button", { name: "Crear producto y finalizar" }).click();

  const ready = await page.getByText("Tu tienda está lista.").waitFor({ timeout: 15000 }).then(() => true, () => false);
  check("onboarding crea tienda y primer producto", ready);
  check("sin violaciones CSP durante onboarding", cspViolations.length === 0, cspViolations[0]?.slice(0, 120));

  // ---------------------------------------------------------------
  // 2. Panel: el producto aparece renderizado desde el servidor
  // ---------------------------------------------------------------
  await page.getByRole("button", { name: "Ir al panel" }).click().catch(() => {});
  await page.goto(`${APP}/products`);
  const row = page.locator("tr", { hasText: PRODUCT });
  await row.waitFor({ timeout: 15000 });
  check("panel de productos muestra el producto creado", await row.count() === 1);
  check("precio persiste en lempiras (450.50)", await row.getByText(/450[.,]50/).count() >= 1);

  const headers = (await page.request.get(`${APP}/products`)).headers();
  check(
    "cabeceras de seguridad presentes en /products",
    Boolean(headers["content-security-policy"]) && headers["x-frame-options"] === "DENY",
  );

  // ---------------------------------------------------------------
  // 3. Ocultar y restablecer; el cambio persiste tras recargar
  // ---------------------------------------------------------------
  await row.getByRole("button", { name: "Ocultar" }).click();
  await row.getByText("Oculto").waitFor({ timeout: 15000 }).catch(() => {});
  await page.reload();
  const hiddenAfterReload = await page.locator("tr", { hasText: PRODUCT }).getByText("Oculto").count();
  check("ocultar persiste tras recargar (SSR)", hiddenAfterReload === 1);

  await page.locator("tr", { hasText: PRODUCT }).getByRole("button", { name: "Mostrar" }).click();
  await page.locator("tr", { hasText: PRODUCT }).getByText("Oculto").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  await page.reload();
  const shownAfterReload = await page.locator("tr", { hasText: PRODUCT }).getByText("Oculto").count();
  check("mostrar persiste tras recargar", shownAfterReload === 0);

  // ---------------------------------------------------------------
  // 4. Aislamiento: un usuario sin tienda no ve productos del owner
  // ---------------------------------------------------------------
  const intruder = await browser.newContext();
  await intruder.addCookies(loadCookies("E2E_INTRUDER_SESSION"));
  const ip = await intruder.newPage();
  await ip.goto(`${APP}/products`);
  await ip.waitForLoadState("networkidle");
  const leaked = await ip.getByText(PRODUCT).count();
  check("intruso no ve el producto del owner", leaked === 0);

  // ---------------------------------------------------------------
  // 5. Sin sesión: /products redirige a /login y no muestra datos
  // ---------------------------------------------------------------
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await ap.goto(`${APP}/products`);
  await ap.waitForLoadState("networkidle");
  const anonLeak = await ap.getByText(PRODUCT).count();
  check("sin sesión no se muestran datos del owner", anonLeak === 0);
  check("sin sesión /products redirige a /login", new URL(ap.url()).pathname === "/login", ap.url());

  // ---------------------------------------------------------------
  // 6. Subdominio de tienda: el rewrite conserva la URL y la CSP con nonce se aplica
  //    en el navegador (Chromium resuelve *.localhost a loopback sin configurar DNS).
  //    Hoy /s/[store] no tiene página de catálogo: se valida CSP e hidratación de la
  //    respuesta reescrita; las aserciones de contenido llegan con la tarea 4.x.
  // ---------------------------------------------------------------
  const appPort = new URL(APP).port || "80";
  const tenantUrl = `http://tienda-e2e.app.localhost:${appPort}/`;
  const sub = await anon.newPage();
  const subCsp = [];
  sub.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) subCsp.push(m.text());
  });
  const subResponse = await sub.goto(tenantUrl);
  await sub.waitForLoadState("networkidle");
  const subCspHeader = subResponse?.headers()["content-security-policy"] ?? "";
  const subNonce = subCspHeader.match(/'nonce-([^']+)'/)?.[1];
  // Usar la propiedad: Chromium borra el atributo nonce del DOM tras el parseo.
  const scriptNonces = await sub.evaluate(() => [...document.scripts].map((s) => s.nonce));
  check("subdominio sirve CSP con nonce", Boolean(subNonce));
  check(
    "scripts de la respuesta reescrita llevan el nonce de la CSP",
    scriptNonces.length > 0 && scriptNonces.every((n) => n === subNonce),
    `${scriptNonces.length} script(s)`,
  );
  check("subdominio no redirige (URL del navegador intacta)", new URL(sub.url()).hostname === "tienda-e2e.app.localhost");
  check("sin violaciones CSP en subdominio", subCsp.length === 0, subCsp[0]?.slice(0, 120));

  await owner.close();
  await intruder.close();
  await anon.close();
} catch (err) {
  check("ejecución sin excepciones", false, String(err?.message ?? err).split("\n")[0]);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`);
process.exit(failed.length === 0 ? 0 : 1);
