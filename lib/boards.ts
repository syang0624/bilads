import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Billboard, BillboardsFile } from "@/types";

let cached: BillboardsFile | null = null;

export function loadBoards(): BillboardsFile {
  if (!cached) {
    cached = JSON.parse(
      readFileSync(join(process.cwd(), "data", "billboards.json"), "utf8")
    ) as BillboardsFile;
  }
  return cached;
}

export function getBoard(id: string): Billboard | undefined {
  return loadBoards().find((b) => b.id === id);
}
