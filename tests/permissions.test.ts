/**
 * Matriz de permisos por rol (plan §5.1, lib/permissions.ts).
 */

import {
  can,
  canManageStore,
  canManageMembers,
  canManageBilling,
  canCreateProduct,
  canUpdateProduct,
  canDeleteProduct,
  canManageVariantStock,
  canManageCategory,
  canManageTag,
  canReadProduct,
  type StorePermission,
} from "@/lib/permissions";

describe("matriz de permisos", () => {
  it("owner tiene todos los permisos de tienda", () => {
    for (const perm of [
      "store.update",
      "store.delete",
      "member.manage",
      "billing.manage",
      "product.create",
      "product.update",
      "product.delete",
      "variant.stock",
      "category.manage",
      "tag.manage",
      "product.read",
    ] as StorePermission[]) {
      expect(can("owner", perm)).toBe(true);
    }
  });

  it("editor puede crear/actualizar productos, gestionar stock/categorías/etiquetas, leer", () => {
    expect(can("editor", "product.create")).toBe(true);
    expect(can("editor", "product.update")).toBe(true);
    expect(can("editor", "variant.stock")).toBe(true);
    expect(can("editor", "category.manage")).toBe(true);
    expect(can("editor", "tag.manage")).toBe(true);
    expect(can("editor", "product.read")).toBe(true);
    expect(can("editor", "product.delete")).toBe(false);
    expect(can("editor", "store.delete")).toBe(false);
    expect(can("editor", "member.manage")).toBe(false);
  });

  it("viewer solo puede leer productos", () => {
    expect(can("viewer", "product.read")).toBe(true);
    expect(can("viewer", "product.create")).toBe(false);
    expect(can("viewer", "product.update")).toBe(false);
    expect(can("viewer", "store.update")).toBe(false);
  });

  it("rol undefined nunca tiene permiso", () => {
    expect(can(undefined, "product.read")).toBe(false);
  });

  it("helpers de conveniencia", () => {
    expect(canManageStore("owner")).toBe(true);
    expect(canManageStore("editor")).toBe(false);
    expect(canManageMembers("owner")).toBe(true);
    expect(canManageBilling("owner")).toBe(true);
    expect(canCreateProduct("editor")).toBe(true);
    expect(canUpdateProduct("editor")).toBe(true);
    expect(canDeleteProduct("owner")).toBe(true);
    expect(canDeleteProduct("editor")).toBe(false);
    expect(canManageVariantStock("editor")).toBe(true);
    expect(canManageCategory("editor")).toBe(true);
    expect(canManageTag("editor")).toBe(true);
    expect(canReadProduct("viewer")).toBe(true);
  });
});
