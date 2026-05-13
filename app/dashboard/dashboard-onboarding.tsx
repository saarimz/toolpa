"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileMusic,
  Laptop,
  Wand2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const DESKTOP_INTRO_KEY = "ai-daw-tools:dashboard-intro-dismissed:v2";
const MOBILE_DESKTOP_KEY = "ai-daw-tools:mobile-desktop-required-dismissed:v1";

const introSlides = [
  {
    eyebrow: "Build instruments",
    title: "Make your own DAW tools.",
    body: "Start from focused L1 instruments or ask an L2 builder to generate a new instrument with a typed musical document behind it.",
    icon: Wand2,
  },
  {
    eyebrow: "Agentic flow",
    title: "Prompt, edit, and keep control.",
    body: "Use global BPM, key, scale, samples, and tool-specific prompts to move from an idea into playable Pattern, SynthScene, or MIDI Clip documents.",
    icon: Laptop,
  },
  {
    eyebrow: "MIDI out",
    title: "Export portable MIDI.",
    body: "Discrete MIDI and synth tools produce Standard MIDI Files for DAWs, with track-aware export paths instead of throwaway preview state.",
    icon: FileMusic,
  },
  {
    eyebrow: "Audio out",
    title: "Render or record audio.",
    body: "Tools that claim audio export route through explicit export adapters, evidence, and downloadable WAV artifacts at the UI edge.",
    icon: Download,
  },
];

export function DashboardOnboarding() {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const pointerStartX = useRef<number | null>(null);

  const dismissDesktop = useCallback(() => {
    writeDismissed(DESKTOP_INTRO_KEY);
    setDesktopOpen(false);
  }, []);

  const dismissMobile = useCallback(() => {
    writeDismissed(MOBILE_DESKTOP_KEY);
    setMobileOpen(false);
  }, []);

  const nextSlide = useCallback(() => {
    setActiveSlide((current) => (current + 1) % introSlides.length);
  }, []);

  const previousSlide = useCallback(() => {
    setActiveSlide((current) =>
      current === 0 ? introSlides.length - 1 : current - 1,
    );
  }, []);

  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 767px)") ?? null;

    function syncViewport() {
      const mobile = query?.matches ?? false;
      setIsMobile(mobile);
      setDesktopOpen(!mobile && !readDismissed(DESKTOP_INTRO_KEY));
      setMobileOpen(mobile && !readDismissed(MOBILE_DESKTOP_KEY));
      setMounted(true);
    }

    syncViewport();
    query?.addEventListener("change", syncViewport);
    return () => query?.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (!desktopOpen && !mobileOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (mobileOpen) {
          dismissMobile();
        } else {
          dismissDesktop();
        }
      }
      if (desktopOpen && event.key === "ArrowRight") {
        nextSlide();
      }
      if (desktopOpen && event.key === "ArrowLeft") {
        previousSlide();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [desktopOpen, dismissDesktop, dismissMobile, mobileOpen, nextSlide, previousSlide]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    pointerStartX.current = event.clientX;
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (pointerStartX.current === null) {
      return;
    }
    const delta = event.clientX - pointerStartX.current;
    pointerStartX.current = null;
    if (Math.abs(delta) < 42) {
      return;
    }
    if (delta < 0) {
      nextSlide();
    } else {
      previousSlide();
    }
  }

  if (!mounted) {
    return null;
  }

  if (isMobile && mobileOpen) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
        <section
          aria-label="Desktop required"
          aria-modal="true"
          className="w-full max-w-sm border border-zinc-700 bg-zinc-950 p-4 text-zinc-100 shadow-2xl"
          role="dialog"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                mobile notice
              </div>
              <h2 className="mt-2 text-xl">Desktop required</h2>
            </div>
            <button
              aria-label="Dismiss desktop required notice"
              className="inline-flex size-8 items-center justify-center rounded-sm border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
              type="button"
              onClick={dismissMobile}
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="text-sm leading-6 text-zinc-400">
            This currently requires a desktop browser for reliable Web Audio,
            MIDI export, file handling, and builder workflows.
          </p>
          <Button className="mt-4 w-full" onClick={dismissMobile}>
            dismiss
          </Button>
        </section>
      </div>
    );
  }

  if (!desktopOpen) {
    return null;
  }

  const slide = introSlides[activeSlide]!;
  const SlideIcon = slide.icon;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
      <section
        aria-label="AI-native instrument suite intro"
        aria-modal="true"
        className="w-full max-w-xl border border-zinc-700 bg-zinc-950 text-zinc-100 shadow-2xl"
        role="dialog"
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 p-3">
          <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">
            ai-daw-tools
          </div>
          <button
            aria-label="Dismiss intro"
            className="inline-flex size-8 items-center justify-center rounded-sm border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
            type="button"
            onClick={dismissDesktop}
          >
            <X className="size-4" />
          </button>
        </div>

        <div
          className="touch-pan-y select-none p-5"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="inline-flex size-11 items-center justify-center border border-zinc-800 bg-black/30">
              <SlideIcon className="size-5 text-zinc-100" />
            </div>
            <div className="font-mono text-xs text-zinc-600">
              {activeSlide + 1}/{introSlides.length}
            </div>
          </div>
          <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">
            {slide.eyebrow}
          </div>
          <h2 className="mt-3 text-2xl">{slide.title}</h2>
          <p className="mt-3 min-h-24 text-sm leading-6 text-zinc-400">
            {slide.body}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 p-3">
          <div className="flex items-center gap-2">
            <button
              aria-label="Previous intro card"
              className="inline-flex size-9 items-center justify-center rounded-sm border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
              type="button"
              onClick={previousSlide}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              aria-label="Next intro card"
              className="inline-flex size-9 items-center justify-center rounded-sm border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
              type="button"
              onClick={nextSlide}
            >
              <ChevronRight className="size-4" />
            </button>
            <div className="ml-1 flex items-center gap-1">
              {introSlides.map((introSlide, index) => (
                <button
                  aria-label={`Show intro card ${index + 1}: ${introSlide.eyebrow}`}
                  className={[
                    "size-2 rounded-full border",
                    index === activeSlide
                      ? "border-zinc-100 bg-zinc-100"
                      : "border-zinc-700 bg-transparent",
                  ].join(" ")}
                  key={introSlide.eyebrow}
                  type="button"
                  onClick={() => setActiveSlide(index)}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={dismissDesktop}>
              use installed instrument
            </Button>
            <Link
              className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-zinc-200/60 bg-zinc-100 px-3 text-xs font-medium text-zinc-950 hover:bg-white"
              href="/build"
              onClick={dismissDesktop}
            >
              build an instrument
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function readDismissed(key: string) {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeDismissed(key: string) {
  try {
    window.localStorage.setItem(key, "true");
  } catch {
    // Ignore storage failures; the modal can still close for this session.
  }
}
