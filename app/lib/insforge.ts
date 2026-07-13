/**
 * InsForge — backend infrastructure client (SPONSORS.md §5).
 * Auth, database, storage, and agent-job-state tracking for Bilads.
 *
 * Configure with INSFORGE_BASE_URL + INSFORGE_API_KEY in .env.local. When not
 * configured (or the network is down) every operation transparently uses an
 * in-process store, so the demo works offline and no endpoint ever fails
 * because the system of record is unreachable.
 */
import { createAdminClient } from "@insforge/sdk";

/* --- schema ---------------------------------------------------------------- */

export const TABLES = [
  "organizations",
  "users",
  "brands",
  "products",
  "campaigns",
  "target_audiences",
  "candidate_locations",
  "location_signals",
  "media_channels",
  "creative_variants",
  "simulations",
  "agent_runs",
  "agent_messages",
  "approvals",
] as const;

export type TableName = (typeof TABLES)[number];

export interface Row {
  id: string;
  created_at: string;
  [key: string]: unknown;
}

/* --- transport -------------------------------------------------------------- */

const BASE_URL = process.env.INSFORGE_BASE_URL;
const API_KEY = process.env.INSFORGE_API_KEY;
let adminClient: ReturnType<typeof createAdminClient> | null = null;

export function insforgeConfigured(): boolean {
  return Boolean(BASE_URL && API_KEY);
}

function insforgeAdmin(): ReturnType<typeof createAdminClient> | null {
  if (!BASE_URL || !API_KEY) return null;
  adminClient ??= createAdminClient({ baseUrl: BASE_URL, apiKey: API_KEY });
  return adminClient;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`InsForge ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

/* --- in-memory fallback store ------------------------------------------------ */

const memory = new Map<TableName, Row[]>();
let seq = 0;

function memTable(table: TableName): Row[] {
  let rows = memory.get(table);
  if (!rows) {
    rows = [];
    memory.set(table, rows);
  }
  return rows;
}

/* --- database ---------------------------------------------------------------- */

export async function insertRow(table: TableName, data: Record<string, unknown>): Promise<Row> {
  const row: Row = { id: `${table}-${++seq}-${Date.now()}`, created_at: new Date().toISOString(), ...data };
  if (insforgeConfigured()) {
    try {
      return await api<Row>(`/api/database/records/${table}`, {
        method: "POST",
        body: JSON.stringify(row),
      });
    } catch {
      // fall through to memory — writes must never fail the request
    }
  }
  memTable(table).push(row);
  return row;
}

export async function listRows(
  table: TableName,
  filter?: (row: Row) => boolean
): Promise<Row[]> {
  if (insforgeConfigured()) {
    try {
      const rows = await api<Row[]>(`/api/database/records/${table}`);
      return filter ? rows.filter(filter) : rows;
    } catch {
      // fall through to memory
    }
  }
  const rows = memTable(table);
  return filter ? rows.filter(filter) : [...rows];
}

export async function updateRow(
  table: TableName,
  id: string,
  patch: Record<string, unknown>
): Promise<Row | null> {
  if (insforgeConfigured()) {
    try {
      return await api<Row>(`/api/database/records/${table}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    } catch {
      // fall through to memory
    }
  }
  const rows = memTable(table);
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  Object.assign(row, patch);
  return row;
}

/* --- auth (thin wrappers; memory fallback keeps demo flowing) ----------------- */

export interface Session {
  userId: string;
  email: string;
  token: string;
}

export async function signUp(email: string, password: string): Promise<Session> {
  if (insforgeConfigured()) {
    try {
      return await api<Session>("/api/auth/sign-up", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    } catch {
      // fall through
    }
  }
  const user = await insertRow("users", { email });
  return { userId: user.id, email, token: `local-${user.id}` };
}

export async function signIn(email: string, password: string): Promise<Session> {
  if (insforgeConfigured()) {
    try {
      return await api<Session>("/api/auth/sign-in", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    } catch {
      // fall through
    }
  }
  const users = await listRows("users", (u) => u.email === email);
  const user = users[0] ?? (await insertRow("users", { email }));
  return { userId: user.id, email, token: `local-${user.id}` };
}

/* --- storage ------------------------------------------------------------------ */

export interface StoredFile {
  url: string;
  key: string;
}

/** Upload server-generated bytes with the project-admin client. */
export async function uploadFile(
  bucket: string,
  name: string,
  bytes: Buffer,
  mimeType = "application/octet-stream"
): Promise<StoredFile | null> {
  const admin = insforgeAdmin();
  if (!admin) return null;

  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  const { data, error } = await admin.storage.from(bucket).upload(name, blob);
  if (error) throw error;
  if (!data?.url || !data.key) throw new Error("InsForge Storage upload returned no URL or key");
  return { url: data.url, key: data.key };
}

/** Download a known object through the authenticated server client. */
export async function downloadFile(bucket: string, key: string): Promise<Buffer | null> {
  const admin = insforgeAdmin();
  if (!admin) return null;

  const { data, error } = await admin.storage.from(bucket).download(key);
  if (error) throw error;
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}

/* --- campaign CRUD + approval trail + agent job state -------------------------- */

export async function createCampaign(data: Record<string, unknown>): Promise<Row> {
  return insertRow("campaigns", { status: "draft", ...data });
}

export async function updateCampaignStatus(id: string, status: string): Promise<Row | null> {
  return updateRow("campaigns", id, { status });
}

export async function listCampaigns(userId?: string): Promise<Row[]> {
  return listRows("campaigns", userId ? (c) => c.userId === userId : undefined);
}

/** Every human decision recorded with timestamp and context (approval trail). */
export async function recordApproval(data: {
  roomId: string;
  decision: "approved" | "rejected";
  decidedBy: string;
  context: unknown;
}): Promise<Row> {
  return insertRow("approvals", data);
}

/** Real-time agent status: which agent ran, live vs fallback, what it produced. */
export async function recordAgentRun(data: {
  agent: string;
  input: unknown;
  output: unknown;
  live: boolean;
}): Promise<Row> {
  return insertRow("agent_runs", { ...data, status: "completed" });
}

export async function recordAgentMessage(data: Record<string, unknown>): Promise<Row> {
  return insertRow("agent_messages", data);
}
