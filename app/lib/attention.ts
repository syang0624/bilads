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
  imageUrl: string; // /generated/<file>.png public path
  headline: string;
  subline?: string;
  productName: string;
}

function publicDir(): string {
  const local = join(process.cwd(), "public");
  return existsSync(local) ? local : join(process.cwd(), "app", "public");
}

/** Resolve a /generated/... URL to PNG bytes, or null if not on disk. */
export function readCreativePng(imageUrl: string): Buffer | null {
  if (!/^\/generated\/[\w.-]+\.png$/.test(imageUrl)) return null;
  const path = join(publicDir(), imageUrl);
  return existsSync(path) ? readFileSync(path) : null;
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
