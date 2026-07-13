/**
 * Nimble — live market & location intelligence (SPONSORS.md §1).
 *
 * The Researcher agent consumes these signals as extra prompt context so the
 * market intelligence demonstrably influences `audienceProfile.interests` and
 * `findings`. Nimble-sourced findings are tagged with the "[Nimble] " prefix —
 * the frontend strips the prefix and renders a "Source: Nimble" badge.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface NimbleSignal {
  location: string;
  signals: string[];
  source_urls: string[];
  confidence: number;
}

export interface NimbleSignalsFile {
  generated_at: string;
  note: string;
  market: NimbleSignal;
  boards: Record<string, NimbleSignal>;
}

export const NIMBLE_TAG = "[Nimble] ";

let cached: NimbleSignalsFile | null = null;

export function loadNimbleSignals(): NimbleSignalsFile | null {
  if (cached) return cached;
  try {
    cached = JSON.parse(
      readFileSync(join(process.cwd(), "data", "nimble-signals", "signals.json"), "utf8")
    ) as NimbleSignalsFile;
    return cached;
  } catch {
    return null; // signals are enrichment, never a hard dependency
  }
}

export function nimbleForBoard(boardId: string): NimbleSignal | null {
  return loadNimbleSignals()?.boards[boardId] ?? null;
}

/** Compact block injected into the Researcher prompt. */
export function nimblePromptBlock(): string {
  const data = loadNimbleSignals();
  if (!data) return "";
  const lines: string[] = [
    "LIVE MARKET INTELLIGENCE (Nimble — nearby businesses, retail density, transit, events, competitors):",
    `- ${data.market.location}: ${data.market.signals.join("; ")}`,
  ];
  for (const [id, sig] of Object.entries(data.boards)) {
    lines.push(`- ${id} (${sig.location}): ${sig.signals.join("; ")}`);
  }
  lines.push(
    "Let these signals influence audienceProfile.interests and findings. " +
      `Prefix any finding derived from this intelligence with "${NIMBLE_TAG.trim()} ".`
  );
  return lines.join("\n");
}

/** One deterministic Nimble finding for the fallback Researcher path. */
export function nimbleFallbackFinding(): string | null {
  const data = loadNimbleSignals();
  if (!data) return null;
  return `${NIMBLE_TAG}${data.market.signals[0]}.`;
}
