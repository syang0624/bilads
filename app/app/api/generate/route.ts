import { NextRequest, NextResponse } from "next/server";
import type { GenerateRequest, GenerateResponse, Billboard } from "@/lib/types";
import billboardsData from "@/lib/billboards.json";

const billboards = billboardsData as Billboard[];

export async function POST(request: NextRequest) {
  const body = (await request.json()) as GenerateRequest;
  const board = billboards.find((b) => b.id === body.billboardId);

  if (!board) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  const variant = body.variant ?? 0;
  const isSpanish = board.spanishFriendly;

  // Mock creative concepts — in production this would be LLM + GMI image gen
  const concepts = [
    {
      id: `concept-${variant}-0`,
      language: "en" as const,
      headline: getHeadline(body.brief.productName, board.neighborhood, variant, "en"),
      subline: getSubline(body.brief.description, board, variant, "en"),
      imageUrl: `/api/placeholder?w=1024&h=512&text=${encodeURIComponent(body.brief.productName)}&v=${variant}-0`,
      rationale: `English concept for ${board.neighborhood} audience, ${board.trafficType} traffic.`,
    },
    {
      id: `concept-${variant}-1`,
      language: isSpanish ? ("es" as const) : ("en" as const),
      headline: getHeadline(body.brief.productName, board.neighborhood, variant, isSpanish ? "es" : "en"),
      subline: getSubline(body.brief.description, board, variant, isSpanish ? "es" : "en"),
      imageUrl: `/api/placeholder?w=1024&h=512&text=${encodeURIComponent(body.brief.productName)}&v=${variant}-1`,
      rationale: isSpanish
        ? `Spanish concept for ${board.neighborhood}'s Latino community.`
        : `Alternate English angle for ${board.neighborhood} viewers.`,
    },
  ];

  const response: GenerateResponse = { concepts };
  return NextResponse.json(response);
}

function getHeadline(name: string, _neighborhood: string, variant: number, lang: string): string {
  const en = [
    `${name}. Move Different.`,
    `${name}. Own Your City.`,
    `${name}. Start Here.`,
  ];
  const es = [
    `${name}. Muevete Diferente.`,
    `${name}. Tu Ciudad, Tu Estilo.`,
    `${name}. Empieza Aqui.`,
  ];
  const list = lang === "es" ? es : en;
  return list[variant % list.length];
}

function getSubline(_description: string, board: Billboard, variant: number, lang: string): string {
  const en = [
    `Made for ${board.neighborhood}. Made for you.`,
    `The smarter choice for ${board.neighborhood}.`,
    `Discover what's next in ${board.neighborhood}.`,
  ];
  const es = [
    `Hecho para ${board.neighborhood}. Hecho para ti.`,
    `La mejor opcion para ${board.neighborhood}.`,
    `Descubre lo nuevo en ${board.neighborhood}.`,
  ];
  const list = lang === "es" ? es : en;
  return list[variant % list.length];
}
