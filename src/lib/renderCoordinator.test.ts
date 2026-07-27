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

  it("rejects a late render result after cancellation invalidates it", () => {
    const coordinator = new RenderCoordinator();
    const active = coordinator.begin();
    coordinator.begin();

    expect(coordinator.accepts({ requestId: active })).toBe(false);
  });
});
