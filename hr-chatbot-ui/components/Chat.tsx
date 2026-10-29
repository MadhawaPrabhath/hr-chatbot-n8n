"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Role = "user" | "assistant";
type Message = { id: string; role: Role; content: string; error?: boolean };

const SESSION_KEY = "hr-chat-session-id";
const MESSAGES_KEY = "hr-chat-messages";

const SUGGESTIONS = [
  "How many annual leave days do I get?",
  "What is the process to apply for medical leave?",
  "What are the standard working hours?",
  "How long is the probation period?",
];

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// localStorage can throw (private mode, blocked storage) - never let that break the chat.
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export default function Chat() {
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore the previous conversation (n8n memory is keyed on sessionId).
  useEffect(() => {
    let id = load<string>(SESSION_KEY, "");
    if (!id) {
      id = newId();
      save(SESSION_KEY, id);
    }
    setSessionId(id);
    setMessages(load<Message[]>(MESSAGES_KEY, []).filter((m) => !m.error));
  }, []);

  useEffect(() => {
    if (sessionId) save(MESSAGES_KEY, messages.filter((m) => !m.error));
  }, [messages, sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Grow the textarea with its content, up to a limit.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || loading || !sessionId) return;

      setMessages((prev) => [
        ...prev.filter((m) => !m.error),
        { id: newId(), role: "user", content: message },
      ]);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, sessionId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.reply) {
          throw new Error(data.error || "Something went wrong. Please try again.");
        }
        setMessages((prev) => [...prev, { id: newId(), role: "assistant", content: data.reply }]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            content: err instanceof Error ? err.message : "Something went wrong.",
            error: true,
          },
        ]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [loading, sessionId]
  );

  const retry = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    // Drop the failed user message and its error, then resend it.
    setMessages((prev) => {
      const idx = prev.lastIndexOf(lastUser);
      return prev.slice(0, idx);
    });
    send(lastUser.content);
  };

  const newChat = () => {
    if (loading) return;
    const id = newId();
    save(SESSION_KEY, id);
    setSessionId(id);
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  };

  const empty = messages.length === 0;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="logo" aria-hidden>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <h1>HR Assistant</h1>
            <p>Answers from company HR policies</p>
          </div>
        </div>
        <button className="ghost" onClick={newChat} disabled={loading || empty} title="Start a new conversation">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          New chat
        </button>
      </header>

      <main className="messages" ref={scrollRef} aria-live="polite">
        <div className="inner">
          {empty ? (
            <section className="welcome">
              <h2>Hi! How can I help?</h2>
              <p>
                Ask about leave, working hours, benefits, or any other HR policy. Answers are based on
                the official policy documents.
              </p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)} disabled={!sessionId}>
                    {s}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`row ${m.role}`}>
                <div className={`bubble ${m.role}${m.error ? " error" : ""}`}>
                  {m.role === "assistant" && !m.error ? (
                    <div className="md">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="plain">{m.content}</p>
                  )}
                  {m.error && (
                    <button className="retry" onClick={retry}>
                      Try again
                    </button>
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="row assistant">
              <div className="bubble assistant typing" aria-label="Assistant is typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="composer">
        <form
          className="inner"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="inputbox">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask an HR question…"
              rows={1}
              maxLength={2000}
              aria-label="Your question"
              autoFocus
            />
            <button type="submit" className="send" disabled={!input.trim() || loading} aria-label="Send">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
          <p className="note">The assistant can make mistakes. Confirm important details with HR.</p>
        </form>
      </footer>
    </div>
  );
}
