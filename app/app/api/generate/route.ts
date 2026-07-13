/**
 * POST /api/generate (PRD §7.3) — Creative Director + two parallel image gens.
 *
 * Query params:
 *   ?live=1 — bypass cached JSON and existing generated PNGs for the on-stage
 *             regenerate moment. The Regenerate button appends this.
 *
 * Failure chain (app never dead-ends):
 *   1. live Creative Director copy + 2 parallel image calls
 *   2. copy failure → canned prompts still continue to image generation
 *   3. image failure → pre-cached result for this (board, product, variant)
 *   4. no cache → canned copy templates + placeholder image path
 */
import { NextRequest, NextResponse } from "next/server";
import type { AdConcept, GenerateRequest, GenerateResponse } from "@/lib/types";
import { getBoard } from "@/lib/boards";
import {
  runCreativeDirector,
  fallbackConcepts,
  safeImagePrompt,
  type ConceptDraft,
} from "@/lib/creative";
import { generateCacheKey, readGenerateCache, writeGenerateCache } from "@/lib/cache";
import { generateAdImage, placeholderUrl } from "@/lib/images";
import { recordAgentRun } from "@/lib/insforge";
import { requireApiKey } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireApiKey(req);
  if (denied) return denied;
  let body: GenerateRequest;
  try {
    body = (await req.json()) as GenerateRequest;
    validate(body);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "invalid request body" },
      { status: 400 }
    );
  }

  const board = getBoard(body.billboardId);
  if (!board) {
    return NextResponse.json({ error: `unknown billboardId: ${body.billboardId}` }, { status: 400 });
  }

  const live = req.nextUrl.searchParams.get("live") === "1";
  const cacheKey = generateCacheKey({
    billboardId: body.billboardId,
    productName: body.brief.productName,
    variant: body.variant ?? 0,
    consistentBrand: body.consistentBrand,
  });

  const cached = readGenerateCache(cacheKey);

  // 0) Cache hit returns immediately (unless ?live=1 bypasses the read).
  if (!live && cached) return NextResponse.json(cached);

  let drafts: ConceptDraft[];
  let copyPath: "live" | "canned" = "live";
  try {
    drafts = await runCreativeDirector(body, board);
  } catch {
    // Copy generation and image generation are independent. A stale/unavailable
    // chat model must not stop the working image provider from rendering art.
    drafts = fallbackConcepts({ productName: body.brief.productName, board });
    copyPath = "canned";
  }

  const imageUrls = await Promise.all(
    drafts.map((draft, index) =>
      generateAdImage(
        safeImagePrompt(draft.imagePrompt, board),
        cacheKey,
        index,
        body.brief.productName,
        live
      )
    )
  );

  let response: GenerateResponse;
  let path: "live" | "cache" | "canned" = "live";
  const allImagesGenerated = imageUrls.every((url) => !url.startsWith("/api/placeholder"));

  if (allImagesGenerated) {
    response = { concepts: drafts.map((d, i) => toConcept(d, imageUrls[i])) };
    // Never cache placeholder responses as though they were successful live art.
    writeGenerateCache(cacheKey, response);
  } else if (cached) {
    // 2) Image failure → the last complete cached response for this key …
    response = cached;
    path = "cache";
  } else {
    // 3) … or canned copy + placeholder art. This response is not cached.
    const fallbackDrafts = fallbackConcepts({ productName: body.brief.productName, board });
    response = {
      concepts: fallbackDrafts.map((draft) =>
        toConcept(draft, placeholderUrl(body.brief.productName))
      ),
    };
    copyPath = "canned";
    path = "canned";
  }

  void recordAgentRun({
    agent: "creative-director",
    input: { billboardId: body.billboardId, variant: body.variant ?? 0, live },
    live: path === "live" && copyPath === "live",
    output: { path, copyPath, concepts: response.concepts.map((c) => c.headline) },
  });

  return NextResponse.json(response);
}

function toConcept(draft: ConceptDraft, imageUrl: string): AdConcept {
  return {
    id: draft.id,
    language: draft.language,
    headline: draft.headline,
    subline: draft.subline,
    rationale: draft.rationale,
    imageUrl,
  };
}

function validate(body: GenerateRequest): void {
  if (typeof body?.billboardId !== "string" || !body.billboardId) throw new Error("missing billboardId");
  if (!body.brief?.productName) throw new Error("missing brief.productName");
  if (!body.audienceProfile || !Array.isArray(body.audienceProfile.interests))
    throw new Error("missing audienceProfile.interests");
  if (typeof body.consistentBrand !== "boolean") throw new Error("missing consistentBrand");
  if (body.variant !== undefined && typeof body.variant !== "number")
    throw new Error("variant must be a number");
}
