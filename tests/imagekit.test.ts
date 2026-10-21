/**
 * Firma de subida de ImageKit y helpers de URL.
 *
 * La firma se valida contra el SDK oficial de ImageKit, que firma exactamente
 * así: createHmac("sha1", privateKey).update(token + expire).digest("hex").
 */

import { describe, expect, it } from "vitest";
import { getUploadAuthParams, signUpload } from "@/lib/imagekit-admin";
import {
  imageKitFolder,
  imageKitStorePrefix,
  imageKitTransform,
} from "@/lib/imagekit";

describe("signUpload", () => {
  it("produce el HMAC-SHA1 en hex lowercase esperado", () => {
    // vector: HMAC-SHA1("private-test-key", "token-abc1700000000" + "1700000000")
    expect(signUpload("token-abc1700000000", 1700000000, "private-test-key")).toBe(
      "6f6ad9c77770f03634bf7be8a4a299e049a24ff9",
    );
  });

  it("cambia si cambia el token, el expire o la clave", () => {
    const base = signUpload("token-abc1700000000", 1700000000, "private-test-key");
    expect(signUpload("token-xyz1700000000", 1700000000, "private-test-key")).not.toBe(base);
    expect(signUpload("token-abc1700000001", 1700000000, "private-test-key")).not.toBe(base);
    expect(signUpload("token-abc1700000000", 1700000000, "otra-clave")).not.toBe(base);
  });

  it("es determinista", () => {
    expect(signUpload("token-abc1700000000", 1700000000, "private-test-key")).toBe(
      signUpload("token-abc1700000000", 1700000000, "private-test-key"),
    );
  });
});

describe("getUploadAuthParams", () => {
  it("devuelve token, expire y firma coherentes", () => {
    const params = getUploadAuthParams("private-test-key", 60, "token-fijo");
    expect(params.token).toBe("token-fijo");
    expect(params.signature).toBe(
      signUpload("token-fijo", params.expire, "private-test-key"),
    );
  });

  it("expira en menos de una hora", () => {
    const params = getUploadAuthParams("private-test-key", 60);
    const seconds = params.expire - Math.floor(Date.now() / 1000);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(60);
  });

  it("genera un token distinto cada vez", () => {
    const a = getUploadAuthParams("private-test-key");
    const b = getUploadAuthParams("private-test-key");
    expect(a.token).not.toBe(b.token);
  });
});

describe("rutas de ImageKit", () => {
  it("la carpeta de la tienda usa el id de la tienda", () => {
    expect(imageKitFolder("abc-123")).toBe("stores/abc-123");
    expect(imageKitStorePrefix("abc-123")).toBe("/stores/abc-123/");
  });

  it("la transformación limita ancho, calidad y formato", () => {
    expect(imageKitTransform(800)).toBe("tr=w-800,q-75,f-auto");
  });
});
