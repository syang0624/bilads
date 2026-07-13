/**
 * POST /api/research (PRD §7.2) — Researcher then Media Buyer, one response.
 *
 * Query params:
 *   ?mock=1  — contract-exact hardcoded mock (Phase 1; Steven's dev harness)
 *
 * Failure chain (app never dead-ends):
 *   live GMI agents → deterministic fallback (keyword researcher + math
 *   rankings + canned reasons). A well-formed request always gets a 200.
 */
import { NextRequest, NextResponse } from "next/server";
import type { ResearchRequest, ResearchResponse } from "@/lib/types";
import { loadBoards } from "@/lib/boards";
import { runResearcher, fallbackResearcher, type ResearcherBlock } from "@/lib/researcher";
import { runMediaBuyer } from "@/lib/mediaBuyer";
import { scoreBoards, cannedReason } from "@/lib/scoring";
import { buildMockResearchResponse } from "@/lib/mock";
import { recordAgentRun } from "@/lib/insforge";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (req.nextUrl.searchParams.get("mock") === "1") {
    return NextResponse.json(buildMockResearchResponse());
  }

  let body: ResearchRequest;
  try {
    body = (await req.json()) as ResearchRequest;
    validate(body);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "invalid request body" },
      { status: 400 }
    );
  }

  const boards = loadBoards();

  // Agent 1 — Researcher (LLM, silent fallback to deterministic profile).
  let researcher: ResearcherBlock;
  let researcherLive = true;
  try {
    researcher = await runResearcher(body.brief);
  } catch {
    researcher = fallbackResearcher(body.brief);
    researcherLive = false;
  }

  // Agent 2 — Media Buyer (math ranks; LLM reasons with canned fallback inside).
  let mediaBuyer: ResearchResponse["mediaBuyer"];
  try {
    mediaBuyer = await runMediaBuyer(boards, researcher, body.campaign);
  } catch {
    const { rankings, top3 } = scoreBoards(
      boards,
      researcher.audienceProfile.interests,
      body.campaign
    );
    const byId = new Map(boards.map((b) => [b.id, b]));
    for (const r of rankings) {
      r.reason = cannedReason(byId.get(r.id)!, researcher.audienceProfile.interests);
    }
    mediaBuyer = {
      rankings,
      top3,
      findings: [
        `Scored all ${rankings.length} boards on audience match and impressions per dollar.`,
        `Top pick: ${top3[0] ?? "none in budget"}.`,
        `${rankings.filter((r) => r.inBudget).length} of ${rankings.length} boards fit the weekly budget.`,
        "Rankings are deterministic — math decides, agents explain.",
      ],
    };
  }

  const response: ResearchResponse = { researcher, mediaBuyer };

  // Fire-and-forget job-state tracking (InsForge; in-memory fallback offline).
  void recordAgentRun({
    agent: "researcher+media-buyer",
    input: { productName: body.brief.productName, campaign: body.campaign },
    live: researcherLive,
    output: { top3: mediaBuyer.top3 },
  });

  return NextResponse.json(response);
}

function validate(body: ResearchRequest): void {
  if (!body?.brief) throw new Error("missing brief");
  const { productName, description, audience } = body.brief;
  if (typeof productName !== "string" || !productName.trim()) throw new Error("missing brief.productName");
  if (typeof description !== "string") throw new Error("missing brief.description");
  if (typeof audience !== "string") throw new Error("missing brief.audience");
  const c = body.campaign;
  if (!c || typeof c.weeklyBudgetUsd !== "number") throw new Error("missing campaign.weeklyBudgetUsd");
  if (typeof c.campaignWeeks !== "number") throw new Error("missing campaign.campaignWeeks");
  if (typeof c.awarenessWeight !== "number" || c.awarenessWeight < 0 || c.awarenessWeight > 1)
    throw new Error("campaign.awarenessWeight must be in [0,1]");
}
