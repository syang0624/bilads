/**
 * Image generation + persistence for /api/generate.
 * Generated art lands in app/public/generated with deterministic filenames so
 * a cached GenerateResponse's imageUrls stay valid across restarts. On any
 * failure Steven's /api/placeholder route ships instead — never a broken image.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { image } from "./gmi";
import { uploadFile } from "./insforge";

const GENERATED_BUCKET = "generated-creatives";

/** Branded SVG placeholder rendered by app/app/api/placeholder/route.ts. */
export function placeholderUrl(text: string): string {
  return `/api/placeholder?w=1024&h=512&text=${encodeURIComponent(text)}`;
}

function generatedDir(): string {
  // process.cwd() is app/ when started there, repo root otherwise.
  const local = join(process.cwd(), "public");
  return existsSync(local)
    ? join(local, "generated")
    : join(process.cwd(), "app", "public", "generated");
}

/**
 * Generate one ad image and save it. Returns the /public URL path, or the
 * placeholder URL if generation fails for any reason.
 */
export async function generateAdImage(
  prompt: string,
  cacheKey: string,
  index: number,
  placeholderText: string,
  forceRegenerate = false
): Promise<string> {
  const filename = `${cacheKey}-${index}.png`;
  const urlPath = `/generated/${filename}`;
  const diskPath = join(generatedDir(), filename);
  if (!forceRegenerate && existsSync(diskPath)) return urlPath;
  try {
    const bytes = await image(prompt);

    let storageError: unknown;
    try {
      const stored = await uploadFile(
        GENERATED_BUCKET,
        `generated/${filename}`,
        bytes,
        "image/png"
      );
      if (stored) return stored.url;
    } catch (error) {
      storageError = error;
    }

    // Deployed functions cannot publish files written at runtime. Local disk is
    // retained only for offline/development use when Storage is unavailable.
    if (process.env.NODE_ENV === "production") {
      throw storageError ?? new Error("InsForge Storage is not configured");
    }

    mkdirSync(generatedDir(), { recursive: true });
    writeFileSync(diskPath, bytes);
    return urlPath;
  } catch (error) {
    console.warn(
      `Image generation failed for ${filename}; returning a placeholder:`,
      error instanceof Error ? error.message : String(error)
    );
    return placeholderUrl(placeholderText);
  }
}
