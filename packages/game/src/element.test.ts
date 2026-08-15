import { describe, expect, it } from "vitest";
import { ELEMENT_ADVANTAGE } from "@bunnydex/config";

describe("element advantage", () => {
  it("fire beats nature", () => {
    expect(ELEMENT_ADVANTAGE.fire).toBe("nature");
  });
});
