/**
 * POST /api/generate (PRD §7.3) — Creative Director + two parallel image gens.
 *
 * Query params:
 *   ?live=1 — bypass the disk cache READ (still writes) for the on-stage
 *             regenerate moment. Steven's button appends this.
 *
 * Failure chain (app never dead-ends):
 *   1. live GMI call (LLM + 2 parallel images, each 20s-capped)
 *   2. on timeout/error → pre-cached result for this (board, product, variant)
 *   3. no cache → canned copy templates + placeholder image path
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

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  // 0) Cache hit returns immediately (unless ?live=1 bypasses the read).
  if (!live) {
    const cached = readGenerateCache(cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  let response: GenerateResponse;
  let path: "live" | "cache" | "canned" = "live";
  try {
    // 1) Creative Director (one LLM call, 2 concepts) …
    const drafts = await runCreativeDirector(body, board);
    // … then two PARALLEL image calls (each internally 20s-capped + placeholder fallback).
    const imageUrls = await Promise.all(
      drafts.map((d, i) =>
        generateAdImage(safeImagePrompt(d.imagePrompt, board), cacheKey, i, body.brief.productName)
      )
    );
    response = { concepts: drafts.map((d, i) => toConcept(d, imageUrls[i])) };
    writeGenerateCache(cacheKey, response);
  } catch {
    // 2) Any LLM failure → pre-cached result for this key …
    const cached = readGenerateCache(cacheKey);
    if (cached) {
      response = cached;
      path = "cache";
    } else {
      // 3) … or seed/canned copy + placeholder image path.
      const drafts = fallbackConcepts({ productName: body.brief.productName, board });
      response = {
        concepts: drafts.map((d) => toConcept(d, placeholderUrl(body.brief.productName))),
      };
      path = "canned";
    }
  }

  void recordAgentRun({
    agent: "creative-director",
    input: { billboardId: body.billboardId, variant: body.variant ?? 0, live },
    live: path === "live",
    output: { path, concepts: response.concepts.map((c) => c.headline) },
  });

  return NextResponse.json(response);
}

function toConcept(draft: ConceptDraft, imageUrl: string): AdConcept {
  const { imagePrompt: _drop, ...rest } = draft;
  return { ...rest, imageUrl };
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
