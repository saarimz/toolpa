/* eslint-disable @next/next/no-img-element -- The local SVG owns its own animation timeline. */
"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Grip, Loader2, Send, X } from "lucide-react";

import { cn } from "@/lib/utils";

const characterSizePx = 112;
const dragThresholdPx = 5;

const sparks = [
  { x: "-44px", y: "-42px", delay: "0ms" },
  { x: "-10px", y: "-58px", delay: "35ms" },
  { x: "34px", y: "-50px", delay: "70ms" },
  { x: "58px", y: "-16px", delay: "20ms" },
  { x: "52px", y: "28px", delay: "80ms" },
  { x: "16px", y: "52px", delay: "45ms" },
  { x: "-28px", y: "48px", delay: "95ms" },
  { x: "-58px", y: "10px", delay: "55ms" },
];

type CopilotMessage = {
  role: "assistant" | "user";
  content: string;
};

type Position = {
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
};

type SparkStyle = CSSProperties & {
  "--spark-delay": string;
  "--spark-x": string;
  "--spark-y": string;
};

const starterMessage: CopilotMessage = {
  role: "assistant",
  content:
    "I'm Little Toolpa. I can help choose tools, shape prompts, and talk through production ideas.",
};

function createSparkStyle(spark: (typeof sparks)[number]): SparkStyle {
  return {
    "--spark-delay": spark.delay,
    "--spark-x": spark.x,
    "--spark-y": spark.y,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "Copilot could not respond.";
  }

  const error = (payload as Record<string, unknown>).error;
  return typeof error === "string" ? error : "Copilot could not respond.";
}

function getAssistantContent(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const message = (payload as Record<string, unknown>).message;
  if (!message || typeof message !== "object") {
    return null;
  }

  const role = (message as Record<string, unknown>).role;
  const content = (message as Record<string, unknown>).content;
  return role === "assistant" && typeof content === "string" ? content : null;
}

