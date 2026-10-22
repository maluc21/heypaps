/**
 * Pruebas de seguridad de la capa pura (sin base de datos ni red).
 *
 * Qué cubre esta capa y qué NO:
 *   - Cubre las invariantes de seguridad que se pueden comprobar sin servidor:
 *     firma de subida de ImageKit, guarda de pertenencia del archivo, enlaces
 *     de WhatsApp, URL pública y ausencia de sumideros de HTML sin escapar.
 *   - NO sustituye a la E2E (tests/e2e/security.e2e.mjs) ni a la batería SQL
 *     (supabase/tests/security.sql): ahí se comprueba el comportamiento real
 *     de las RPC, de los endpoints y de la CSP.
 *
 * Un hallazgo solo cuenta si se demuestra con un test que falla o con una
 * reproducción explícita. Aquí la reproducción explícita de la firma de
 * subida (que no ata la carpeta de destino) está en
 * tests/e2e/security-upload.mjs, contra la API real de ImageKit.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { getUploadAuthParams, signUpload } from "@/lib/imagekit-admin";
import { imageKitStorePrefix } from "@/lib/imagekit";
import { buildWhatsAppUrl, normalizeWhatsAppPhone } from "@/lib/whatsapp";
import { isStoreSubdomain, publicUrl } from "@/lib/public-url";

// -----------------------------------------------------------------------------
// 1. Firma de subida de ImageKit
// -----------------------------------------------------------------------------

describe("firma de subida (ImageKit)", () => {
  it("la firma no ata la carpeta de destino: sirve para cualquier carpeta", () => {
    // La firma de ImageKit solo cubre token + expire. Eso significa que la
    // carpeta de destino NO forma parte de la firma: quien tenga una firma
    // válida puede subir a la carpeta que quiera. La reproducción real
    // (subir a /stores/{otraTienda}/ con una firma propia) está en
    // tests/e2e/security-upload.mjs.
    const params = getUploadAuthParams("clave-de-prueba", 60, "token-fijo");
    const firmaCarpetaA = signUpload(params.token, params.expire, "clave-de-prueba");
    const firmaCarpetaB = signUpload(params.token, params.expire, "clave-de-prueba");

    expect(firmaCarpetaA).toBe(firmaCarpetaB);
    expect(firmaCarpetaA).toBe(params.signature);
  });

  it("el token de un solo uso es un UUID (no se puede adivinar)", () => {
    const params = getUploadAuthParams("clave-de-prueba");
    expect(params.token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("la ventana de vida de la firma es de 60 segundos o menos", () => {
    const params = getUploadAuthParams("clave-de-prueba");
    const segundos = params.expire - Math.floor(Date.now() / 1000);
    expect(segundos).toBeGreaterThan(0);
    expect(segundos).toBeLessThanOrEqual(60);
  });
});

// -----------------------------------------------------------------------------
// 2. Guarda de pertenencia del archivo (la que sí protege el commit)
// -----------------------------------------------------------------------------

describe("pertenencia de un archivo a una tienda", () => {
  const TIENDA_A = "e6000000-0000-0000-0000-000000000001";
  const TIENDA_B = "e6000000-0000-0000-0000-000000000002";
  const prefijoA = imageKitStorePrefix(TIENDA_A);
  const prefijoB = imageKitStorePrefix(TIENDA_B);

  it("el prefijo es la carpeta /stores/{id}/ de la tienda", () => {
    expect(prefijoA).toBe(`/stores/${TIENDA_A}/`);
    expect(prefijoA.startsWith("/stores/")).toBe(true);
    expect(prefijoA.endsWith("/")).toBe(true);
  });

  it("un archivo de la carpeta de A no cuenta como de B", () => {
    const ruta = `${prefijoA}foto.jpg`;
    expect(ruta.startsWith(prefijoA)).toBe(true);
    expect(ruta.startsWith(prefijoB)).toBe(false);
  });

  it("una tienda cuyo id empieza por el de A tampoco captura sus archivos", () => {
    // El id es un uuid de longitud fija, pero la guarda no debe depender de
    // esa suposición: la barra final separa el id de la carpeta.
    const prefijoHermano = imageKitStorePrefix(`${TIENDA_A}-extra`);
    expect(`${prefijoHermano}foto.jpg`.startsWith(prefijoA)).toBe(false);
  });

  it("un archivo fuera de /stores/ no pertenece a ninguna tienda", () => {
    const rutas = ["/logo.png", "foto.jpg", "/otra-carpeta/foto.jpg", "/stores//foto.jpg"];
    for (const ruta of rutas) {
      expect(ruta.startsWith(prefijoA)).toBe(false);
    }
  });
});

// -----------------------------------------------------------------------------
// 3. Enlaces de WhatsApp: ningún esquema inyectable
// -----------------------------------------------------------------------------

describe("enlace de WhatsApp", () => {
  it("siempre es https://wa.me/ con el mensaje codificado", () => {
    const url = buildWhatsAppUrl("+504 1234-5678", "Hola Tienda 👋");
    expect(url.startsWith("https://wa.me/50412345678?text=")).toBe(true);
  });

  it("un teléfono malicioso no puede inyectar otro esquema", () => {
    // El dueño de la tienda controla el número: solo pueden quedar dígitos.
    for (const telefono of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "//evil.example.com",
      "'><img src=x onerror=alert(1)>",
    ]) {
      const url = buildWhatsAppUrl(telefono, "mensaje");
      expect(url.startsWith("https://wa.me/")).toBe(true);
      expect(url).not.toContain("javascript:");
      expect(url).not.toContain("data:");
      expect(url).not.toContain("<");
    }
  });

  it("el mensaje se codifica en el query string", () => {
    const url = buildWhatsAppUrl("+50412345678", 'a&b=c "d" <script>');
    expect(url).not.toContain("<script>");
    expect(url).toContain("%3Cscript%3E");
  });

  it("normalizar el teléfono deja solo dígitos", () => {
    expect(normalizeWhatsAppPhone("+504 (1234) 567-8")).toBe("50412345678");
    expect(normalizeWhatsAppPhone("javascript:alert(1)")).toBe("1");
  });
});

// -----------------------------------------------------------------------------
// 4. URL pública: los subdominios reservados no son tiendas
// -----------------------------------------------------------------------------

describe("URL pública de la tienda", () => {
  it("los subdominios reservados de la aplicación no son tiendas", () => {
    for (const host of [
      "app.catalogo.com",
      "super.catalogo.com",
      "www.catalogo.com",
      "api.catalogo.com",
      "admin.catalogo.com",
      "cdn.catalogo.com",
      "mail.catalogo.com",
      "staging.catalogo.com",
    ]) {
      expect(isStoreSubdomain(host)).toBe(false);
    }
  });

  it("un host con menos de tres partes no es un subdominio de tienda", () => {
    expect(isStoreSubdomain("localhost")).toBe(false);
    expect(isStoreSubdomain("catalogo.com")).toBe(false);
    expect(isStoreSubdomain(null)).toBe(false);
  });

  it("un subdominio de tienda cualquiera sí lo es", () => {
    expect(isStoreSubdomain("tienda.catalogo.com")).toBe(true);
  });

  it("sin subdominio la URL canónica se construye sobre el origen de la app", () => {
    const url = publicUrl({
      host: "app.catalogo.com",
      appUrl: "https://catalogo.com/",
      storeSlug: "tienda",
      path: "/producto",
    });
    expect(url).toBe("https://catalogo.com/s/tienda/producto");
  });

  it("con subdominio la URL canónica conserva el host", () => {
    const url = publicUrl({
      host: "tienda.catalogo.com",
      appUrl: "https://catalogo.com",
      storeSlug: "tienda",
    });
    expect(url).toBe("https://tienda.catalogo.com");
  });
});

// -----------------------------------------------------------------------------
// 5. Ausencia de sumideros de HTML sin escapar
// -----------------------------------------------------------------------------

function listarFuentes(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const completa = path.join(dir, entrada);
    if (statSync(completa).isDirectory()) {
      salida.push(...listarFuentes(completa));
    } else if (/\.(ts|tsx)$/.test(entrada)) {
      salida.push(completa);
    }
  }
  return salida;
}

describe("sumideros de HTML sin escapar en la aplicación", () => {
  // vitest arranca con el raíz del proyecto como directorio de trabajo.
  const RAIZ = process.cwd();
  const fuentes = listarFuentes(path.join(RAIZ, "src"));

  it("hay código que revisar", () => {
    expect(fuentes.length).toBeGreaterThan(20);
  });

  it("ningún componente inserta HTML sin escapar", () => {
    const prohibido = /dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML|document\.write/;
    const infractores = fuentes
      .filter((f) => prohibido.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(RAIZ, f));
    expect(infractores).toEqual([]);
  });

  it("ningún módulo evalúa código en tiempo de ejecución", () => {
    const prohibido = /\beval\s*\(|new\s+Function\s*\(/;
    const infractores = fuentes
      .filter((f) => prohibido.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(RAIZ, f));
    expect(infractores).toEqual([]);
  });
});
