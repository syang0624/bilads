/**
 * /api/band — BAND agent collaboration room (SPONSORS.md §3).
 *
 * GET  ?roomId=<id>       → one room (discussion thread + status)
 * GET                      → all rooms
 * POST { action: "start", context: { brief, researcher?, mediaBuyer?, boardId?, concepts?, campaignWeeks? } }
 *                          → creates a room, five agents post their reasoning,
 *                            room lands in "awaiting_approval"
 * POST { action: "approve" | "reject", roomId, decidedBy?, note? }
 *                          → human decision appended + recorded in the
 *                            approval trail (InsForge)
 *
 * The frontend renders room.messages as a conversation.
 */
import { NextRequest, NextResponse } from "next/server";
import { startRoom, decideRoom, getRoom, listRooms, type BandContext } from "@/lib/band";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const roomId = req.nextUrl.searchParams.get("roomId");
  if (roomId) {
    const room = getRoom(roomId);
    if (!room) return NextResponse.json({ error: `unknown roomId: ${roomId}` }, { status: 404 });
    return NextResponse.json(room);
  }
  return NextResponse.json({ rooms: listRooms() });
}

interface BandPost {
  action: "start" | "approve" | "reject";
  context?: BandContext;
  roomId?: string;
  decidedBy?: string;
  note?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: BandPost;
  try {
    body = (await req.json()) as BandPost;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (body.action === "start") {
    if (!body.context?.brief?.productName) {
      return NextResponse.json({ error: "context.brief.productName is required" }, { status: 400 });
    }
    return NextResponse.json(startRoom(body.context));
  }

  if (body.action === "approve" || body.action === "reject") {
    if (!body.roomId) return NextResponse.json({ error: "roomId is required" }, { status: 400 });
    const room = await decideRoom(
      body.roomId,
      body.action === "approve" ? "approved" : "rejected",
      body.decidedBy ?? "campaign-owner",
      body.note
    );
    if (!room) return NextResponse.json({ error: `unknown roomId: ${body.roomId}` }, { status: 404 });
    return NextResponse.json(room);
  }

  return NextResponse.json({ error: `unknown action: ${(body as { action?: string }).action}` }, { status: 400 });
}
