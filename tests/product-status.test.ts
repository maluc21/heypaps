import { describe, expect, it } from "vitest";
import { getProductStatus } from "@/lib/product-status";

describe("product table status", () => {
  it("uses the same three states as the editor", () => {
    expect(getProductStatus({ active: true, paused: false })).toBe("available");
    expect(getProductStatus({ active: true, paused: true })).toBe("unavailable");
    expect(getProductStatus({ active: false, paused: false })).toBe("hidden");
  });
});
