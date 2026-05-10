import { describe, expect, it, vi } from "vitest";

import {
  createTransportController,
  type TransportLike,
} from "@/lib/audio/transport";

describe("transport controller", () => {
  it("clamps bpm and swing before touching the transport", () => {
    const transport: TransportLike = {
      bpm: { value: 120 },
      swing: 0,
      swingSubdivision: "8n",
      start: vi.fn(),
      stop: vi.fn(),
      cancel: vi.fn(),
    };
    const controller = createTransportController(transport);

    controller.setBpm(300);
    controller.setSwing(0.8);

    expect(transport.bpm.value).toBe(260);
    expect(transport.swing).toBe(0.5);
    expect(transport.swingSubdivision).toBe("16n");
  });

  it("starts and fully stops transport state", () => {
    const transport: TransportLike = {
      bpm: { value: 120 },
      swing: 0,
      swingSubdivision: "16n",
      start: vi.fn(),
      stop: vi.fn(),
      cancel: vi.fn(),
    };
    const controller = createTransportController(transport);

    controller.start();
    controller.stop();

    expect(transport.start).toHaveBeenCalledOnce();
    expect(transport.stop).toHaveBeenCalledOnce();
    expect(transport.cancel).toHaveBeenCalledOnce();
  });
});
