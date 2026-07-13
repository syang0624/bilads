/**
 * GMI Cloud client (OpenAI-compatible API — one integration for LLM + image).
 *
 * Every call is wrapped in a 20s timeout (PRD §10 fallback spec). When
 * GMI_API_KEY is missing or the network is down, calls reject fast and the
 * endpoints fall back deterministically — the app never dead-ends.
 */
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const GMI_BASE_URL = process.env.GMI_BASE_URL ?? "https://api.gmi-serving.com/v1";
// Model IDs come from Godson — override in .env.local once confirmed.
export const CHAT_MODEL = process.env.GMI_CHAT_MODEL ?? "deepseek-ai/DeepSeek-V3";
export const IMAGE_MODEL = process.env.GMI_IMAGE_MODEL ?? "black-forest-labs/FLUX.1-schnell";

export const GMI_TIMEOUT_MS = 20_000;

export class GmiUnavailableError extends Error {}

let client: OpenAI | null = null;

export function gmi(): OpenAI {
  const apiKey = process.env.GMI_API_KEY;
  if (!apiKey) throw new GmiUnavailableError("GMI_API_KEY not set");
  if (!client) {
    client = new OpenAI({ apiKey, baseURL: GMI_BASE_URL, maxRetries: 0 });
  }
  return client;
}

export function withTimeout<T>(p: Promise<T>, ms = GMI_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new GmiUnavailableError(`GMI call timed out after ${ms}ms`)), ms);
    }),
  ]);
}

export type ChatMessage = ChatCompletionMessageParam;

/** One chat completion; returns the assistant text. Times out after 20s. */
export async function chat(messages: ChatMessage[], model: string = CHAT_MODEL): Promise<string> {
  const res = await withTimeout(
    gmi().chat.completions.create({ model, messages, temperature: 0.7 })
  );
  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error("GMI chat returned empty content");
  return text;
}

/**
 * One image generation; returns raw PNG/JPEG bytes. Times out after 20s.
 * 1024x512 is the wide billboard ratio (PRD §5); GMI snaps to nearest supported.
 */
export async function image(
  prompt: string,
  model: string = IMAGE_MODEL,
  size: string = "1024x512"
): Promise<Buffer> {
  const res = await withTimeout(
    gmi().images.generate({
      model,
      prompt,
      n: 1,
      size: size as never,
      response_format: "b64_json",
    })
  );
  const b64 = res.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, "base64");
  const url = res.data?.[0]?.url;
  if (url) {
    const dl = await withTimeout(fetch(url));
    if (!dl.ok) throw new Error(`image download failed: ${dl.status}`);
    return Buffer.from(await dl.arrayBuffer());
  }
  throw new Error("GMI image returned neither b64_json nor url");
}
