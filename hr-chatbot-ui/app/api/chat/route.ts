import { NextResponse } from "next/server";
import { extractReply } from "@/lib/n8n";

// The browser calls this route; this route calls n8n.
// That keeps the n8n URL (and any Basic Auth password) on the server
// and avoids CORS problems.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2000;

type ChatRequest = { message?: unknown; sessionId?: unknown };

function mockReply(message: string): string {
  return [
    `**(Mock mode)** You asked: _"${message}"_`,
    "",
    "When `MOCK_N8N=false`, this answer will come from your n8n workflow. For example, a leave question might return:",
    "",
    "- **Annual leave:** 14 days per year",
    "- **Casual leave:** 7 days per year",
    "- Apply through the HR portal at least 3 days in advance",
  ].join("\n");
}

export async function POST(req: Request) {
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";

  if (!message) {
    return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` },
      { status: 400 }
    );
  }
  if (!sessionId || sessionId.length > 100) {
    return NextResponse.json({ error: "Missing or invalid sessionId." }, { status: 400 });
  }

  if (process.env.MOCK_N8N === "true") {
    await new Promise((r) => setTimeout(r, 700));
    return NextResponse.json({ reply: mockReply(message) });
  }

  const url = process.env.N8N_CHAT_URL;
  if (!url) {
    return NextResponse.json(
      { error: "Server is not configured: N8N_CHAT_URL is missing in .env.local." },
      { status: 500 }
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const user = process.env.N8N_CHAT_USER;
  const pass = process.env.N8N_CHAT_PASSWORD;
  if (user && pass) {
    headers.Authorization = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  }

  const timeoutMs = Number(process.env.N8N_TIMEOUT_MS) || 60000;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "sendMessage", sessionId, chatInput: message }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });

    const raw = await res.text();

    if (!res.ok) {
      console.error(`[chat] n8n returned ${res.status}:`, raw.slice(0, 500));
      const hint =
        res.status === 404
          ? " Is the workflow active, and are you using the right (test vs production) URL?"
          : res.status === 401 || res.status === 403
          ? " Check N8N_CHAT_USER / N8N_CHAT_PASSWORD."
          : "";
      return NextResponse.json(
        { error: `The HR assistant is unavailable (n8n error ${res.status}).${hint}` },
        { status: 502 }
      );
    }

    const reply = extractReply(raw);
    if (!reply) {
      console.error("[chat] Could not find a reply in n8n response:", raw.slice(0, 500));
      return NextResponse.json(
        { error: "The assistant returned an empty answer. Check the last node of your workflow." },
        { status: 502 }
      );
    }

    return NextResponse.json({ reply });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    console.error("[chat] Request to n8n failed:", err);
    return NextResponse.json(
      {
        error: isTimeout
          ? "The assistant took too long to answer. Please try again."
          : "Could not reach the HR assistant. Is n8n running?",
      },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
