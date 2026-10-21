/**
 * E2E del flujo principal con sesiones reales (requiere dev server y session-bootstrap).
 *
 * Variables:
 *   E2E_APP_URL          (default http://localhost:3000)
 *   E2E_OWNER_SESSION    JSON de cookies del owner (salida de session-bootstrap.mjs)
 *   E2E_INTRUDER_SESSION JSON de cookies de un usuario sin tienda
 *   E2E_CHROME_PATH      ejecutable de Chromium (opcional)
 *
 * Cubre: onboarding (tienda + primer producto), publicación del catálogo, render del
 * panel, ocultar/mostrar con persistencia tras recarga, aislamiento entre inquilinos,
 * headers de seguridad, redirección a /login sin sesión, CSP/nonce en una respuesta de
 * subdominio y catálogo público (404 real, card, ficha y enlace wa.me).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright-core";

// Sin E2E_CHROME_PATH se usa el Chromium instalado por `playwright-core install chromium`.
const CHROME = process.env.E2E_CHROME_PATH || undefined;

const APP = process.env.E2E_APP_URL ?? "http://localhost:3000";
const slug = `e2e-${Date.now()}`;
const PRODUCT = `Producto E2E ${slug}`;
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

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
  // WhatsApp es parte del onboarding (plan §8.1) y habilita el CTA de la ficha.
  await page.locator("#whatsapp").fill("+504 1234 5678");
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
  // 2. La tienda nace oculta: el catálogo público no la sirve
  // ---------------------------------------------------------------
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  const draftResponse = await anonPage.goto(`${APP}/s/${slug}`);
  check(
    "tienda en borrador responde 404 en el catálogo público",
    draftResponse?.status() === 404,
    `HTTP ${draftResponse?.status()}`,
  );

  // ---------------------------------------------------------------
  // 3. Publicar desde la UI: el vendedor deja su catálogo visible
  // ---------------------------------------------------------------
  await page.getByRole("button", { name: "Publicar y ver mi catálogo" }).click();
  const publishedBanner = await page
    .getByText("Tu catálogo está publicado.")
    .waitFor({ timeout: 15000 })
    .then(() => true, () => false);
  check("publicar deja el catálogo publicado", publishedBanner);
  check("el link del catálogo se muestra al vendedor", (await page.getByText(`/s/${slug}`).count()) >= 1);

  // El toast no debe tapar los botones del pie.
  await page
    .locator("[data-sonner-toast]")
    .first()
    .waitFor({ state: "detached", timeout: 10000 })
    .catch(() => {});

  await page.getByRole("button", { name: "Ver mi catálogo" }).click();
  await page.waitForURL(new RegExp(`/s/${slug}$`), { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle");

  // El Proxy cachea el estado de publicación: puede tardar un momento en
  // reflejar la publicación, por eso se reintenta la carga.
  let catalogShowsProduct = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    if ((await page.getByText(PRODUCT).count()) > 0) {
      catalogShowsProduct = true;
      break;
    }
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
  }
  check("publicar lleva al catálogo público", new URL(page.url()).pathname === `/s/${slug}`, page.url());
  check("el catálogo publicado muestra el producto", catalogShowsProduct);
  check("el catálogo publicado muestra el precio en lempiras", (await page.getByText(/450[.,]50/).count()) >= 1);

  // ---------------------------------------------------------------
  // 4. Panel: el producto aparece renderizado desde el servidor
  // ---------------------------------------------------------------
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
  // 5. Ocultar y restablecer; el cambio persiste tras recargar
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
  // 6. Aislamiento: un usuario sin tienda no ve productos del owner
  // ---------------------------------------------------------------
  const intruder = await browser.newContext();
  await intruder.addCookies(loadCookies("E2E_INTRUDER_SESSION"));
  const ip = await intruder.newPage();
  await ip.goto(`${APP}/products`);
  await ip.waitForLoadState("networkidle");
  const leaked = await ip.getByText(PRODUCT).count();
  check("intruso no ve el producto del owner", leaked === 0);

  // ---------------------------------------------------------------
  // 7. Sin sesión: /products redirige a /login y no muestra datos
  // ---------------------------------------------------------------
  const ap = await anon.newPage();
  await ap.goto(`${APP}/products`);
  await ap.waitForLoadState("networkidle");
  const anonLeak = await ap.getByText(PRODUCT).count();
  check("sin sesión no se muestran datos del owner", anonLeak === 0);
  check("sin sesión /products redirige a /login", new URL(ap.url()).pathname === "/login", ap.url());

  // ---------------------------------------------------------------
  // 8. Catálogo público como anónimo: card, ficha y enlace de WhatsApp
  // ---------------------------------------------------------------
  const catalog = await anon.newPage();
  await catalog.goto(`${APP}/s/${slug}`);
  await catalog.waitForLoadState("networkidle");
  const card = catalog.locator("a").filter({ hasText: PRODUCT }).first();
  check("catálogo público muestra el producto sin sesión", (await card.count()) === 1);
  check("catálogo público muestra el precio en lempiras", (await catalog.getByText(/450[.,]50/).count()) >= 1);

  // La ficha: se llega tocando la card, como haría el comprador por WhatsApp.
  await card.click();
  const onProduct = await catalog
    .waitForURL(/\/s\/.+\/.+/, { timeout: 15000 })
    .then(() => true, () => false);
  await catalog.waitForLoadState("networkidle");
  check("la ficha del producto abre", onProduct, catalog.url());
  const productPageUrl = catalog.url();
  const productSlug = new URL(productPageUrl).pathname.split("/").pop();
  const waHref = await catalog
    .locator("a[data-wa-label='Pedir por WhatsApp']")
    .first()
    .getAttribute("href", { timeout: 10000 })
    .catch(() => null);
  const waText = waHref ? decodeURIComponent(waHref.split("text=")[1] ?? "") : "";
  check("el botón de WhatsApp apunta a wa.me", Boolean(waHref?.startsWith("https://wa.me/")), waHref?.slice(0, 60));
  check(
    "el mensaje pre-armado menciona la tienda y el producto",
    waText.includes("Tienda E2E") && waText.includes(PRODUCT),
    waText.slice(0, 80),
  );

  const missing = await anon.newPage();
  const missingResponse = await missing.goto(`${APP}/s/no-existe-${Date.now()}`);
  check("tienda inexistente responde 404", missingResponse?.status() === 404, `HTTP ${missingResponse?.status()}`);

  // ---------------------------------------------------------------
  // 9. Subdominio de tienda: el rewrite conserva la URL y la CSP con nonce se aplica
  //    en el navegador (Chromium resuelve *.localhost a loopback sin configurar DNS).
  //    Se usa el subdominio real de la tienda publicada.
  // ---------------------------------------------------------------
  const appPort = new URL(APP).port || "80";
  const tenantUrl = `http://${slug}.app.localhost:${appPort}/`;
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
  check("subdominio no redirige (URL del navegador intacta)", new URL(sub.url()).hostname === `${slug}.app.localhost`);
  check("el subdominio muestra el catálogo de la tienda", (await sub.getByText(PRODUCT).count()) >= 1);
  check("sin violaciones CSP en subdominio", subCsp.length === 0, subCsp[0]?.slice(0, 120));

  // ---------------------------------------------------------------
  // 10. Subida de imagen (solo con clave privada de ImageKit)
  //     El flujo comprime en el navegador, sube directo a ImageKit y
  //     confirma con el peso real. Sin IMAGEKIT_PRIVATE_KEY se omite.
  // ---------------------------------------------------------------
  if (process.env.IMAGEKIT_PRIVATE_KEY) {
    await page.goto(`${APP}/products/${productSlug}`);
    await page.locator("#product-images").waitFor({ timeout: 15000 });

    const sample = readFileSync(join(FIXTURES, "sample.png"));
    const commitResponse = page.waitForResponse(
      (r) => r.url().includes("/api/upload-commit") && r.request().method() === "POST",
      { timeout: 30000 },
    );
    await page.locator("#product-images").setInputFiles({
      name: "foto-producto.png",
      mimeType: "image/png",
      buffer: sample,
    });

    const thumbnail = page.locator('li img[src*="tr=w-"]');
    const uploaded = await thumbnail
      .first()
      .waitFor({ timeout: 30000 })
      .then(() => true, () => false);
    check("la imagen se sube y se ve la miniatura", uploaded);

    const commit = await commitResponse.then((r) => r.json()).catch(() => null);
    check("el commit registra el peso real del archivo", (commit?.size ?? 0) > 0, `${commit?.size} bytes`);

    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await page.waitForLoadState("networkidle");
    await page.reload();
    const persisted = await page.locator('li img[src*="tr=w-"]').count();
    check("la imagen persiste tras recargar", persisted >= 1, `${persisted} miniatura(s)`);

    // La cuenta de bytes de la tienda sube con el peso real del archivo.
    const catalogImage = await anon.newPage();
    await catalogImage.goto(`${APP}/s/${slug}`);
    await catalogImage.waitForLoadState("networkidle");
    const publicImage = await catalogImage.locator('img[src*="tr=w-"]').count();
    check("el catálogo público muestra la imagen", publicImage >= 1, `${publicImage} imagen(es)`);

    // ---- Borrado (tarea 3.4): DAM, caché y cuota ----
    const thumbSrc = await page.locator('li img[src*="tr=w-"]').first().getAttribute("src");
    const fileId = thumbSrc.split("?")[0].split("/").pop();
    const damUrl = `https://api.imagekit.io/v1/files/${fileId}/details`;
    const auth = `Basic ${Buffer.from(`${process.env.IMAGEKIT_PRIVATE_KEY}:`).toString("base64")}`;
    const inDam = await fetch(damUrl, { headers: { Accept: "application/json", Authorization: auth } });
    check("el archivo existe en el DAM", inDam.status === 200, `HTTP ${inDam.status}`);

    const deleteResponse = page.waitForResponse(
      (r) => r.url().includes("/api/upload-delete") && r.request().method() === "POST",
      { timeout: 30000 },
    );
    await page.locator("li button", { hasText: "Quitar" }).first().click();
    const deleted = await deleteResponse.then((r) => r.json()).catch(() => null);
    await page.waitForTimeout(1500);

    const afterDelete = await page.locator("li img").count();
    check("la imagen se quita del producto", afterDelete === 0, `${afterDelete} miniatura(s)`);
    check(
      "el borrado devuelve los bytes liberados",
      deleted?.ok === true && deleted?.freedBytes === commit?.size,
      `${deleted?.freedBytes} vs ${commit?.size}`,
    );

    const goneFromDam = await fetch(damUrl, { headers: { Accept: "application/json", Authorization: auth } });
    check("el archivo se borra del DAM", goneFromDam.status === 404, `HTTP ${goneFromDam.status}`);
  } else {
    console.log("INFO  subida de imagen omitida: falta IMAGEKIT_PRIVATE_KEY");
  }

  // ---------------------------------------------------------------
  // 11. Panel: resumen real de la tienda
  // ---------------------------------------------------------------
  await page.goto(`${APP}/panel`);
  await page.waitForLoadState("networkidle");
  check("el panel muestra el resumen de la tienda", (await page.getByText("Tu catálogo").count()) >= 1);
  check("el panel muestra el enlace público", (await page.getByText(`/s/${slug}`).count()) >= 1);

  // ---------------------------------------------------------------
  // 12. Ajustes: datos de la tienda, plan y enlace público
  // ---------------------------------------------------------------
  await page.goto(`${APP}/ajustes`);
  await page.locator("#store-name").waitFor({ timeout: 15000 });
  check("ajustes muestra el plan y el uso", (await page.getByText("Tu plan").count()) >= 1);

  await page.locator("#store-name").fill("Tienda E2E Ajustada");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page.waitForTimeout(2000);
  await page.reload();
  await page.locator("#store-name").waitFor({ timeout: 15000 });
  check(
    "el nombre de la tienda se guarda",
    (await page.locator("#store-name").inputValue()) === "Tienda E2E Ajustada",
  );

  // ---------------------------------------------------------------
  // 13. Categorías: crear, asignar al producto y quitar
  //     Quitar la categoría es el caso que update_product no resolvía.
  // ---------------------------------------------------------------
  await page.goto(`${APP}/categorias`);
  await page.locator("#new-category").waitFor({ timeout: 15000 });
  await page.locator("#new-category").fill("Zapatos E2E");
  await page.getByRole("button", { name: "Crear" }).click();
  await page.waitForTimeout(2500);
  check("la categoría se crea", (await page.getByText("/zapatos-e2e").count()) >= 1);

  await page.goto(`${APP}/products/${productSlug}`);
  await page.locator("#category").waitFor({ timeout: 15000 });
  const categoryOptions = await page.locator("#category option").allTextContents();
  check(
    "el editor lista la categoría nueva",
    categoryOptions.some((o) => o.includes("Zapatos E2E")),
    categoryOptions.join(" | "),
  );

  // Asignada: el producto aparece al filtrar por esa categoría.
  await page.locator("#category").selectOption({ label: "Zapatos E2E" });
  await page.waitForTimeout(2500);

  const filtered = await anon.newPage();
  await filtered.goto(`${APP}/s/${slug}?c=zapatos-e2e`);
  await filtered.waitForLoadState("networkidle");
  check(
    "el catálogo filtra por la categoría asignada",
    (await filtered.getByText(PRODUCT).count()) >= 1,
  );

  // Quitarla: el producto deja de aparecer en el filtro. Es el caso que
  // update_product no resolvía (null = conservar, no = quitar).
  await page.locator("#category").selectOption("");
  await page.waitForTimeout(2500);

  const unfiltered = await anon.newPage();
  await unfiltered.goto(`${APP}/s/${slug}?c=zapatos-e2e`);
  await unfiltered.waitForLoadState("networkidle");
  check(
    "quitar la categoría saca el producto del filtro",
    (await unfiltered.getByText(PRODUCT).count()) === 0,
  );

  // ---------------------------------------------------------------
  // 14. Variantes: crear, validar duplicados, descuento, borrar y la regla
  //     de la última variante activa. Las reglas viven en la base; aquí se
  //     comprueba que la UI las muestra.
  // ---------------------------------------------------------------
  await page.goto(`${APP}/products/${productSlug}`);
  await page.getByText("Variantes").first().waitFor({ timeout: 15000 });

  const saveVariantForm = async ({ attr, price, stock, discountType, discountValue, madeToOrder }) => {
    await page.getByRole("button", { name: "Nueva variante" }).click();
    await page.getByLabel("Nombre del atributo 1").fill("Talle");
    await page.getByLabel("Valor del atributo 1").fill(attr);
    await page.locator("#variant-price").fill(price);
    if (discountType) {
      await page.locator("#variant-discount-type").selectOption(discountType);
      await page.locator("#variant-discount-value").fill(discountValue);
    }
    if (madeToOrder) {
      await page.locator("#variant-made-to-order").click();
    } else if (stock !== undefined) {
      await page.locator("#variant-stock").fill(stock);
    }
    await page.getByRole("button", { name: "Guardar variante" }).click();
    await page.waitForTimeout(2000);
  };

  // Stock vacío sin "por encargo": el error sale en el formulario, antes de enviar.
  await page.getByRole("button", { name: "Nueva variante" }).click();
  await page.getByLabel("Nombre del atributo 1").fill("Talle");
  await page.getByLabel("Valor del atributo 1").fill("XS");
  await page.locator("#variant-price").fill("400");
  const stockHint = await page
    .getByText("Indica el stock o marca la variante como por encargo.")
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  check("sin stock el formulario avisa antes de enviar", stockHint);
  check(
    "el botón guardar queda deshabilitado sin stock",
    await page.getByRole("button", { name: "Guardar variante" }).isDisabled(),
  );
  await page.getByRole("button", { name: "Cancelar" }).click();

  // La presentación única activa (la del onboarding) se oculta sola al crear una talla.
  await saveVariantForm({ attr: "M", price: "500", stock: "3" });
  check("crear variante M con stock aparece en la lista", (await page.getByText("Talle M").count()) >= 1);
  check("la variante muestra su stock", (await page.getByText("3 en stock").count()) >= 1);
  check(
    "la presentación única se oculta al crear una talla",
    (await page.getByText("Oculta").count()) >= 1,
  );

  await saveVariantForm({ attr: "L", price: "600", discountType: "percent", discountValue: "10", madeToOrder: true });
  check("el descuento porcentual calcula el precio final (540.00)", (await page.getByText(/540[.,]00/).count()) >= 1);
  check("sin stock fijo la variante queda por encargo", (await page.getByText("Por encargo").count()) >= 1);

  // Duplicado: misma combinación que M. La base lo rechaza con mensaje claro.
  await page.getByRole("button", { name: "Nueva variante" }).click();
  await page.getByLabel("Nombre del atributo 1").fill("Talle");
  await page.getByLabel("Valor del atributo 1").fill("M");
  await page.locator("#variant-price").fill("550");
  // Con stock explícito, la validación llega a la regla de duplicados.
  await page.locator("#variant-stock").fill("5");
  await page.getByRole("button", { name: "Guardar variante" }).click();
  const duplicateShown = await page
    .getByText("ya existe una variante con esos atributos")
    .first()
    .waitFor({ timeout: 10000 })
    .then(() => true, () => false);
  check("una combinación repetida se rechaza", duplicateShown);
  await page.getByRole("button", { name: "Cancelar" }).click();

  // Ficha pública: las variantes activas aparecen como opciones.
  const variantPage = await anon.newPage();
  await variantPage.goto(`${APP}/s/${slug}/${productSlug}`);
  await variantPage.waitForLoadState("networkidle");
  check(
    "la ficha pública ofrece la talla M",
    (await variantPage.getByRole("button", { name: "M", exact: true }).count()) >= 1,
  );
  check(
    "la ficha pública ofrece la talla L",
    (await variantPage.getByRole("button", { name: "L", exact: true }).count()) >= 1,
  );

  // Borrar L: confirmación del navegador y la variante desaparece.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Eliminar Talle L" }).click();
  await page.waitForTimeout(2000);
  check("borrar una variante la quita de la lista", (await page.getByText("Talle L").count()) === 0);

  // Regla: M es la única activa, así que su interruptor queda deshabilitado.
  await page.getByRole("button", { name: "Editar Talle M" }).click();
  check(
    "la última variante activa no se puede ocultar",
    await page.locator("#variant-active").isDisabled(),
  );
  await page.getByRole("button", { name: "Cancelar" }).click();

  // Regla: no se puede volver a una presentación única mientras haya tallas activas.
  await page.getByRole("button", { name: "Editar Única" }).click();
  await page.locator("#variant-active").click();
  await page.getByRole("button", { name: "Guardar variante" }).click();
  const mixRejected = await page
    .getByText("tiene tallas o colores activos")
    .first()
    .waitFor({ timeout: 10000 })
    .then(() => true, () => false);
  check("no se puede volver a presentación única con tallas activas", mixRejected);
  await page.getByRole("button", { name: "Cancelar" }).click();

  // ---------------------------------------------------------------
  // 15. Etiquetas: crear, asignar a un producto, chip con color y filtro
  // ---------------------------------------------------------------
  await page.goto(`${APP}/etiquetas`);
  await page.locator("#new-tag").waitFor({ timeout: 15000 });
  await page.locator("#new-tag").fill("Oferta E2E");
  await page.getByRole("button", { name: "Crear etiqueta" }).click();
  await page.waitForTimeout(2000);
  check("la etiqueta se crea", (await page.getByText("Oferta E2E").count()) >= 1);

  await page.goto(`${APP}/products/${productSlug}`);
  await page.locator("#tag").waitFor({ timeout: 15000 });
  const tagOptions = await page.locator("#tag option").allTextContents();
  check(
    "el editor lista la etiqueta nueva",
    tagOptions.some((o) => o.includes("Oferta E2E")),
    tagOptions.join(" | "),
  );

  await page.locator("#tag").selectOption({ label: "Oferta E2E" });
  await page.waitForTimeout(2500);

  const tagged = await anon.newPage();
  await tagged.goto(`${APP}/s/${slug}`);
  await tagged.waitForLoadState("networkidle");
  check("el catálogo público muestra la etiqueta del producto", (await tagged.getByText("Oferta E2E").count()) >= 1);

  // Filtro por etiqueta: el chip aparece y el producto sigue visible.
  await tagged.goto(`${APP}/s/${slug}?e=oferta-e2e`);
  await tagged.waitForLoadState("networkidle");
  check(
    "el filtro por etiqueta muestra el producto etiquetado",
    (await tagged.getByText(PRODUCT).count()) >= 1,
  );

  // Quitar la etiqueta la saca del filtro.
  await page.locator("#tag").selectOption("");
  await page.waitForTimeout(2500);
  const untagged = await anon.newPage();
  await untagged.goto(`${APP}/s/${slug}?e=oferta-e2e`);
  await untagged.waitForLoadState("networkidle");
  check(
    "quitar la etiqueta saca el producto del filtro",
    (await untagged.getByText(PRODUCT).count()) === 0,
  );

  // ---------------------------------------------------------------
  // 16. Alta de producto desde el panel y filtros de la lista
  // ---------------------------------------------------------------
  await page.goto(`${APP}/products/nuevo`);
  await page.locator("#new-name").waitFor({ timeout: 15000 });
  await page.locator("#new-name").fill("Producto Nuevo E2E");
  await page.locator("#new-price").fill("325");
  await page.locator("#new-stock").fill("4");
  await page.getByRole("button", { name: "Crear producto" }).click();
  await page.waitForURL(/\/products\/.+/, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
  check("crear producto lleva a su ficha", /\/products\/.+/.test(new URL(page.url()).pathname), page.url());
  check(
    "el producto creado aparece en la ficha",
    (await page.locator("#name").inputValue()) === "Producto Nuevo E2E",
  );

  // El precio del alta es el de la variante creada.
  check(
    "la variante del producto nuevo tiene el precio indicado",
    (await page.getByText(/325[.,]00/).count()) >= 1,
  );

  // Un segundo producto con el mismo nombre no choca: el slug lleva sufijo.
  await page.goto(`${APP}/products/nuevo`);
  await page.locator("#new-name").fill("Producto Nuevo E2E");
  await page.locator("#new-price").fill("325");
  await page.locator("#new-stock").fill("4");
  await page.getByRole("button", { name: "Crear producto" }).click();
  await page.waitForURL(/\/products\/.+/, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
  check(
    "un nombre repetido genera un slug con sufijo",
    /producto-nuevo-e2e-2/.test(new URL(page.url()).pathname),
    new URL(page.url()).pathname,
  );

  // Filtros de la lista del panel.
  await page.goto(`${APP}/products`);
  await page.locator("#product-search").waitFor({ timeout: 15000 });
  const totalRows = await page.locator("tbody tr").count();
  check("la lista muestra los productos", totalRows >= 2, `${totalRows} filas`);

  await page.locator("#product-search").fill("Producto Nuevo E2E");
  await page.waitForTimeout(500);
  const filteredRows = await page.locator("tbody tr").count();
  check("el buscador filtra por nombre", filteredRows === 2, `${filteredRows} filas`);

  await page.locator("#product-search").fill("no-existe-este-producto");
  await page.waitForTimeout(500);
  check(
    "un buscador sin resultados avisa",
    (await page.getByText("Ningún producto coincide con el filtro.").count()) === 1,
  );
  await page.locator("#product-search").fill("");
  await page.waitForTimeout(500);

  // Filtro por estado: los productos nuevos son visibles.
  await page.locator('select[aria-label="Filtrar por estado"]').selectOption("hidden");
  await page.waitForTimeout(500);
  const hiddenRows = await page.locator("tbody tr").count();
  check("el filtro de estado oculta los visibles", hiddenRows === 0, `${hiddenRows} filas`);
  await page.locator('select[aria-label="Filtrar por estado"]').selectOption("all");
  await page.waitForTimeout(500);

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
