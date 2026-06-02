import { openai } from "@ai-sdk/openai";
import { generateText, type ModelMessage } from "ai";

/** Cheaper text model for plain chat completions. */
const DEFAULT_CHAT_MODEL = "gpt-4.1-mini";

export interface GenerateReplyOptions {
  /** OpenAI model id. Defaults to `gpt-4.1-mini`. */
  model?: string;
  /** Optional system instruction. */
  system?: string;
}

/**
 * Minimal text-generation helper over the AI SDK. Returns the assistant's
 * reply text for a conversation. Requires `OPENAI_API_KEY`.
 */
export async function generateReply(
  messages: ModelMessage[],
  options: GenerateReplyOptions = {},
): Promise<string> {
  const { text } = await generateText({
    model: openai(options.model ?? DEFAULT_CHAT_MODEL),
    system: options.system,
    messages,
  });
  return text;
}

export type { ModelMessage };
