import type { RenderResponse } from "../types";

export class RenderCoordinator {
  private latestRequestId = 0;

  begin(): number {
    this.latestRequestId += 1;
    return this.latestRequestId;
  }

  accepts(response: Pick<RenderResponse, "requestId">): boolean {
    return response.requestId === this.latestRequestId;
  }

  get currentRequestId(): number {
    return this.latestRequestId;
  }
}
