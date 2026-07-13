"use client";

import { useState, useEffect } from "react";
import type { ResearchResponse, Billboard } from "@/lib/types";

interface BandMessage {
  agent: string;
  role: string;
  emoji: string;
  message: string;
  type: "finding" | "recommendation" | "warning" | "approval";
}

function generateBandMessages(
  research: ResearchResponse,
  topBoards: Billboard[]
): BandMessage[] {
  const messages: BandMessage[] = [];
  const { researcher, mediaBuyer } = research;

  // Research Agent posts findings
  messages.push({
    agent: "Research Agent",
    role: "Market Intelligence",
    emoji: "🔍",
    message: `Target audience identified: ${researcher.audienceProfile.ageRange}, income ${researcher.audienceProfile.income}. Key interests: ${researcher.audienceProfile.interests.slice(0, 4).join(", ")}.`,
    type: "finding",
  });

  messages.push({
    agent: "Research Agent",
    role: "Market Intelligence",
    emoji: "🔍",
    message: `Buying triggers: ${researcher.buyingTriggers.join("; ")}. Recommend ${researcher.adToneGuidance.split(".")[0].toLowerCase()}.`,
    type: "finding",
  });

  // Media Planner explains reasoning
  if (topBoards.length > 0) {
    const board1 = topBoards[0];
    const ranking1 = mediaBuyer.rankings.find((r) => r.id === board1.id);
    messages.push({
      agent: "Media Planner",
      role: "Channel Strategy",
      emoji: "📊",
      message: `Top recommendation: ${board1.name} in ${board1.neighborhood}. ${board1.dailyImpressions.toLocaleString()} daily impressions, ${board1.trafficType} traffic. Demo match: ${ranking1 ? Math.round(ranking1.demoMatch * 100) : 0}%.`,
      type: "recommendation",
    });
  }

  if (topBoards.length > 1) {
    messages.push({
      agent: "Media Planner",
      role: "Channel Strategy",
      emoji: "📊",
      message: `Secondary locations: ${topBoards.slice(1).map((b) => `${b.name} (${b.neighborhood})`).join(", ")}. Budget allows all ${topBoards.length} placements simultaneously.`,
      type: "recommendation",
    });
  }

  // Creative Director
  const spanishBoard = topBoards.find((b) => b.spanishFriendly);
  messages.push({
    agent: "Creative Director",
    role: "Campaign Creative",
    emoji: "🎨",
    message: spanishBoard
      ? `${spanishBoard.neighborhood} has ${spanishBoard.demographics.hispanicSharePct}% Hispanic population. Recommend bilingual EN/ES concepts for ${spanishBoard.name}. Other locations get dual English concepts with neighborhood-tailored copy.`
      : `All locations receive dual English concepts. Adapting visual tone to each neighborhood's character — viewing distance and dwell time (${topBoards[0]?.avgDwellSeconds || 6}s avg) dictate headline length.`,
    type: "recommendation",
  });

  // Performance Analyst
  if (topBoards.length > 0) {
    const totalImpressions = topBoards.reduce(
      (sum, b) => sum + b.dailyImpressions * 7,
      0
    );
    messages.push({
      agent: "Performance Analyst",
      role: "Campaign Metrics",
      emoji: "📈",
      message: `Projected weekly reach across ${topBoards.length} locations: ${totalImpressions.toLocaleString()} impressions. Blended CPM estimate pending creative quality assessment.`,
      type: "finding",
    });
  }

  // Risk Agent
  messages.push({
    agent: "Risk Agent",
    role: "Brand Safety",
    emoji: "🛡️",
    message: `All placements cleared. No sensitive category conflicts. Reminder: generated visuals must not contain fabricated claims, logos, or pricing. Text overlays use approved copy only.`,
    type: "warning",
  });

  if (spanishBoard) {
    messages.push({
      agent: "Risk Agent",
      role: "Brand Safety",
      emoji: "🛡️",
      message: `Spanish copy for ${spanishBoard.name}: verify localization reads naturally (SF Mission Spanglish acceptable). Reject direct translations that sound robotic.`,
      type: "warning",
    });
  }

  // Human approval
  messages.push({
    agent: "Human",
    role: "Campaign Owner",
    emoji: "👤",
    message: `Approve top ${topBoards.length} locations. Proceed with creative generation.`,
    type: "approval",
  });

  return messages;
}

export default function BandDiscussion({
  research,
  topBoards,
  visible,
  onToggle,
}: {
  research: ResearchResponse;
  topBoards: Billboard[];
  visible: boolean;
  onToggle: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const messages = generateBandMessages(research, topBoards);

  useEffect(() => {
    if (!visible) {
      setVisibleCount(0);
      return;
    }
    setVisibleCount(0);
    let count = 0;
    const interval = setInterval(() => {
      count++;
      if (count > messages.length) {
        clearInterval(interval);
        return;
      }
      setVisibleCount(count);
    }, 800);
    return () => clearInterval(interval);
  }, [visible, messages.length]);

  if (!visible) {
    return (
      <button
        onClick={onToggle}
        className="w-full text-left bg-bilads-surface/50 border border-bilads-fg/10 rounded-lg p-3 text-xs font-mono text-bilads-fg/40 hover:text-bilads-fg/60 hover:border-bilads-fg/20 transition-colors"
      >
        View agent discussion →
      </button>
    );
  }

  return (
    <div className="bg-bilads-surface/50 border border-bilads-fg/10 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-bilads-fg/10">
        <span className="text-xs font-mono text-bilads-fg/50">
          BAND — Agent Collaboration Room
        </span>
        <button
          onClick={onToggle}
          className="text-xs text-bilads-fg/40 hover:text-bilads-fg"
        >
          &times;
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto p-3 space-y-3">
        {messages.slice(0, visibleCount).map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2 animate-fade-in ${
              msg.type === "approval" ? "bg-bilads-accent/5 rounded-lg p-2 -mx-1" : ""
            }`}
          >
            <span className="text-sm flex-shrink-0">{msg.emoji}</span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-xs font-bold ${
                    msg.type === "warning"
                      ? "text-orange-400"
                      : msg.type === "approval"
                        ? "text-bilads-accent"
                        : "text-bilads-fg/80"
                  }`}
                >
                  {msg.agent}
                </span>
                <span className="text-[10px] text-bilads-fg/30 font-mono">
                  {msg.role}
                </span>
              </div>
              <p className="text-xs text-bilads-fg/60 mt-0.5 leading-relaxed">
                {msg.message}
              </p>
            </div>
          </div>
        ))}
        {visibleCount < messages.length && (
          <div className="flex items-center gap-2 text-bilads-fg/30">
            <div className="w-1.5 h-1.5 bg-bilads-accent rounded-full animate-pulse" />
            <span className="text-[10px] font-mono">Agents deliberating...</span>
          </div>
        )}
      </div>
    </div>
  );
}
