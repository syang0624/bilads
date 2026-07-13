/**
 * VLM attention testing (Peel-style "Vision Studio" lite).
 *
 * Sends a generated creative to the vision-capable GMI chat model and asks
 * what a passer-by would actually notice: first eye landing, legibility,
 * brand recall, shareability. Failure chain matches the rest of the app:
 * live VLM → deterministic heuristic scored from the copy itself.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { chatJson } from "./parse";

export interface AttentionReport {
  /** What the eye lands on first, in the model's words. */
  firstNoticed: string;
  /** 0-100: can the headline be read in a 3-second drive-by? */
  legibility: number;
  /** 0-100: would they remember the product name? */
  brandRecall: number;
  /** 0-100: would a pedestrian photograph/share it? */
  shareability: number;
  verdict: string;
  source: "vlm" | "heuristic";
}

export interface AttentionInput {
  imageUrl: string; // local /generated path or InsForge Storage URL
  headline: string;
  subline?: string;
  productName: string;
}

function publicDir(): string {
  const local = join(process.cwd(), "public");
  return existsSync(local) ? local : join(process.cwd(), "app", "public");
}

const GENERATED_BUCKET = "generated-creatives";
const MAX_CREATIVE_BYTES = 10 * 1024 * 1024;

/** Load local or allowlisted InsForge-hosted creative bytes without permitting SSRF. */
export async function loadCreativePng(imageUrl: string): Promise<Buffer | null> {
  if (/^\/generated\/[\w.-]+\.png$/.test(imageUrl)) {
    const path = join(publicDir(), imageUrl.slice(1));
    return existsSync(path) ? readFileSync(path) : null;
  }

  const baseUrl = process.env.INSFORGE_BASE_URL;
  if (!baseUrl) return null;

  try {
    const url = new URL(imageUrl);
    const base = new URL(baseUrl);
    const prefix = `/api/storage/buckets/${GENERATED_BUCKET}/objects/`;
    if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      const allowedContentType =
        contentType.startsWith("image/") ||
        contentType === "application/octet-stream" ||
        contentType === "binary/octet-stream";
      if (!allowedContentType) return null;
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > MAX_CREATIVE_BYTES) return null;

      const bytes = Buffer.from(await response.arrayBuffer());
      const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      if (bytes.length > MAX_CREATIVE_BYTES || !bytes.subarray(0, 8).equals(pngSignature)) return null;
      return bytes;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

const clamp = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50;

/** Live VLM pass. Throws on any failure — caller falls back to heuristic. */
export async function runAttention(input: AttentionInput, png: Buffer): Promise<AttentionReport> {
  const raw = await chatJson<{
    firstNoticed?: string;
    legibility?: number;
    brandRecall?: number;
    shareability?: number;
    verdict?: string;
  }>([
    {
      role: "system",
      content:
        "You are an out-of-home attention auditor. You see a billboard ad creative. " +
        "The final board will carry this copy on top of the art: " +
        `headline "${input.headline}"` +
        (input.subline ? `, subline "${input.subline}"` : "") +
        `, brand "${input.productName}". ` +
        "Judge it as a passer-by with a 3-second glance, considering the art AND that copy. " +
        "Ignore any watermarks or UI artifacts. Reply with ONLY a JSON object: " +
        '{"firstNoticed": string (the single element the eye lands on first, <=12 words), ' +
        '"legibility": number 0-100 (drive-by readability of the copy over this art), ' +
        '"brandRecall": number 0-100 (would they remember the brand?), ' +
        '"shareability": number 0-100 (would a pedestrian photograph it?), ' +
        '"verdict": string (one blunt sentence of advice)}.',
    },
    {
      role: "user",
      content: [
        { type: "text", text: "Score this billboard creative." },
        {
          type: "image_url",
          image_url: { url: `data:image/png;base64,${png.toString("base64")}` },
        },
      ],
    },
  ]);
  if (!raw.firstNoticed || !raw.verdict) throw new Error("VLM attention response incomplete");
  return {
    firstNoticed: raw.firstNoticed,
    legibility: clamp(raw.legibility),
    brandRecall: clamp(raw.brandRecall),
    shareability: clamp(raw.shareability),
    verdict: raw.verdict,
    source: "vlm",
  };
}

/** Deterministic fallback scored from the copy alone (no vision). */
export function heuristicAttention(input: AttentionInput): AttentionReport {
  const words = input.headline.trim().split(/\s+/).length;
  // PRD creative constraint is <=7 words for drive-by legibility.
  const legibility = clamp(100 - Math.max(0, words - 7) * 12 - (input.subline ? 8 : 0));
  const nameInCopy = `${input.headline} ${input.subline ?? ""}`
    .toLowerCase()
    .includes(input.productName.toLowerCase());
  const brandRecall = clamp(nameInCopy ? 78 : 52);
  const shareability = clamp(55 + (words <= 5 ? 10 : 0));
  return {
    firstNoticed: "The headline block",
    legibility,
    brandRecall,
    shareability,
    verdict: nameInCopy
      ? "Copy is drive-by legible; consider a stronger visual hook."
      : `Add "${input.productName}" to the copy — nothing on the board names the brand.`,
    source: "heuristic",
  };
}
