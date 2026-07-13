/**
 * Image generation + persistence for /api/generate.
 * Generated art lands in /public/generated with deterministic filenames so a
 * cached GenerateResponse's imageUrls stay valid across restarts. On any
 * failure the placeholder ships instead — never a broken image.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { image } from "./gmi";

export const PLACEHOLDER_IMAGE = "/generated/placeholder.svg";

const GENERATED_DIR = join(process.cwd(), "public", "generated");

/**
 * Generate one ad image and save it. Returns the /public URL path, or the
 * placeholder path if generation fails for any reason.
 */
export async function generateAdImage(prompt: string, cacheKey: string, index: number): Promise<string> {
  const filename = `${cacheKey}-${index}.png`;
  const urlPath = `/generated/${filename}`;
  const diskPath = join(GENERATED_DIR, filename);
  if (existsSync(diskPath)) return urlPath;
  try {
    const bytes = await image(prompt);
    mkdirSync(GENERATED_DIR, { recursive: true });
    writeFileSync(diskPath, bytes);
    return urlPath;
  } catch {
    return PLACEHOLDER_IMAGE;
  }
}