export function GeminiClippy() {
  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [burstId, setBurstId] = useState(0);
  const [isBursting, setIsBursting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([starterMessage]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!isBursting) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsBursting(false);
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [burstId, isBursting]);

  useEffect(() => {
    function clampToViewport() {
      setPosition((current) => {
        if (!current) {
          return current;
        }

        return clampPosition(current.x, current.y);
      });
    }

    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, []);

  function clampPosition(x: number, y: number) {
    return {
      x: clamp(x, 8, window.innerWidth - characterSizePx - 8),
      y: clamp(y, 8, window.innerHeight - characterSizePx - 8),
    };
  }

  function triggerBurst() {
    setBurstId((current) => current + 1);
    setIsBursting(true);
  }

  function openChat() {
    triggerBurst();
    setIsChatOpen(true);
  }

  function getCurrentPosition() {
    const rect = shellRef.current?.getBoundingClientRect();
    if (!rect) {
      return clampPosition(
        window.innerWidth - characterSizePx - 16,
        window.innerHeight - characterSizePx - 16,
      );
    }

    return clampPosition(rect.left, rect.top);
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }

    const current = getCurrentPosition();
    setPosition(current);
    setIsDragging(true);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: current.x,
      originY: current.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (
      Math.abs(deltaX) > dragThresholdPx ||
      Math.abs(deltaY) > dragThresholdPx
    ) {
      drag.moved = true;
    }

    if (drag.moved) {
      setPosition(clampPosition(drag.originX + deltaX, drag.originY + deltaY));
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (!drag.moved) {
      openChat();
    }
  }

  function handlePointerCancel(event: PointerEvent<HTMLButtonElement>) {
    dragRef.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleLauncherKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openChat();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isSending) {
      return;
    }

    const nextMessages: CopilotMessage[] = [
      ...messages,
      { role: "user", content },
    ];
    setMessages(nextMessages);
    setDraft("");
    setError(null);
    setIsSending(true);

    try {
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(payload));
      }

      const assistantContent = getAssistantContent(payload);
      if (!assistantContent) {
        throw new Error("Copilot returned an unreadable response.");
      }

      setMessages([...nextMessages, { role: "assistant", content: assistantContent }]);
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Copilot could not respond.",
      );
    } finally {
      setIsSending(false);
    }
  }

  const shellStyle: CSSProperties | undefined = position
    ? { left: position.x, top: position.y }
    : undefined;

  return (
    <div
      className={cn(
        "gemini-clippy-shell",
        position ? "gemini-clippy-shell--positioned" : null,
      )}
      ref={shellRef}
      style={shellStyle}
    >
      {isChatOpen ? (
        <section
          aria-label="Little Toolpa"
          className="gemini-clippy-chat"
          role="dialog"
        >
          <div className="gemini-clippy-chat-header">
            <div>
              <p className="gemini-clippy-chat-kicker">producer copilot</p>
              <h2 className="gemini-clippy-chat-title">Little Toolpa</h2>
            </div>
            <button
              aria-label="Close Little Toolpa"
              className="gemini-clippy-icon-button"
              onClick={() => setIsChatOpen(false)}
              type="button"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="gemini-clippy-messages">
            {messages.map((message, index) => (
              <div
                className={cn(
                  "gemini-clippy-message",
                  message.role === "user"
                    ? "gemini-clippy-message--user"
                    : "gemini-clippy-message--assistant",
                )}
                key={`${message.role}-${index}-${message.content.slice(0, 18)}`}
              >
                {message.content}
              </div>
            ))}
            {isSending ? (
              <div className="gemini-clippy-message gemini-clippy-message--assistant">
                <Loader2 className="size-3 animate-spin" />
                thinking
              </div>
            ) : null}
          </div>
          {error ? <p className="gemini-clippy-error">{error}</p> : null}
          <form className="gemini-clippy-form" onSubmit={handleSubmit}>
            <input
              aria-label="Message Little Toolpa"
              className="gemini-clippy-input"
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about a tool, mix move, groove, sound design, or arrangement..."
              type="text"
              value={draft}
            />
            <button
              aria-label="Send message"
              className="gemini-clippy-send"
              disabled={!draft.trim() || isSending}
              type="submit"
            >
              {isSending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </button>
          </form>
        </section>
      ) : null}
      <button
        aria-label="Open Little Toolpa"
        className={cn(
          "gemini-clippy-button",
          isDragging ? "gemini-clippy-button--dragging" : null,
        )}
        data-bursting={isBursting ? "true" : "false"}
        data-dragging={isDragging ? "true" : "false"}
        onKeyDown={handleLauncherKeyDown}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        title="Open Little Toolpa"
        type="button"
      >
        <span aria-hidden="true" className="gemini-clippy-grip">
          <Grip className="size-3" />
        </span>
        <span aria-hidden="true" className="gemini-clippy-stage">
          <span aria-hidden="true" className="gemini-clippy-glow" />
          <img
            alt=""
            aria-hidden="true"
            className={cn(
              "gemini-clippy-character",
              isBursting ? "gemini-clippy-character--bursting" : null,
            )}
            draggable={false}
            src="/gemini-clippy.svg"
          />
          <span aria-hidden="true" className="gemini-clippy-sparks" key={burstId}>
            {sparks.map((spark, index) => (
              <span
                className="gemini-clippy-spark"
                key={`${spark.x}-${spark.y}`}
                style={createSparkStyle(spark)}
              >
                {index % 2 === 0 ? null : <span className="gemini-clippy-spark-core" />}
              </span>
            ))}
          </span>
        </span>
      </button>
      <style>{`
        .gemini-clippy-shell {
          bottom: max(1rem, env(safe-area-inset-bottom));
          pointer-events: none;
          position: fixed;
          right: max(1rem, env(safe-area-inset-right));
          z-index: 60;
        }

        .gemini-clippy-shell--positioned {
          bottom: auto;
          right: auto;
        }

        .gemini-clippy-button {
          aspect-ratio: 1;
          background: transparent;
          border: 0;
          cursor: grab;
          display: block;
          filter: drop-shadow(0 18px 28px rgba(0, 0, 0, 0.4));
          isolation: isolate;
          padding: 0;
          pointer-events: auto;
          position: relative;
          touch-action: none;
          width: clamp(5.75rem, 9vw, 7rem);
        }

        .gemini-clippy-button--dragging {
          cursor: grabbing;
        }

        .gemini-clippy-button:focus-visible {
          border-radius: 1.25rem;
          outline: 2px solid rgba(251, 194, 235, 0.95);
          outline-offset: 0.25rem;
        }

        .gemini-clippy-stage {
          animation: gemini-clippy-dance 2.4s ease-in-out infinite;
          display: block;
          inset: 0;
          position: absolute;
          transform-origin: 50% 92%;
        }

        .gemini-clippy-button:hover .gemini-clippy-stage {
          animation-duration: 1.65s;
        }

        .gemini-clippy-character--bursting {
          animation: gemini-clippy-burst 900ms cubic-bezier(0.2, 0.95, 0.18, 1);
        }

        .gemini-clippy-grip {
          align-items: center;
          background: rgba(9, 9, 11, 0.78);
          border: 1px solid rgba(244, 244, 245, 0.16);
          border-radius: 999px;
          color: rgba(244, 244, 245, 0.8);
          display: inline-flex;
          height: 1.3rem;
          justify-content: center;
          position: absolute;
          right: 0.3rem;
          top: 0.42rem;
          width: 1.3rem;
          z-index: 4;
        }

        .gemini-clippy-glow {
          animation: gemini-clippy-glow 1.7s ease-in-out infinite;
          background:
            radial-gradient(circle at 48% 40%, rgba(251, 194, 235, 0.44), transparent 45%),
            radial-gradient(circle at 60% 70%, rgba(0, 242, 254, 0.24), transparent 52%);
          border-radius: 999px;
          filter: blur(10px);
          inset: 11% 1% 0;
          opacity: 0.85;
          position: absolute;
          z-index: 0;
        }

        .gemini-clippy-character {
          height: 100%;
          inset: 0;
          object-fit: contain;
          pointer-events: none;
          position: absolute;
          user-select: none;
          width: 100%;
          z-index: 2;
        }

        .gemini-clippy-sparks {
          inset: -24%;
          pointer-events: none;
          position: absolute;
          z-index: 3;
        }

        .gemini-clippy-spark {
          animation: gemini-clippy-spark 760ms ease-out both;
          animation-delay: var(--spark-delay);
          background: #fbc2eb;
          border-radius: 999px;
          box-shadow: 0 0 12px rgba(251, 194, 235, 0.85);
          display: block;
          height: 0.42rem;
          left: 50%;
          opacity: 0;
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%) scale(0.35);
          width: 0.42rem;
        }

        .gemini-clippy-spark:nth-child(3n) {
          background: #00f2fe;
          box-shadow: 0 0 12px rgba(0, 242, 254, 0.78);
        }

        .gemini-clippy-spark-core {
          background: #ffffff;
          border-radius: inherit;
          display: block;
          height: 45%;
          left: 50%;
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 45%;
        }

        .gemini-clippy-chat {
          background: rgba(9, 9, 11, 0.96);
          border: 1px solid rgba(244, 244, 245, 0.16);
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.48);
          color: #f4f4f5;
          display: grid;
          gap: 0.75rem;
          max-height: min(30rem, calc(100vh - 10rem));
          overflow: hidden;
          padding: 0.85rem;
          pointer-events: auto;
          position: absolute;
          right: 0;
          bottom: calc(100% + 0.85rem);
          width: min(22rem, calc(100vw - 2rem));
        }

        .gemini-clippy-chat-header {
          align-items: center;
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .gemini-clippy-chat-kicker {
          color: #a1a1aa;
          font-size: 0.64rem;
          line-height: 1;
          margin: 0 0 0.25rem;
          text-transform: uppercase;
        }

        .gemini-clippy-chat-title {
          font-size: 0.9rem;
          font-weight: 600;
          line-height: 1.1;
          margin: 0;
        }

        .gemini-clippy-icon-button,
        .gemini-clippy-send {
          align-items: center;
          background: #18181b;
          border: 1px solid rgba(244, 244, 245, 0.14);
          color: #f4f4f5;
          display: inline-flex;
          justify-content: center;
          transition: background 160ms ease, border-color 160ms ease;
        }

        .gemini-clippy-icon-button {
          height: 2rem;
          width: 2rem;
        }

        .gemini-clippy-send {
          height: 2.35rem;
          width: 2.35rem;
        }

        .gemini-clippy-icon-button:hover,
        .gemini-clippy-send:hover:not(:disabled) {
          background: #27272a;
          border-color: rgba(244, 244, 245, 0.28);
        }

        .gemini-clippy-send:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .gemini-clippy-messages {
          display: grid;
          gap: 0.5rem;
          max-height: 17rem;
          overflow-y: auto;
          padding-right: 0.15rem;
        }

        .gemini-clippy-message {
          border: 1px solid rgba(244, 244, 245, 0.1);
          font-size: 0.72rem;
          line-height: 1.45;
          padding: 0.6rem;
          white-space: pre-wrap;
        }

        .gemini-clippy-message--assistant {
          background: rgba(39, 39, 42, 0.8);
          color: #e4e4e7;
          justify-self: start;
        }

        .gemini-clippy-message--user {
          background: #f4f4f5;
          color: #09090b;
          justify-self: end;
        }

        .gemini-clippy-error {
          color: #fca5a5;
          font-size: 0.68rem;
          line-height: 1.35;
          margin: 0;
        }

        .gemini-clippy-form {
          align-items: end;
          display: grid;
          gap: 0.5rem;
          grid-template-columns: 1fr auto;
        }

        .gemini-clippy-input {
          background: #09090b;
          border: 1px solid rgba(244, 244, 245, 0.14);
          color: #f4f4f5;
          height: 2.35rem;
          outline: none;
          padding: 0.55rem 0.65rem;
          width: 100%;
        }

        .gemini-clippy-input:focus {
          border-color: rgba(251, 194, 235, 0.7);
        }

        .gemini-clippy-input::placeholder {
          color: #71717a;
        }

        @keyframes gemini-clippy-dance {
          0%,
          100% {
            transform: translateY(0) rotate(-2deg) scale(1);
          }
          25% {
            transform: translateY(-0.22rem) rotate(2.5deg) scale(1.015);
          }
          50% {
            transform: translateY(-0.48rem) rotate(-1deg) scale(1.03);
          }
          75% {
            transform: translateY(-0.18rem) rotate(2deg) scale(1.01);
          }
        }

        @keyframes gemini-clippy-glow {
          0%,
          100% {
            opacity: 0.55;
            transform: scale(0.92);
          }
          50% {
            opacity: 0.9;
            transform: scale(1.04);
          }
        }

        @keyframes gemini-clippy-burst {
          0% {
            transform: translateY(0) rotate(-2deg) scale(1);
          }
          24% {
            transform: translateY(-0.9rem) rotate(10deg) scale(1.13);
          }
          52% {
            transform: translateY(0.16rem) rotate(-7deg) scale(0.96);
          }
          78% {
            transform: translateY(-0.25rem) rotate(3deg) scale(1.05);
          }
          100% {
            transform: translateY(0) rotate(-2deg) scale(1);
          }
        }

        @keyframes gemini-clippy-spark {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.35);
          }
          20% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate(
                calc(-50% + var(--spark-x)),
                calc(-50% + var(--spark-y))
              )
              scale(0.2);
          }
        }

        @media (max-width: 640px) {
          .gemini-clippy-shell {
            bottom: max(0.75rem, env(safe-area-inset-bottom));
            right: max(0.75rem, env(safe-area-inset-right));
          }

          .gemini-clippy-button {
            width: 5.7rem;
          }

          .gemini-clippy-chat {
            max-height: min(28rem, calc(100vh - 8rem));
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .gemini-clippy-stage,
          .gemini-clippy-character--bursting,
          .gemini-clippy-glow,
          .gemini-clippy-spark {
            animation-duration: 1ms;
            animation-iteration-count: 1;
          }
        }
      `}</style>
    </div>
  );
}
