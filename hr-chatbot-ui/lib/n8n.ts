/**
 * Helpers for talking to an n8n Chat Trigger node.
 *
 * The Chat Trigger (in "Embedded Chat" mode) expects:
 *   POST <chat url>
 *   { "action": "sendMessage", "sessionId": "...", "chatInput": "..." }
 *
 * What comes back depends on the node's "Response Mode":
 *   - "When Last Node Finishes"  -> JSON like { "output": "..." } (AI Agent)
 *   - "Using Respond to Webhook" -> whatever your Respond node returns
 *   - "Streaming"                -> newline-delimited JSON chunks
 *                                   { "type": "item", "content": "..." }
 * extractReply() handles all of these.
 */

const TEXT_KEYS = ["output", "text", "response", "answer", "message", "reply"];

function pickText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = pickText(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of TEXT_KEYS) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }
    // e.g. { json: { output: "..." } } or { data: { output: "..." } }
    for (const key of ["json", "data", "body"]) {
      const found = pickText(obj[key]);
      if (found) return found;
    }
  }
  return null;
}

function parseStream(raw: string): string | null {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2 && !raw.includes('"type"')) return null;

  let text = "";
  let sawChunk = false;
  for (const line of lines) {
    try {
      const chunk = JSON.parse(line);
      if (chunk?.type === "item" && typeof chunk.content === "string") {
        text += chunk.content;
        sawChunk = true;
      }
    } catch {
      return null; // not NDJSON
    }
  }
  return sawChunk ? text : null;
}

export function extractReply(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return pickText(JSON.parse(trimmed));
  } catch {
    // Not a single JSON document - maybe a streaming response.
    const streamed = parseStream(trimmed);
    if (streamed !== null) return streamed;
    // Plain text response.
    return trimmed;
  }
}
