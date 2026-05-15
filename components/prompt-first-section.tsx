"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const PROMPT_FIRST_LAYOUT_CONTRACT = {
  l1: "Render prompt controls immediately after required source/context selectors and before playback, transport, export, or deep editing controls.",
  l2: "Render the builder description prompt before family selection, verification, and run-monitor surfaces.",
  memory: "Every prompt application path records prompt memory through the server writer, AI route, or client prompt-memory helper.",
} as const;

export function PromptFirstSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("border-b border-zinc-800", className)}
      data-prompt-first="true"
    >
      {children}
    </section>
  );
}
