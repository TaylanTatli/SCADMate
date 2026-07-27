import { describe, expect, it } from "vitest";
import { formatUnknownError } from "./errors";

describe("formatUnknownError", () => {
  it("uses a message carried by a non-Error object", () => {
    expect(formatUnknownError({ message: "Parser failed" })).toBe(
      "Parser failed",
    );
  });

  it("does not expose an unhelpful object string", () => {
    expect(formatUnknownError({}, "Compilation failed")).toBe(
      "Compilation failed",
    );
  });
});
