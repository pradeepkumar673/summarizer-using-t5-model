/**
 * STEP 12 — Groq-powered RAG Doubt Assistant Panel
 *
 * A collapsible right-side drawer in the DocumentViewer workspace.
 * Shows conversation history, an input box, and per-answer source page
 * citations that trigger the PDF highlight on click.
 */
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  askAssistant,
  getAssistantHistory,
  type ChatMessage,
  type AssistantSource,
} from "../api/assistant";
import { useWorkspaceStore } from "../store/workspaceStore";
import { logActivity } from "../api/activity";

interface Props {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
}

// Minimal markdown-to-HTML: bold **..**, italic *.., newlines, (Page N) citations
function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br />");
}

function SourceBadge({
  source,
  onClick,
}: {
  source: AssistantSource;
  onClick: (s: AssistantSource) => void;
}) {
  return (
    <button
      onClick={() => onClick(source)}
      title={source.text.slice(0, 120)}
      className="inline-flex items-center gap-1 bg-primary-fixed/60 text-on-primary-fixed px-2 py-0.5 font-mono text-source-code transition hover:bg-primary-fixed"
      style={{
        border: "1px solid #005da7",
        borderRadius: "255px 5px 225px 5px / 5px 225px 5px 255px",
        fontSize: "10px",
      }}
    >
      ↗ p.{source.page_number}
    </button>
  );
}

function MessageBubble({
  msg,
  onSourceClick,
}: {
  msg: ChatMessage;
  onSourceClick: (s: AssistantSource) => void;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} gap-1.5`}>
      <div
        className={`max-w-[88%] px-4 py-3 font-body text-body-md leading-relaxed ${
          isUser
            ? "bg-primary text-on-primary"
            : "bg-white text-on-surface border-2 border-on-surface"
        }`}
        style={{
          borderRadius: isUser
            ? "255px 15px 225px 15px / 15px 225px 15px 255px"
            : "15px 255px 15px 225px / 225px 15px 255px 15px",
          boxShadow: isUser ? "none" : "2px 2px 0px #1c1b1b",
        }}
      >
        {isUser ? (
          <p>{msg.content}</p>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
        )}
      </div>
      {!isUser && msg.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-1">
          {msg.sources.map((s) => (
            <SourceBadge key={s.chunk_id} source={s} onClick={onSourceClick} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AssistantPanel({ documentId, isOpen, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const focusSearchResult = useWorkspaceStore((s) => s.focusSearchResult);

  // Load history whenever the panel opens for this document
  useEffect(() => {
    if (!isOpen || !documentId) return;
    let cancelled = false;
    setHistoryLoading(true);
    setError(null);
    getAssistantHistory(documentId)
      .then((hist) => { if (!cancelled) setMessages(hist); })
      .catch(() => { if (!cancelled) setError("Could not load conversation history."); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, documentId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen]);

  function handleSourceClick(source: AssistantSource) {
    focusSearchResult({ page: source.page_number, box: null });
  }

  async function handleSend() {
    const q = input.trim();
    if (!q || loading) return;

    // Optimistically add the user bubble
    const tempUserMsg: ChatMessage = {
      id: `tmp-user-${Date.now()}`,
      role: "user",
      content: q,
      sources: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await askAssistant(documentId, q);
      const assistantMsg: ChatMessage = {
        id: res.message_id,
        role: "assistant",
        content: res.answer,
        sources: res.sources,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      // Log doubt_asked for each source paragraph (fire-and-forget)
      res.sources.forEach((src) => {
        logActivity(documentId, src.paragraph_id, "doubt_asked");
      });
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.detail ?? "Failed to get answer."
          : "Failed to get answer."
      );
      // Remove the optimistic user bubble on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!isOpen) return null;

  return (
    /* Overlay backdrop */
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Clicking backdrop closes panel */}
      <div
        className="absolute inset-0 bg-on-surface/10"
        onClick={onClose}
      />

      {/* Panel — notebook page sliding in from right */}
      <div
        className="relative z-50 flex h-full w-full max-w-md flex-col bg-surface"
        style={{ borderLeft: "3px solid #1c1b1b" }}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b-2 border-on-surface bg-surface px-5 py-4">
          <div>
            <h2 className="font-headline text-headline-sm" style={{ fontSize: "16px" }}>
              🤖 Doubt Assistant
            </h2>
            <p className="font-mono text-source-code text-on-surface-variant mt-0.5">
              RAG-grounded · Groq AI · source pages clickable
            </p>
          </div>
          <button
            onClick={onClose}
            className="hand-drawn-border-thin bg-white p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container transition-colors"
          >
            ✕
          </button>
        </div>

        {/* ── Message list ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 bg-checkered">
          {historyLoading ? (
            <div className="flex items-center gap-2 py-6">
              <span className="material-symbols-outlined text-primary animate-spin" style={{ animationDuration: "1.5s" }}>autorenew</span>
              <p className="font-body text-body-md text-on-surface-variant">Loading history...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center py-10">
              <span className="text-5xl">📚</span>
              <div
                className="bg-white p-6 max-w-xs"
                style={{ border: "2px solid #1c1b1b", borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px", boxShadow: "3px 3px 0px #1c1b1b" }}
              >
                <p className="font-headline text-headline-sm mb-2">Ask anything</p>
                <p className="font-body text-body-md text-on-surface-variant">
                  The assistant retrieves the most relevant passages and answers only from them.
                  Source page references are clickable.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  msg={m}
                  onSourceClick={handleSourceClick}
                />
              ))}
              {loading && (
                <div className="flex items-start gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-primary-fixed text-base" style={{ border: "2px solid #1c1b1b", borderRadius: "50%" }}>
                    🤖
                  </div>
                  <div
                    className="bg-white px-4 py-3 font-body text-body-md text-on-surface-variant"
                    style={{ border: "2px solid #1c1b1b", borderRadius: "15px 255px 15px 225px / 225px 15px 255px 15px", boxShadow: "2px 2px 0px #1c1b1b" }}
                  >
                    <span className="animate-pulse">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* ── Error banner ───────────────────────────────────────────── */}
        {error && (
          <div className="border-t-2 border-on-surface bg-error-container px-5 py-2 font-body text-body-md text-on-error-container">
            {error}
          </div>
        )}

        {/* ── Input box ──────────────────────────────────────────────── */}
        <div className="border-t-2 border-on-surface bg-surface px-5 py-4">
          <div
            className="flex items-end gap-3 bg-surface-container-lowest px-4 py-3"
            style={{ border: "2px solid #1c1b1b", borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}
          >
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question… (Enter to send)"
              disabled={loading}
              className="flex-1 resize-none bg-transparent font-body text-body-md text-on-surface placeholder-on-surface-variant outline-none disabled:opacity-60"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="shrink-0 bg-white px-4 py-2 font-label-caps text-label-caps text-on-surface hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              style={{
                border: "2px solid #1c1b1b",
                borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
                boxShadow: "2px 2px 0px #1c1b1b",
              }}
            >
              Send
            </button>
          </div>
          <p className="mt-2 font-mono text-source-code text-on-surface-variant text-center">
            Shift+Enter for new line · click source badges to highlight in PDF
          </p>
        </div>
      </div>
    </div>
  );
}
