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
      className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 transition hover:bg-indigo-100 hover:shadow-sm"
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
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} gap-1`}>
      <div
        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "rounded-tr-sm bg-indigo-600 text-white"
            : "rounded-tl-sm border border-slate-200 bg-white text-slate-800"
        }`}
      >
        {isUser ? (
          <p>{msg.content}</p>
        ) : (
          <div
            dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
          />
        )}
      </div>
      {!isUser && msg.sources.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-1">
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
      .then((hist) => {
        if (!cancelled) setMessages(hist);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load conversation history.");
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, documentId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  function handleSourceClick(source: AssistantSource) {
    focusSearchResult({
      page: source.page_number,
      box: null, // no tight bbox from vector hits; scroll to page only
    });
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
      {/* Semi-transparent backdrop — clicking it closes the panel */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Panel itself */}
      <div className="relative z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-slate-50 shadow-2xl">
        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b bg-white px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              🤖 Doubt Assistant
            </h2>
            <p className="text-[11px] text-slate-400">
              Answers grounded in this document via Groq&nbsp;AI
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            ✕
          </button>
        </div>

        {/* ── Message list ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {historyLoading ? (
            <p className="text-center text-sm text-slate-400">
              Loading history…
            </p>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <span className="text-4xl">📚</span>
              <p className="text-sm font-medium text-slate-600">
                Ask anything about this document
              </p>
              <p className="text-xs text-slate-400">
                The assistant retrieves the most relevant passages and answers
                only from them. Source page references are clickable.
              </p>
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
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-base">
                    🤖
                  </div>
                  <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-400">
                    <span className="animate-pulse">Thinking…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* ── Error banner ─────────────────────────────────────────── */}
        {error && (
          <div className="border-t bg-red-50 px-4 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* ── Input box ────────────────────────────────────────────── */}
        <div className="border-t bg-white px-4 py-3">
          <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about the document… (Enter to send)"
              disabled={loading}
              className="flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none disabled:opacity-60"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400">
            Shift+Enter for new line &bull; Answers cite source pages — click to highlight
          </p>
        </div>
      </div>
    </div>
  );
}
