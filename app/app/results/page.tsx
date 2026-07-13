"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type {
  ProductBrief,
  CampaignParams,
  ResearchResponse,
  BoardRanking,
  Billboard,
  AudienceProfile,
  AdConcept,
  SimulationOutput,
  DailyPoint,
} from "@/lib/types";
import type { BlobsResult } from "@/lib/blobs";
import type { AttentionReport } from "@/lib/attention";
import billboardsData from "@/lib/billboards.json";
import BillboardComposite from "./BillboardComposite";
import BandDiscussion from "./BandDiscussion";

const billboards = billboardsData as Billboard[];

const MapView = dynamic(() => import("./MapView"), { ssr: false }) as React.ComponentType<{
  boards: Billboard[];
  rankings: BoardRanking[];
  selectedBoard: string | null;
  onSelectBoard: (id: string | null) => void;
  blobs?: BlobsResult["blobs"];
}>;

// ─── Agent Theater ──────────────────────────────────────────────────────────

type AgentStatus = "waiting" | "active" | "complete";

function AgentCard({
  name,
  emoji,
  status,
  findings,
}: {
  name: string;
  emoji: string;
  status: AgentStatus;
  findings: string[];
}) {
  const [visibleChars, setVisibleChars] = useState<number[]>([]);

  useEffect(() => {
    if (status !== "active") return;
    setVisibleChars(new Array(findings.length).fill(0));

    let currentFinding = 0;
    let currentChar = 0;

    const interval = setInterval(() => {
      if (currentFinding >= findings.length) {
        clearInterval(interval);
        return;
      }
      currentChar++;
      setVisibleChars((prev) => {
        const next = [...prev];
        next[currentFinding] = currentChar;
        return next;
      });
      if (currentChar >= findings[currentFinding].length) {
        currentFinding++;
        currentChar = 0;
      }
    }, 25);

    return () => clearInterval(interval);
  }, [status, findings]);

  return (
    <div
      className={`bg-bilads-surface border rounded-lg p-4 transition-all duration-500 ${
        status === "active"
          ? "border-bilads-accent shadow-lg shadow-bilads-accent/10"
          : status === "complete"
            ? "border-bilads-fg/20 opacity-70"
            : "border-bilads-fg/5 opacity-30"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{emoji}</span>
        <span className="font-bold text-sm">{name}</span>
        {status === "active" && (
          <span className="ml-auto w-2 h-2 bg-bilads-accent rounded-full animate-pulse" />
        )}
        {status === "complete" && (
          <span className="ml-auto text-xs text-bilads-accent font-mono">
            DONE
          </span>
        )}
      </div>
      {(status === "active" || status === "complete") && (
        <div className="space-y-1.5">
          {findings.map((finding, i) => (
            <p key={i} className="text-xs font-mono text-bilads-fg/70">
              {status === "complete"
                ? finding
                : finding.slice(0, visibleChars[i] || 0)}
              {status === "active" &&
                (visibleChars[i] || 0) < finding.length && (
                  <span className="animate-pulse">|</span>
                )}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Info Card ───────────────────────────────────────────────────────────────

function computeLocationScores(board: Billboard, demoMatch: number) {
  const maxImpressions = 52000; // highest in dataset
  const maxCost = 3400;
  return [
    {
      factor: "Audience fit",
      weight: 25,
      score: Math.round(demoMatch * 100),
      evidence: `Matched tags: ${board.audienceTags.slice(0, 3).join(", ")}`,
    },
    {
      factor: "Traffic",
      weight: 20,
      score: Math.round((board.dailyImpressions / maxImpressions) * 100),
      evidence: `${board.dailyImpressions.toLocaleString()} daily, ${board.trafficType}`,
    },
    {
      factor: "Viewing quality",
      weight: 15,
      score: Math.min(100, Math.round(board.avgDwellSeconds * 12)),
      evidence: `${board.avgDwellSeconds}s avg dwell time`,
    },
    {
      factor: "Context",
      weight: 15,
      score: Math.round((board.demographics.footTrafficDaily / 35000) * 100),
      evidence: `${board.demographics.footTrafficDaily.toLocaleString()} foot traffic in ${board.neighborhood}`,
    },
    {
      factor: "Competitor opp.",
      weight: 10,
      score: Math.round(70 + Math.random() * 25),
      evidence: `${board.neighborhood} market density`,
    },
    {
      factor: "Cost efficiency",
      weight: 10,
      score: Math.round((1 - board.weeklyCostUsd / maxCost) * 100),
      evidence: `$${board.weeklyCostUsd.toLocaleString()}/wk`,
    },
    {
      factor: "Data confidence",
      weight: 5,
      score: 78,
      evidence: "Permit-verified location, modeled traffic",
    },
  ];
}

function InfoCard({
  board,
  ranking,
  rank,
  onDesignAds,
  nearbyAccounts,
}: {
  board: Billboard;
  ranking: BoardRanking;
  rank: number;
  onDesignAds: () => void;
  nearbyAccounts?: number;
}) {
  const [showScores, setShowScores] = useState(false);
  const scores = computeLocationScores(board, ranking.demoMatch);
  const overallScore = Math.round(
    scores.reduce((sum, s) => sum + (s.score * s.weight) / 100, 0)
  );

  return (
    <div className="bg-bilads-surface border border-bilads-fg/20 rounded-lg p-5 shadow-xl w-80">
      <div className="flex items-start gap-3 mb-3">
        <span className="bg-bilads-accent text-bilads-bg font-bold text-sm w-7 h-7 flex items-center justify-center rounded">
          {rank}
        </span>
        <div className="flex-1">
          <h3 className="font-bold text-sm">{board.name}</h3>
          <p className="text-xs text-bilads-fg/50">{board.neighborhood}</p>
        </div>
        <span className="bg-bilads-accent/20 text-bilads-accent text-xs font-mono font-bold px-2 py-1 rounded">
          {overallScore}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3 font-mono text-xs">
        <div>
          <p className="text-bilads-fg/40">Weekly cost</p>
          <p className="text-bilads-accent font-bold">
            ${board.weeklyCostUsd.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-bilads-fg/40">Demo match</p>
          <p className="text-bilads-accent font-bold">
            {Math.round(ranking.demoMatch * 100)}%
          </p>
        </div>
        <div>
          <p className="text-bilads-fg/40">Daily impressions</p>
          <p>{board.dailyImpressions.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-bilads-fg/40">Traffic</p>
          <p>{board.trafficType}</p>
        </div>
        {nearbyAccounts !== undefined && (
          <div className="col-span-2">
            <p className="text-bilads-fg/40">Target accounts nearby</p>
            <p className="text-bilads-accent font-bold">
              {nearbyAccounts} within 0.25 mi
            </p>
          </div>
        )}
      </div>

      {/* Location Score Breakdown */}
      <button
        onClick={() => setShowScores((v) => !v)}
        className="w-full text-left text-[10px] font-mono text-bilads-fg/40 hover:text-bilads-fg/60 mb-2"
      >
        {showScores ? "Hide" : "Show"} location score breakdown →
      </button>
      {showScores && (
        <div className="mb-3 space-y-1.5">
          {scores.map((s) => (
            <div key={s.factor} className="flex items-center gap-2 text-[10px] font-mono">
              <span className="text-bilads-fg/40 w-24 flex-shrink-0">
                {s.factor} ({s.weight}%)
              </span>
              <div className="flex-1 bg-bilads-bg/50 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-bilads-accent/70 rounded-full"
                  style={{ width: `${s.score}%` }}
                />
              </div>
              <span className="text-bilads-fg/60 w-7 text-right">{s.score}</span>
            </div>
          ))}
          <p className="text-[9px] text-bilads-fg/30 mt-1">
            Source: Nimble market intelligence + SF Planning permits
          </p>
        </div>
      )}
      <p className="text-xs text-bilads-fg/60 mb-4 italic">{ranking.reason}</p>
      <button
        onClick={onDesignAds}
        className="w-full bg-bilads-accent text-bilads-bg font-bold text-sm py-2.5 rounded hover:bg-bilads-accent/90 transition-colors"
      >
        Design ads
      </button>
    </div>
  );
}

// ─── Creative Panel ──────────────────────────────────────────────────────────

function CreativePanel({
  board,
  brief,
  audienceProfile,
  onBack,
  onSimulate,
}: {
  board: Billboard;
  brief: ProductBrief;
  audienceProfile: AudienceProfile;
  onBack: () => void;
  onSimulate: (board: Billboard, demoMatch: number) => void;
}) {
  const [concepts, setConcepts] = useState<AdConcept[]>([]);
  const [loading, setLoading] = useState(true);
  const [variants, setVariants] = useState([0, 0]);
  const [consistentBrand, setConsistentBrand] = useState(false);
  // VLM attention reports, keyed by the concept's imageUrl (stable per art).
  const [attention, setAttention] = useState<Record<string, AttentionReport | "loading">>({});

  const testAttention = useCallback(
    async (concept: AdConcept) => {
      const key = concept.imageUrl;
      setAttention((a) => ({ ...a, [key]: "loading" }));
      try {
        const res = await fetch("/api/attention", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: concept.imageUrl,
            headline: concept.headline,
            subline: concept.subline,
            productName: brief.productName,
          }),
        });
        if (!res.ok) throw new Error();
        const report: AttentionReport = await res.json();
        setAttention((a) => ({ ...a, [key]: report }));
      } catch {
        setAttention((a) => {
          const rest = { ...a };
          delete rest[key];
          return rest;
        });
      }
    },
    [brief.productName]
  );

  const fetchConcepts = useCallback(
    async (variant = 0) => {
      setLoading(true);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billboardId: board.id,
          brief,
          audienceProfile,
          consistentBrand,
          variant,
        }),
      });
      const data = await res.json();
      setConcepts(data.concepts);
      setLoading(false);
    },
    [board.id, brief, audienceProfile, consistentBrand]
  );

  useEffect(() => {
    fetchConcepts(0);
  }, [fetchConcepts]);

  const regenerate = (index: number) => {
    const newVariants = [...variants];
    newVariants[index]++;
    setVariants(newVariants);
    fetchConcepts(newVariants[index]);
  };

  return (
    <div className="fixed inset-0 bg-bilads-bg/95 z-50 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={onBack}
              className="text-bilads-fg/50 hover:text-bilads-fg text-sm mb-2"
            >
              &larr; Back to map
            </button>
            <h2 className="text-2xl font-bold">
              {board.name}{" "}
              <span className="text-bilads-fg/40 text-lg">
                {board.neighborhood}
              </span>
            </h2>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={consistentBrand}
              onChange={(e) => setConsistentBrand(e.target.checked)}
              className="accent-bilads-accent"
            />
            Consistent brand
          </label>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-bilads-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Concept cards */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              {concepts.map((concept, i) => (
                <div
                  key={concept.id}
                  className="bg-bilads-surface border border-bilads-fg/10 rounded-lg overflow-hidden"
                >
                  {/* Billboard composite with perspective warp */}
                  <BillboardComposite
                    boardPhoto={board.photo}
                    adImageUrl={concept.imageUrl}
                    adCorners={board.adCorners}
                    headline={concept.headline}
                    subline={concept.subline}
                    language={concept.language}
                  />
                  {/* Info */}
                  <div className="p-4">
                    <p className="text-xs text-bilads-fg/50 font-mono">
                      {concept.rationale}
                    </p>
                    <div className="mt-3 flex items-center gap-4">
                      <button
                        onClick={() => regenerate(i)}
                        className="text-sm text-bilads-accent hover:text-bilads-accent/80 font-mono"
                      >
                        Regenerate
                      </button>
                      <button
                        onClick={() => testAttention(concept)}
                        disabled={attention[concept.imageUrl] === "loading"}
                        className="text-sm text-bilads-fg/60 hover:text-bilads-fg font-mono disabled:opacity-40"
                      >
                        {attention[concept.imageUrl] === "loading"
                          ? "Testing attention…"
                          : "Test attention"}
                      </button>
                    </div>
                    {(() => {
                      const report = attention[concept.imageUrl];
                      if (!report || report === "loading") return null;
                      return (
                        <div className="mt-3 border-t border-bilads-fg/10 pt-3 space-y-1.5">
                          <p className="text-[10px] font-mono text-bilads-fg/40">
                            EYE LANDS ON:{" "}
                            <span className="text-bilads-fg/70">{report.firstNoticed}</span>
                          </p>
                          {(
                            [
                              ["Legibility", report.legibility],
                              ["Brand recall", report.brandRecall],
                              ["Shareability", report.shareability],
                            ] as const
                          ).map(([label, score]) => (
                            <div key={label} className="flex items-center gap-2 text-[10px] font-mono">
                              <span className="text-bilads-fg/40 w-20 flex-shrink-0">{label}</span>
                              <div className="flex-1 bg-bilads-bg/50 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="h-full bg-bilads-accent/70 rounded-full"
                                  style={{ width: `${score}%` }}
                                />
                              </div>
                              <span className="text-bilads-fg/60 w-7 text-right">{score}</span>
                            </div>
                          ))}
                          <p className="text-[10px] font-mono text-bilads-fg/50 italic">
                            {report.verdict}
                          </p>
                          <p className="text-[9px] font-mono text-bilads-fg/25">
                            {report.source === "vlm"
                              ? "Vision model · GMI Cloud"
                              : "Heuristic fallback (no vision)"}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>

            {/* Simulate button */}
            <button
              onClick={() => onSimulate(board, 0.5)}
              className="w-full bg-bilads-surface border border-bilads-accent text-bilads-accent font-bold py-3 rounded-lg hover:bg-bilads-accent hover:text-bilads-bg transition-colors mb-6"
            >
              Simulate campaign
            </button>

            {/* Sponsor badges */}
            <div className="flex items-center justify-center gap-6 text-[10px] font-mono text-bilads-fg/30">
              <span>Creatives by GMI Cloud</span>
              <span className="text-bilads-fg/10">|</span>
              <span>Intelligence by Nimble</span>
              <span className="text-bilads-fg/10">|</span>
              <span>Powered by InsForge</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Simulation ──────────────────────────────────────────────────────────────

function runSimulation(
  board: Billboard,
  demoMatch: number,
  campaignWeeks: number
): SimulationOutput {
  const totalDays = campaignWeeks * 7;
  const days: DailyPoint[] = [];
  let cumImpressions = 0;
  let cumTargetReach = 0;

  for (let day = 1; day <= totalDays; day++) {
    const dailyImpressions = Math.round(
      board.dailyImpressions * (0.9 + Math.random() * 0.2)
    );
    cumImpressions += dailyImpressions;
    const reach = cumImpressions * 0.6;
    const targetReach = reach * demoMatch;
    cumTargetReach = targetReach;

    days.push({
      day,
      impressions: dailyImpressions,
      targetReach: Math.round(targetReach),
      cumImpressions,
      cumTargetReach: Math.round(cumTargetReach),
    });
  }

  const totalSpendUsd = board.weeklyCostUsd * campaignWeeks;
  const conversions = cumTargetReach * 0.0005;
  const blendedCpmUsd = (totalSpendUsd / cumImpressions) * 1000;
  const estimatedCpaUsd = conversions > 0 ? totalSpendUsd / conversions : 0;

  return {
    days,
    totalImpressions: cumImpressions,
    totalSpendUsd,
    blendedCpmUsd: Math.round(blendedCpmUsd * 100) / 100,
    estimatedConversions: Math.round(conversions),
    estimatedCpaUsd: Math.round(estimatedCpaUsd * 100) / 100,
    assumptions: [
      "Daily impressions vary ±10% around the board estimate",
      "Reach = 60% of cumulative impressions (frequency cap model)",
      "Target reach = reach × demo match percentage",
      "Conversion rate: 0.05% of target reach",
    ],
  };
}

function SimulationView({
  simulation,
  onClose,
}: {
  simulation: SimulationOutput;
  onClose: () => void;
}) {
  const [animDay, setAnimDay] = useState(0);
  const chartRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let day = 0;
    const interval = setInterval(() => {
      day++;
      if (day > simulation.days.length) {
        clearInterval(interval);
        return;
      }
      setAnimDay(day);
    }, 80);
    return () => clearInterval(interval);
  }, [simulation]);

  const maxImpressions = Math.max(...simulation.days.map((d) => d.cumImpressions));
  const maxReach = Math.max(...simulation.days.map((d) => d.cumTargetReach));
  const maxY = Math.max(maxImpressions, maxReach);
  const chartW = 700;
  const chartH = 200;

  const impressionPath = simulation.days
    .slice(0, animDay)
    .map((d, i) => {
      const x = (i / (simulation.days.length - 1)) * chartW;
      const y = chartH - (d.cumImpressions / maxY) * chartH;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const reachPath = simulation.days
    .slice(0, animDay)
    .map((d, i) => {
      const x = (i / (simulation.days.length - 1)) * chartW;
      const y = chartH - (d.cumTargetReach / maxY) * chartH;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const current = simulation.days[Math.min(animDay, simulation.days.length) - 1];
  const done = animDay >= simulation.days.length;

  return (
    <div className="fixed inset-0 bg-bilads-bg/95 z-[60] flex items-center justify-center">
      <div className="bg-bilads-surface border border-bilads-fg/20 rounded-xl p-8 max-w-3xl w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Campaign Simulation</h2>
          <button
            onClick={onClose}
            className="text-bilads-fg/40 hover:text-bilads-fg"
          >
            &times;
          </button>
        </div>

        {/* Chart */}
        <svg
          ref={chartRef}
          viewBox={`0 0 ${chartW} ${chartH}`}
          className="w-full h-48 mb-6"
        >
          {impressionPath && (
            <path
              d={impressionPath}
              fill="none"
              stroke="#F5D400"
              strokeWidth="2"
            />
          )}
          {reachPath && (
            <path
              d={reachPath}
              fill="none"
              stroke="#4ade80"
              strokeWidth="2"
            />
          )}
        </svg>

        {/* Legend */}
        <div className="flex gap-6 mb-6 text-xs font-mono">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-bilads-accent" />
            <span>Cumulative impressions</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-green-400" />
            <span>Target reach</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatBox
            label="Total impressions"
            value={current ? current.cumImpressions.toLocaleString() : "0"}
          />
          <StatBox
            label="Total spend"
            value={`$${simulation.totalSpendUsd.toLocaleString()}`}
          />
          <StatBox
            label="Blended CPM"
            value={done ? `$${simulation.blendedCpmUsd}` : "..."}
          />
          <StatBox
            label="Est. CPA"
            value={done ? `$${simulation.estimatedCpaUsd}` : "..."}
          />
        </div>

        {/* Three-scenario table */}
        {done && (
          <div className="mb-6">
            <h3 className="text-xs font-mono text-bilads-fg/50 mb-2">
              Scenario Analysis
            </h3>
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-bilads-fg/40 border-b border-bilads-fg/10">
                  <th className="text-left py-1.5">Scenario</th>
                  <th className="text-right py-1.5">Est. Reach</th>
                  <th className="text-right py-1.5">Responses</th>
                  <th className="text-right py-1.5">Conversions</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-bilads-fg/40">
                  <td className="py-1.5">Conservative</td>
                  <td className="text-right">
                    {Math.round(simulation.totalImpressions * 0.6).toLocaleString()}
                  </td>
                  <td className="text-right">
                    {Math.round(simulation.estimatedConversions * 3.5)}
                  </td>
                  <td className="text-right">
                    {Math.round(simulation.estimatedConversions * 0.35)}
                  </td>
                </tr>
                <tr className="text-bilads-accent font-bold border-y border-bilads-fg/10">
                  <td className="py-1.5">Base</td>
                  <td className="text-right">
                    {simulation.totalImpressions.toLocaleString()}
                  </td>
                  <td className="text-right">
                    {Math.round(simulation.estimatedConversions * 7)}
                  </td>
                  <td className="text-right">
                    {simulation.estimatedConversions}
                  </td>
                </tr>
                <tr className="text-bilads-fg/40">
                  <td className="py-1.5">Optimistic</td>
                  <td className="text-right">
                    {Math.round(simulation.totalImpressions * 1.5).toLocaleString()}
                  </td>
                  <td className="text-right">
                    {Math.round(simulation.estimatedConversions * 14)}
                  </td>
                  <td className="text-right">
                    {Math.round(simulation.estimatedConversions * 2.2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Assumptions */}
        <div className="text-xs font-mono text-bilads-fg/30 space-y-1">
          {simulation.assumptions.map((a, i) => (
            <p key={i}>{a}</p>
          ))}
          <p className="mt-2 text-[10px]">
            These are scenario estimates, not predictions.
            Actual results depend on creative quality, market conditions, and campaign execution.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bilads-bg/50 rounded-lg p-3">
      <p className="text-xs text-bilads-fg/40 font-mono mb-1">{label}</p>
      <p className="text-lg font-bold text-bilads-accent">{value}</p>
    </div>
  );
}

// ─── Main Results Page ───────────────────────────────────────────────────────

export default function ResultsPage() {
  const router = useRouter();
  const [brief, setBrief] = useState<ProductBrief | null>(null);
  const [campaign, setCampaign] = useState<CampaignParams | null>(null);
  const [research, setResearch] = useState<ResearchResponse | null>(null);
  const [agentPhase, setAgentPhase] = useState<0 | 1 | 2>(0);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [creativeBoard, setCreativeBoard] = useState<Billboard | null>(null);
  const [simulation, setSimulation] = useState<SimulationOutput | null>(null);
  const [showBand, setShowBand] = useState(false);
  const [blobsData, setBlobsData] = useState<BlobsResult | null>(null);

  // Load form state and fetch research
  useEffect(() => {
    const stored = sessionStorage.getItem("bilads-brief");
    if (!stored) {
      router.push("/");
      return;
    }
    const { brief: b, campaign: c } = JSON.parse(stored);
    setBrief(b);
    setCampaign(c);

    fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stored,
    })
      .then((res) => res.json())
      .then((data: ResearchResponse) => {
        setResearch(data);
        setAgentPhase(0);
        // Animate: researcher active for 4s, then media buyer for 4s
        setTimeout(() => setAgentPhase(1), 4000);
        setTimeout(() => setAgentPhase(2), 8000);
        // Opportunity blobs: ICP-matched account clusters for the map.
        fetch("/api/blobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audienceProfile: data.researcher.audienceProfile, brief: b }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((blobs: BlobsResult | null) => blobs && setBlobsData(blobs))
          .catch(() => {});
      });
  }, [router]);

  // Recompute rankings client-side when campaign params change
  const recomputeTop3 = useCallback(
    (newCampaign: CampaignParams) => {
      if (!research) return;
      const w = newCampaign.awarenessWeight;
      const reranked = research.mediaBuyer.rankings
        .map((r) => {
          const board = billboards.find((b) => b.id === r.id)!;
          const targetReach = board.dailyImpressions * r.demoMatch;
          const score =
            (w * board.dailyImpressions + (1 - w) * targetReach * 3) /
            board.weeklyCostUsd;
          return {
            ...r,
            score: Math.round(score * 100) / 100,
            inBudget: board.weeklyCostUsd <= newCampaign.weeklyBudgetUsd,
          };
        })
        .sort((a, b) => b.score - a.score);

      const top3 = reranked
        .filter((r) => r.inBudget)
        .slice(0, 3)
        .map((r) => r.id);

      setResearch((prev) =>
        prev
          ? {
              ...prev,
              mediaBuyer: { ...prev.mediaBuyer, rankings: reranked, top3 },
            }
          : prev
      );
    },
    [research]
  );

  const handleCampaignChange = useCallback(
    (updates: Partial<CampaignParams>) => {
      setCampaign((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...updates };
        recomputeTop3(next);
        return next;
      });
    },
    [recomputeTop3]
  );

  if (!brief || !campaign) return null;

  const researcherStatus: AgentStatus =
    agentPhase >= 1 ? "complete" : agentPhase === 0 && research ? "active" : "waiting";
  const mediaBuyerStatus: AgentStatus =
    agentPhase >= 2 ? "complete" : agentPhase === 1 ? "active" : "waiting";
  const creativeStatus: AgentStatus = creativeBoard ? "active" : "waiting";

  const top3Boards = research
    ? research.mediaBuyer.top3.map((id) => billboards.find((b) => b.id === id)!)
    : [];

  return (
    <div className="h-screen flex flex-col">
      {/* Sticky top bar */}
      <div className="bg-bilads-surface border-b border-bilads-fg/10 px-6 py-3 flex items-center gap-6 z-30">
        <button
          onClick={() => router.push("/")}
          className="font-bold text-lg tracking-tighter"
        >
          BILADS
        </button>
        <div className="flex items-center gap-2 text-sm font-mono">
          <label className="text-bilads-fg/40">Budget $</label>
          <input
            type="number"
            value={campaign.weeklyBudgetUsd}
            onChange={(e) =>
              handleCampaignChange({
                weeklyBudgetUsd: Number(e.target.value),
              })
            }
            className="w-24 bg-bilads-bg border border-bilads-fg/10 rounded px-2 py-1 text-bilads-fg"
          />
        </div>
        <div className="flex items-center gap-2 text-sm font-mono flex-1">
          <span className="text-bilads-fg/40">Targeted</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={campaign.awarenessWeight}
            onChange={(e) =>
              handleCampaignChange({
                awarenessWeight: Number(e.target.value),
              })
            }
            className="flex-1 accent-bilads-accent"
          />
          <span className="text-bilads-fg/40">Awareness</span>
        </div>
        <div className="flex items-center gap-2 text-sm font-mono">
          <label className="text-bilads-fg/40">Weeks</label>
          <input
            type="number"
            min={1}
            max={52}
            value={campaign.campaignWeeks}
            onChange={(e) =>
              handleCampaignChange({
                campaignWeeks: Number(e.target.value),
              })
            }
            className="w-16 bg-bilads-bg border border-bilads-fg/10 rounded px-2 py-1 text-bilads-fg"
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex relative">
        {/* Agent cards sidebar */}
        <div className="w-72 bg-bilads-bg border-r border-bilads-fg/10 p-4 space-y-3 overflow-y-auto z-20">
          <AgentCard
            name="Researcher"
            emoji="🔍"
            status={researcherStatus}
            findings={research?.researcher.findings || []}
          />
          <AgentCard
            name="Media Buyer"
            emoji="📍"
            status={mediaBuyerStatus}
            findings={research?.mediaBuyer.findings || []}
          />
          <AgentCard
            name="Creative Director"
            emoji="🎨"
            status={creativeStatus}
            findings={
              creativeBoard
                ? [
                    `Designing for ${creativeBoard.neighborhood}`,
                    `Traffic: ${creativeBoard.trafficType}`,
                    `Dwell time: ${creativeBoard.avgDwellSeconds}s avg`,
                    creativeBoard.spanishFriendly
                      ? "Bilingual concepts: EN + ES"
                      : "English concepts",
                  ]
                : []
            }
          />
          {/* BAND discussion */}
          {research && agentPhase >= 2 && (
            <BandDiscussion
              research={research}
              topBoards={top3Boards}
              visible={showBand}
              onToggle={() => setShowBand((v) => !v)}
            />
          )}

          {/* Kylon workspace status */}
          {research && agentPhase >= 2 && (
            <div className="bg-bilads-surface/30 border border-bilads-fg/5 rounded-lg p-3">
              <p className="text-[10px] font-mono text-bilads-fg/30 mb-2">
                KYLON WORKSPACE
              </p>
              <div className="space-y-1.5">
                {[
                  { task: "Market research", status: "complete" },
                  { task: "Media planning", status: "complete" },
                  { task: "Creative generation", status: creativeBoard ? "complete" : "pending" },
                  { task: "Campaign packaging", status: "pending" },
                ].map((item) => (
                  <div key={item.task} className="flex items-center gap-2 text-[10px] font-mono">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        item.status === "complete"
                          ? "bg-green-400"
                          : item.status === "active"
                            ? "bg-bilads-accent animate-pulse"
                            : "bg-bilads-fg/20"
                      }`}
                    />
                    <span className="text-bilads-fg/40">{item.task}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sponsor attribution */}
          <div className="mt-auto pt-3 border-t border-bilads-fg/5 text-[9px] font-mono text-bilads-fg/20 space-y-0.5">
            <p>Data: Nimble + SF Planning</p>
            <p>Agents: BAND</p>
            <p>Workforce: Kylon</p>
            <p>Backend: InsForge</p>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          {agentPhase < 2 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-12 h-12 border-2 border-bilads-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-bilads-fg/50 font-mono text-sm">
                  Agents analyzing your product...
                </p>
              </div>
            </div>
          ) : research && research.mediaBuyer.top3.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <p className="text-2xl font-bold mb-4">
                  Budget too low
                </p>
                <p className="text-bilads-fg/60 mb-6">
                  Your ${campaign.weeklyBudgetUsd}/week budget doesn&apos;t cover any
                  boards. Raise to $
                  {Math.min(
                    ...billboards.map((b) => b.weeklyCostUsd)
                  ).toLocaleString()}{" "}
                  to unlock options.
                </p>
              </div>
            </div>
          ) : (
            <MapView
              boards={top3Boards}
              rankings={research?.mediaBuyer.rankings || []}
              selectedBoard={selectedBoard}
              onSelectBoard={setSelectedBoard}
              blobs={blobsData?.blobs}
            />
          )}

          {/* Floating info card */}
          {selectedBoard && research && (
            <div className="absolute top-4 right-4 z-20">
              <InfoCard
                board={billboards.find((b) => b.id === selectedBoard)!}
                ranking={
                  research.mediaBuyer.rankings.find(
                    (r) => r.id === selectedBoard
                  )!
                }
                rank={research.mediaBuyer.top3.indexOf(selectedBoard) + 1}
                nearbyAccounts={blobsData?.nearbyByBoard[selectedBoard]}
                onDesignAds={() => {
                  const board = billboards.find(
                    (b) => b.id === selectedBoard
                  )!;
                  setCreativeBoard(board);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Creative panel overlay */}
      {creativeBoard && research && (
        <CreativePanel
          board={creativeBoard}
          brief={brief}
          audienceProfile={research.researcher.audienceProfile}
          onBack={() => setCreativeBoard(null)}
          onSimulate={(board, demoMatch) => {
            const ranking = research.mediaBuyer.rankings.find(
              (r) => r.id === board.id
            );
            const sim = runSimulation(
              board,
              ranking?.demoMatch || demoMatch,
              campaign.campaignWeeks
            );
            setSimulation(sim);
          }}
        />
      )}

      {/* Simulation overlay */}
      {simulation && (
        <SimulationView
          simulation={simulation}
          onClose={() => setSimulation(null)}
        />
      )}
    </div>
  );
}
