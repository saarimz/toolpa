import "server-only";

import { generateText } from "ai";

import { getConfiguredGatewayModelId, getGatewayModel } from "@/lib/ai/gateway";
import type { AgentManifest } from "@/lib/agents/contract";
import { recordPromptMemory } from "@/lib/prompt-memory/server";

export type ProducerCopilotMessage = {
  role: "assistant" | "user";
  content: string;
};

export type ProducerCopilotInput = {
  messages: ProducerCopilotMessage[];
  tools: AgentManifest[];
  model?: string;
};

export async function generateProducerCopilotReply({
  messages,
  tools,
  model,
}: ProducerCopilotInput) {
  const system = buildProducerCopilotSystem(tools);
  const prompt = buildProducerCopilotPrompt(messages);

  await recordPromptMemory({
    action: "chat-completion",
    metadata: {
      enabledToolCount: tools.filter((tool) => tool.status === "enabled").length,
      messageCount: messages.length,
    },
    model: model ?? getConfiguredGatewayModelId(),
    resolvedPrompt: prompt,
    source: "ai.producer-copilot",
    systemPrompt: system,
    toolSlug: "producer-copilot",
    userPrompt: messages
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .join("\n\n"),
  });

  const { text } = await generateText({
    model: getGatewayModel(model),
    system,
    prompt,
    temperature: 0.55,
  });

  return text.trim();
}

export function buildProducerCopilotSystem(tools: AgentManifest[]) {
  const enabledTools = tools
    .filter((tool) => tool.status === "enabled")
    .map((tool) => {
      const capabilities = tool.capabilities.slice(0, 8).join(", ");
      return [
        `- ${tool.name} (${tool.route})`,
        `  Type: ${tool.instrument.type}; workflow: ${tool.instrument.workflow}.`,
        `  ${tool.description}`,
        capabilities ? `  Capabilities: ${capabilities}.` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
    "You are Little Toolpa, Toolpa's music producer copilot.",
    "Help the user use the app's tools and answer general music production questions.",
    "Be practical, concise, and specific. Prefer concrete next moves over broad theory.",
    "You can discuss arrangement, drums, sampling, synthesis, MIDI, harmony, mixing, effects, sound design, and workflow.",
    "When a Toolpa tool is relevant, name it and include its route. Do not invent tools that are not listed.",
    "Do not claim you directly changed audio or project state. Explain what the user can do inside the app.",
    "If the request is vague, ask one short clarifying question or give a useful default workflow.",
    "",
    "Available Toolpa tools:",
    enabledTools || "- No enabled tools were found.",
  ].join("\n");
}

function buildProducerCopilotPrompt(messages: ProducerCopilotMessage[]) {
  const recentMessages = messages.slice(-12);
  return recentMessages
    .map((message) => {
      const speaker = message.role === "user" ? "User" : "Assistant";
      return `${speaker}: ${message.content}`;
    })
    .join("\n\n");
}
