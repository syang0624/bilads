import { NextRequest, NextResponse } from "next/server";
import type {
  ResearchRequest,
  ResearchResponse,
  Billboard,
  BoardRanking,
  AudienceProfile,
} from "@/lib/types";
import billboardsData from "@/lib/billboards.json";

const billboards = billboardsData as Billboard[];

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function rankBoards(
  audienceProfile: AudienceProfile,
  weeklyBudgetUsd: number,
  awarenessWeight: number
): { rankings: BoardRanking[]; top3: string[] } {
  const w = awarenessWeight;

  const ranked = billboards
    .map((board) => {
      const demoMatch = jaccard(audienceProfile.interests, board.audienceTags);
      const targetReach = board.dailyImpressions * demoMatch;
      // Corrected formula: w=1 means pure awareness (raw impressions)
      const valueScore =
        (w * board.dailyImpressions + (1 - w) * targetReach * 3) /
        board.weeklyCostUsd;

      return {
        id: board.id,
        score: Math.round(valueScore * 100) / 100,
        demoMatch: Math.round(demoMatch * 100) / 100,
        reason: generateReason(board, demoMatch),
        inBudget: board.weeklyCostUsd <= weeklyBudgetUsd,
      };
    })
    .sort((a, b) => b.score - a.score);

  const top3 = ranked
    .filter((r) => r.inBudget)
    .slice(0, 3)
    .map((r) => r.id);

  return { rankings: ranked, top3 };
}

function generateReason(board: Billboard, demoMatch: number): string {
  const traits = board.audienceTags.slice(0, 3).join(", ");
  if (demoMatch > 0.3) return `Strong audience overlap: ${traits}.`;
  if (demoMatch > 0.15) return `Moderate match in ${board.neighborhood} for ${traits}.`;
  return `High visibility in ${board.neighborhood}, broad reach.`;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ResearchRequest;

  // Mock researcher output — in production this would be an LLM call
  const audienceProfile: AudienceProfile = {
    ageRange: "25-40",
    income: "$60k-$120k",
    interests: extractInterests(body.brief.audience, body.brief.description),
    mindset:
      "Looking for products that fit their urban lifestyle and values.",
  };

  const { rankings, top3 } = rankBoards(
    audienceProfile,
    body.campaign.weeklyBudgetUsd,
    body.campaign.awarenessWeight
  );

  const response: ResearchResponse = {
    researcher: {
      audienceProfile,
      buyingTriggers: [
        "Visibility during daily commute",
        "Neighborhood relevance and local trust",
        "Repetitive exposure building brand recall",
      ],
      adToneGuidance: `Focus on urban authenticity and practical value. The audience responds to bold, honest messaging that respects their time and intelligence. Use neighborhood-specific references where possible.`,
      findings: [
        `Target audience: ${audienceProfile.ageRange}, urban professionals in SF`,
        `Key interests: ${audienceProfile.interests.slice(0, 4).join(", ")}`,
        `Best neighborhoods: high foot traffic + audience overlap areas`,
        `Recommended tone: bold, authentic, locally-rooted messaging`,
      ],
    },
    mediaBuyer: {
      rankings,
      top3,
      findings: [
        `Evaluated ${billboards.length} SF billboard locations`,
        `Top 3 boards selected within $${body.campaign.weeklyBudgetUsd}/week budget`,
        `Awareness weight: ${Math.round(body.campaign.awarenessWeight * 100)}% — ${body.campaign.awarenessWeight > 0.5 ? "prioritizing raw impressions" : "prioritizing audience match"}`,
        `Best value: ${rankings[0]?.id || "none"} at score ${rankings[0]?.score || 0}`,
      ],
    },
  };

  return NextResponse.json(response);
}

function extractInterests(audience: string, description: string): string[] {
  const text = `${audience} ${description}`.toLowerCase();
  const allTags = [
    "commuters", "tech", "office workers", "professionals", "finance",
    "startups", "young professionals", "fitness", "outdoors", "eco-conscious",
    "affluent", "creatives", "foodies", "coffee", "nightlife", "walkable",
    "latino", "families", "students", "suburban", "value-seekers", "tourists",
    "shoppers",
  ];
  const matched = allTags.filter((tag) => {
    const words = tag.split(/[\s-]+/);
    return words.some((w) => text.includes(w));
  });
  // Always return at least 3 interests
  if (matched.length < 3) {
    return [...matched, "young professionals", "commuters", "urban"].slice(0, 5);
  }
  return matched.slice(0, 7);
}
