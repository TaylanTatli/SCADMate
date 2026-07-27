import { describe, expect, it } from "vitest";
import { RenderCoordinator } from "./renderCoordinator";

describe("stale render result rejection", () => {
  it("accepts only the most recently started render", () => {
    const coordinator = new RenderCoordinator();
    const first = coordinator.begin();
    const second = coordinator.begin();

    expect(coordinator.accepts({ requestId: first })).toBe(false);
    expect(coordinator.accepts({ requestId: second })).toBe(true);
  });
});
