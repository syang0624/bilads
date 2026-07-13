/**
 * Bearer-key gate for API routes exposed to external agent platforms (Kylon).
 *
 * A request is allowed when any of:
 *   - BILADS_API_KEY is unset (local dev; the deployed env always sets it)
 *   - Authorization: Bearer <BILADS_API_KEY> matches
 *   - it comes from our own frontend (browser same-origin fetch)
 */
import { NextRequest, NextResponse } from "next/server";

export function requireApiKey(req: NextRequest): NextResponse | null {
  const key = process.env.BILADS_API_KEY;
  if (!key) return null;
  if (req.headers.get("authorization") === `Bearer ${key}`) return null;
  if (req.headers.get("sec-fetch-site") === "same-origin") return null;
  return NextResponse.json(
    { error: "unauthorized: pass Authorization: Bearer <key>" },
    { status: 401 },
  );
}
