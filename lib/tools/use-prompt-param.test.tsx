import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  readPromptParam,
  usePromptParamState,
} from "@/lib/tools/use-prompt-param";

describe("prompt param helpers", () => {
  it("reads a prompt query param with fallback", () => {
    window.history.replaceState(null, "", "/tools/test?prompt=dub%20clip");

    expect(readPromptParam("fallback")).toBe("dub clip");
  });

  it("uses the fallback when prompt is absent", () => {
    window.history.replaceState(null, "", "/tools/test");

    expect(readPromptParam("fallback")).toBe("fallback");
  });

  it("hydrates a client prompt state from the URL", () => {
    window.history.replaceState(null, "", "/tools/test?prompt=tool%20prompt");

    function Harness() {
      const [prompt] = usePromptParamState("fallback prompt");
      return <div>{prompt}</div>;
    }

    render(<Harness />);

    expect(screen.getByText("tool prompt")).toBeInTheDocument();
  });
});
