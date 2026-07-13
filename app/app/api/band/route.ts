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
import {
  startRoom,
  decideRoom,
  getRoom,
  listRooms,
  type BandContext,
  type BandRoom,
} from "@/lib/band";

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
  requestId?: string;
  context?: BandContext;
  roomId?: string;
  decidedBy?: string;
  note?: string;
}

// React Strict Mode can repeat an effect in development. Band does not expose
// an idempotency header, so deduplicate room creation at this application edge.
const startRequests = new Map<string, Promise<BandRoom>>();

function startRoomOnce(requestId: string | undefined, context: BandContext) {
  if (!requestId) return startRoom(context);
  const existing = startRequests.get(requestId);
  if (existing) return existing;

  const created = startRoom(context);
  startRequests.set(requestId, created);
  if (startRequests.size > 100) {
    const oldest = startRequests.keys().next().value as string | undefined;
    if (oldest && oldest !== requestId) startRequests.delete(oldest);
  }
  return created;
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
    if (body.requestId && body.requestId.length > 128) {
      return NextResponse.json({ error: "requestId is too long" }, { status: 400 });
    }
    const context = {
      ...body.context,
      brief: {
        productName: body.context.brief.productName,
        description: body.context.brief.description,
        audience: body.context.brief.audience,
      },
    };
    return NextResponse.json(await startRoomOnce(body.requestId, context));
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
