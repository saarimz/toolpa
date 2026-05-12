"use client";

import { useEffect, useState } from "react";

export function readPromptParam(defaultPrompt = "", param = "prompt") {
  if (typeof window === "undefined") {
    return defaultPrompt;
  }

  const prompt = new URLSearchParams(window.location.search).get(param)?.trim();
  return prompt ? prompt : defaultPrompt;
}

export function usePromptParamState(defaultPrompt: string, param = "prompt") {
  return useState(() => readPromptParam(defaultPrompt, param));
}

export function useHydratePromptParam(
  setPrompt: (prompt: string) => void,
  param = "prompt",
) {
  useEffect(() => {
    const prompt = readPromptParam("", param);
    if (prompt) {
      setPrompt(prompt);
    }
  }, [param, setPrompt]);
}
