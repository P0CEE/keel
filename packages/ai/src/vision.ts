import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

/** Structured result of analysing an image with a vision model. */
export const imageDescriptionSchema = z.object({
  description: z
    .string()
    .describe("One or two sentences describing the whole image."),
  tags: z.array(z.string()).describe("Short keyword tags for the image."),
  objects: z
    .array(
      z.object({
        name: z.string().describe("A distinct object visible in the image."),
        confidence: z.enum(["high", "medium", "low"]),
      }),
    )
    .describe("Notable objects detected in the image."),
});

export type ImageDescription = z.infer<typeof imageDescriptionSchema>;

/** GPT-4.1 is the default vision model; override per call if needed. */
const DEFAULT_VISION_MODEL = "gpt-4.1";

const DEFAULT_VISION_PROMPT =
  "Analyze this image. Give a short overall description, a handful of " +
  "keyword tags, and the notable objects you can see with a confidence " +
  "level for each. Return structured JSON.";

export interface DescribeImageOptions {
  /** OpenAI vision model id. Defaults to `gpt-4.1`. */
  model?: string;
  /** Override the analysis instruction. */
  prompt?: string;
}

/**
 * Analyze an image with a vision model and return a structured description.
 *
 * `image` MUST be a base64 `data:` URL (the caller inlines the bytes).
 * Fetching a caller-supplied remote URL server-side is deliberately NOT
 * supported: it is an SSRF vector (internal metadata endpoints, private
 * ranges, DNS rebinding, redirects). A caller holding a remote URL should
 * fetch and validate it itself — or route it through a vetted image proxy —
 * and pass the resulting data URL. Requires `OPENAI_API_KEY`.
 */
export async function describeImage(
  image: string,
  options: DescribeImageOptions = {},
): Promise<ImageDescription> {
  if (!image.startsWith("data:")) {
    throw new Error("describeImage expects a base64 data: URL");
  }

  const { object } = await generateObject({
    model: openai(options.model ?? DEFAULT_VISION_MODEL),
    schema: imageDescriptionSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: options.prompt ?? DEFAULT_VISION_PROMPT },
          { type: "image", image },
        ],
      },
    ],
  });

  return object;
}
