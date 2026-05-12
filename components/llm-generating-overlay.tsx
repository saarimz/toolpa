import { Loader2 } from "lucide-react";

type OverlayTone = "neutral" | "solid" | "soft";

const toneClasses: Record<
  OverlayTone,
  {
    border: string;
    icon: string;
    text: string;
    bar: string;
    shadow: string;
  }
> = {
  neutral: {
    border: "border-zinc-200/30",
    icon: "text-zinc-200",
    text: "text-zinc-100",
    bar: "bg-zinc-100",
    shadow: "shadow-[0_0_30px_rgba(245,245,245,0.12)]",
  },
  solid: {
    border: "border-zinc-100/35",
    icon: "text-zinc-100",
    text: "text-zinc-100",
    bar: "bg-white",
    shadow: "shadow-[0_0_30px_rgba(245,245,245,0.14)]",
  },
  soft: {
    border: "border-zinc-300/25",
    icon: "text-zinc-200",
    text: "text-zinc-200",
    bar: "bg-zinc-200",
    shadow: "shadow-[0_0_30px_rgba(212,212,216,0.12)]",
  },
};

type LlmGeneratingOverlayProps = {
  detail: string;
  label: string;
  tone?: OverlayTone;
};

export function LlmGeneratingOverlay({
  detail,
  label,
  tone = "neutral",
}: LlmGeneratingOverlayProps) {
  const classes = toneClasses[tone];

  return (
    <div
      aria-live="polite"
      className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/85 p-4 backdrop-blur-sm"
      role="status"
    >
      <div
        className={`w-full max-w-xs border bg-black/60 p-3 text-center ${classes.border} ${classes.shadow}`}
      >
        <Loader2 className={`mx-auto size-5 animate-spin ${classes.icon}`} />
        <div className={`mt-2 text-xs uppercase tracking-[0.16em] ${classes.text}`}>
          {label}
        </div>
        <div className="mt-1 text-xs text-zinc-500">{detail}</div>
        <div className="mt-3 h-1 overflow-hidden bg-zinc-900">
          <div className={`h-full w-1/2 animate-pulse ${classes.bar}`} />
        </div>
      </div>
    </div>
  );
}
