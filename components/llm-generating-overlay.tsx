import { Loader2 } from "lucide-react";

type OverlayTone = "cyan" | "emerald" | "fuchsia";

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
  cyan: {
    border: "border-cyan-300/30",
    icon: "text-cyan-200",
    text: "text-cyan-100",
    bar: "bg-cyan-300",
    shadow: "shadow-[0_0_30px_rgba(103,232,249,0.12)]",
  },
  emerald: {
    border: "border-emerald-300/30",
    icon: "text-emerald-200",
    text: "text-emerald-100",
    bar: "bg-emerald-300",
    shadow: "shadow-[0_0_30px_rgba(110,231,183,0.12)]",
  },
  fuchsia: {
    border: "border-fuchsia-300/30",
    icon: "text-fuchsia-200",
    text: "text-fuchsia-100",
    bar: "bg-fuchsia-300",
    shadow: "shadow-[0_0_30px_rgba(240,171,252,0.12)]",
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
  tone = "cyan",
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
