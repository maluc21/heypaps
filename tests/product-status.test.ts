import { describe, expect, it } from "vitest";
import { getProductStatus } from "@/lib/product-status";

describe("product table status", () => {
  it("uses hidden and paused states before inventory", () => {
    expect(
      getProductStatus({ active: false, paused: false, variants: [{ active: true, stock: 5 }] }),
    ).toBe("hidden");
    expect(
      getProductStatus({ active: true, paused: true, variants: [{ active: true, stock: 5 }] }),
    ).toBe("paused");
  });

  it("distinguishes stock, sold out, and made-to-order products", () => {
    expect(
      getProductStatus({ active: true, paused: false, variants: [{ active: true, stock: 4 }] }),
    ).toBe("in-stock");
    expect(
      getProductStatus({ active: true, paused: false, variants: [{ active: true, stock: 0 }] }),
    ).toBe("out-of-stock");
    expect(
      getProductStatus({ active: true, paused: false, variants: [{ active: true, stock: null }] }),
    ).toBe("made-to-order");
  });
});
