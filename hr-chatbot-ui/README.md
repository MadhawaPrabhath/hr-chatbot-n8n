# HR Chatbot UI

A Next.js chat interface for the n8n HR chatbot (RAG over HR policy documents from Google Drive).

```
Browser (React UI)  ──►  /api/chat (Next.js server)  ──►  n8n Chat Trigger  ──►  AI Agent + vector DB
```

The browser never calls n8n directly. The Next.js API route forwards the message, which keeps the
n8n URL and password secret and avoids CORS errors.

## Features

- Chat window with Markdown answers (lists, bold, tables, links)
- Suggested questions on the welcome screen
- Conversation memory: a `sessionId` is sent with every message, so n8n's memory node remembers the chat
- Chat history kept after page refresh; **New chat** starts a fresh session
- Typing indicator, clear error messages, and a **Try again** button
- Light/dark mode and mobile layout
- Mock mode to work on the UI without n8n running

## 1. Set up the n8n side

In your workflow, open the **When chat message received** (Chat Trigger) node:

1. Turn on **Make Chat Publicly Available**.
2. **Mode:** `Embedded Chat`.
3. **Authentication:** `None` for local testing, or `Basic Auth` (then fill in the password in `.env.local`).
4. **Allowed Origins (CORS):** can stay `*` — the request comes from the Next.js server, not the browser.
5. **Options → Response Mode:** `When Last Node Finishes` (recommended). `Streaming` also works.
6. Copy the **Chat URL** (ends with `/chat`).
   - Test URL works only while you click "Test workflow".
   - Production URL works when the workflow is **Active**.

For memory between messages, connect a memory node (e.g. *Simple Memory* or *Postgres Chat Memory*)
to your AI Agent. It uses the `sessionId` this UI sends automatically.

## 2. Run the UI

Needs Node.js 18.18 or newer.

```bash
npm install
cp .env.example .env.local   # Windows: copy .env.example .env.local
# edit .env.local and paste your Chat URL into N8N_CHAT_URL
npm run dev
```

Open http://localhost:3000.

To try the UI without n8n, set `MOCK_N8N=true` in `.env.local`.

### Environment variables

| Variable | Required | What it is |
|---|---|---|
| `N8N_CHAT_URL` | yes | Chat URL from the Chat Trigger node |
| `N8N_CHAT_USER` / `N8N_CHAT_PASSWORD` | no | Only if the Chat Trigger uses Basic Auth |
| `N8N_TIMEOUT_MS` | no | Max wait for an answer (default 60000) |
| `MOCK_N8N` | no | `true` returns fake answers |

## Request format

The API route sends this to n8n:

```json
{ "action": "sendMessage", "sessionId": "<uuid>", "chatInput": "How many leave days do I get?" }
```

and reads the answer from `output` (the AI Agent default). It also understands `text`, `response`,
`answer`, array responses and streaming responses — see `lib/n8n.ts`.

## Troubleshooting

| Error in the chat | Fix |
|---|---|
| n8n error 404 | Workflow not active, or you used the Test URL without clicking "Test workflow" |
| n8n error 401/403 | Basic Auth username/password in `.env.local` don't match the node |
| Could not reach the HR assistant | n8n isn't running, or `N8N_CHAT_URL` host/port is wrong |
| Empty answer | The last node doesn't output an `output`/`text` field |
| Took too long | Raise `N8N_TIMEOUT_MS`, or check the agent for slow tools |

If n8n runs in Docker and the UI on your machine, `http://localhost:5678/...` works. If the UI also
runs in Docker, use the n8n container name instead of `localhost`.

## Project structure

```
app/
  api/chat/route.ts   server route that calls n8n
  layout.tsx
  page.tsx
  globals.css         all styles (light + dark)
components/
  Chat.tsx            the chat UI
lib/
  n8n.ts              reads the answer from any n8n response shape
```

## Git workflow

```bash
git checkout dev
git checkout -b feature/chat-ui
# add these files
git add .
git commit -m "feat: add Next.js chat UI integrated with n8n Chat Trigger"
git push -u origin feature/chat-ui
# open a pull request: feature/chat-ui -> dev
```

Keep `.env.local` out of git (it is already in `.gitignore`).
