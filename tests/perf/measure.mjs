/**
 * Medicion de rendimiento en condiciones de movil.
 *
 *   node --env-file=.env.local tests/perf/measure.mjs
 *
 * Condiciones: viewport de 390x844 con DPR 3, CPU 4x mas lenta y red Fast 3G
 * (1,6 Mbps de bajada, 150 ms de RTT), que es donde se nota la diferencia
 * entre una app y una web.
 *
 * Mide por escenario: TTFB (cuando empieza a llegar la respuesta), FCP, LCP,
 * CLS, el peso de la respuesta y cuanto tarda en aparecer el contenido util.
 *
 * Cada escenario se mide 3 veces y se reporta la mediana: el primer impacto
 * de una ruta en Next compila y renderiza, y no es representativo.
 */

import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";

const APP = process.env.E2E_APP_URL ?? "http://localhost:3000";
const SEED_FILE = join(tmpdir(), "kilo", "perf-seed.json");
const CHROME = process.env.E2E_CHROME_PATH || undefined;

const REPETICIONES = 3;

// Fast 3G, las cifras de Lighthouse.
const RED = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};
const CPU = 4;

const seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));

/** Observadores de metricas de pintura, instalados antes de navegar. */
const INSTRUMENTAR = () => {
  window.__metricas = { lcp: 0, cls: 0, fcp: 0 };
  try {
    new PerformanceObserver((lista) => {
      for (const entrada of lista.getEntries()) window.__metricas.lcp = entrada.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((lista) => {
      for (const entrada of lista.getEntries()) {
        if (!entrada.hadRecentInput) window.__metricas.cls += entrada.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((lista) => {
      for (const entrada of lista.getEntries()) {
        if (entrada.name === "first-contentful-paint") window.__metricas.fcp = entrada.startTime;
      }
    }).observe({ type: "paint", buffered: true });
  } catch {}
};

async function medir(page, url, selectorUtil) {
  await page.addInitScript(INSTRUMENTAR);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  // Sin esto el navegador sirve la segunda visita desde su cache y mide un
  // falso TTFB de 5 ms.
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", RED);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });

  // Los recursos se miden por la respuesta: performance.getEntriesByType
  // ("resource") no es fiable con la red emulada.
  const recursos = { js: 0, css: 0, img: 0, otro: 0, count: 0, bytes: 0 };
  const onResponse = async (respuesta) => {
    try {
      const cuerpo = await respuesta.body();
      const kb = cuerpo.length / 1024;
      const tipo = respuesta.headers()["content-type"] ?? "";
      recursos.bytes += kb;
      recursos.count += 1;
      if (tipo.includes("javascript")) recursos.js += kb;
      else if (tipo.includes("css")) recursos.css += kb;
      else if (tipo.startsWith("image/")) recursos.img += kb;
      else recursos.otro += kb;
    } catch {}
  };
  page.on("response", onResponse);

  const inicio = Date.now();
  const respuesta = await page.goto(url, { waitUntil: "load" });

  let util = null;
  if (selectorUtil) {
    try {
      await page.locator(selectorUtil).first().waitFor({ state: "visible", timeout: 20000 });
      util = Date.now() - inicio;
    } catch {
      util = null;
    }
  }

  const metricas = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] ?? {};
    const m = window.__metricas ?? {};
    return {
      ttfb: nav.responseStart ?? 0,
      domContentLoaded: nav.domContentLoadedEventEnd ?? 0,
      load: nav.loadEventEnd ?? 0,
      fcp: m.fcp ?? 0,
      lcp: m.lcp ?? 0,
      cls: m.cls ?? 0,
      transferido: nav.transferSize ?? 0,
      recursos: nav.decodedBodySize ?? 0,
    };
  });

  page.off("response", onResponse);
  await cdp.detach();
  return {
    status: respuesta?.status() ?? 0,
    util,
    ...metricas,
    porTipo: recursos,
  };
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const contexto = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});

const pagina = await contexto.newPage();

// Sesion real del dueno de la tienda de prueba: el mismo camino que usa la
// E2E (magic link -> cookies de Supabase).
const archivoSesion = join(tmpdir(), "kilo", "perf-session.json");
execFileSync(
  "node",
  ["tests/e2e/session-bootstrap.mjs", seed.email, archivoSesion],
  { stdio: "pipe", shell: process.platform === "win32", env: process.env },
);
const cookiesSesion = JSON.parse(readFileSync(archivoSesion, "utf8"));
await contexto.addCookies(
  cookiesSesion.map((c) => ({
    name: c.name,
    value: c.value,
    domain: "localhost",
    path: "/",
    secure: false,
    httpOnly: false,
    expires: Math.floor(Date.now() / 1000) + 3600,
  })),
);
console.log(`sesion lista con ${cookiesSesion.length} cookie(s)\n`);

const escenarios = [
  {
    nombre: "landing (casi estática)",
    url: `${APP}/`,
    selector: "h1",
  },
  {
    nombre: "catálogo público (anónimo)",
    url: `${APP}/s/${seed.slug}`,
    selector: "a[href^='/s/']",
  },
  {
    nombre: "catálogo con filtro de categoría",
    url: `${APP}/s/${seed.slug}?c=zapatos`,
    selector: "a[href^='/s/']",
  },
  {
    nombre: "ficha de producto (anónimo)",
    url: `${APP}/s/${seed.slug}/producto-1`,
    selector: "h1",
  },
  {
    nombre: "panel (con sesión)",
    url: `${APP}/panel`,
    selector: "h2",
  },
  {
    nombre: "lista de productos (con sesión)",
    url: `${APP}/products`,
    selector: "tbody tr",
  },
];

const resultados = [];

for (const escenario of escenarios) {
  // Calentamiento: la primera peticion compila y renderiza la ruta.
  await medir(pagina, escenario.url, null);

  const muestras = [];
  for (let i = 0; i < REPETICIONES; i++) {
    muestras.push(await medir(pagina, escenario.url, escenario.selector));
  }

  const mediana = (clave) => {
    const valores = muestras.map((m) => m[clave]).filter((v) => typeof v === "number" && v > 0).sort((a, b) => a - b);
    if (valores.length === 0) return null;
    return valores[Math.floor(valores.length / 2)];
  };

  const resultado = {
    nombre: escenario.nombre,
    status: muestras[0].status,
    ttfb: mediana("ttfb"),
    fcp: mediana("fcp"),
    lcp: mediana("lcp"),
    util: mediana("util"),
    cls: Number(mediana("cls")?.toFixed(4) ?? 0),
    kb: Math.round((mediana("transferido") ?? 0) / 1024),
    js: Math.round(muestras[0].porTipo.js),
    css: Math.round(muestras[0].porTipo.css),
    img: Math.round(muestras[0].porTipo.img),
    otro: Math.round(muestras[0].porTipo.otro),
    recursos: muestras[0].porTipo.count,
  };
  resultados.push(resultado);

  console.log(
    `${resultado.nombre.padEnd(38)} status=${resultado.status} ` +
      `ttfb=${Math.round(resultado.ttfb ?? 0)}ms fcp=${Math.round(resultado.fcp ?? 0)}ms ` +
      `lcp=${Math.round(resultado.lcp ?? 0)}ms util=${resultado.util ?? "-"}ms ` +
      `cls=${resultado.cls} | js=${resultado.js}KB css=${resultado.css}KB img=${resultado.img}KB ` +
      `otro=${resultado.otro}KB doc=${resultado.kb}KB req=${resultado.recursos}`,
  );
}

await browser.close();

console.log(`\n${JSON.stringify(resultados, null, 2)}`);
