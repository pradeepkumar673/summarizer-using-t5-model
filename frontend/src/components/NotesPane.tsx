import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { updateNote, type ChunkPublic, type NoteLevel, type NotePublic } from "../api/documents";
import { logActivity } from "../api/activity";
import { useWorkspaceStore } from "../store/workspaceStore";
import { buildChunkIndex, resolveNoteHighlights } from "../lib/highlights";

const NOTE_LEVELS: { value: NoteLevel; label: string; icon: string }[] = [
  { value: "paragraph", label: "¶ Para", icon: "subject" },
  { value: "topic",     label: "§ Topic", icon: "category" },
  { value: "page",      label: "📄 Page", icon: "article" },
  { value: "chapter",   label: "📖 Chap", icon: "menu_book" },
];

interface NotesPaneProps {
  documentId: string;
  notes: NotePublic[];
  chunks: ChunkPublic[];
  notesLoading: boolean;
  noteLevel: NoteLevel;
  onNoteLevelChange: (level: NoteLevel) => void;
  onNoteUpdated: (updated: NotePublic) => void;
}

export default function NotesPane({
  documentId,
  notes,
  chunks,
  notesLoading,
  noteLevel,
  onNoteLevelChange,
  onNoteUpdated,
}: NotesPaneProps) {
  const noteRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const activeNoteId = useWorkspaceStore((s) => s.activeNoteId);
  const noteScrollToken = useWorkspaceStore((s) => s.noteScrollToken);
  const activateNote = useWorkspaceStore((s) => s.activateNote);

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const chunkIndex = useMemo(() => buildChunkIndex(chunks), [chunks]);

  useEffect(() => {
    if (!activeNoteId) return;
    const node = noteRefs.current[activeNoteId];
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeNoteId, noteScrollToken, notes]);

  function handleNoteClick(note: NotePublic) {
    activateNote(note.id, resolveNoteHighlights(note, chunkIndex));
    if (note.paragraph_id != null) {
      logActivity(documentId, note.paragraph_id, "note_click");
    } else {
      note.source_chunk_ids.forEach(() => {
        if (note.paragraph_id != null)
          logActivity(documentId, note.paragraph_id!, "note_click");
      });
    }
  }

  function startEdit(e: React.MouseEvent, note: NotePublic) {
    e.stopPropagation();
    setEditingNoteId(note.id);
    setDraftText(note.edited_text ?? note.text);
    setSaveError(null);
  }

  function cancelEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditingNoteId(null);
    setSaveError(null);
  }

  async function saveEdit(e: React.MouseEvent, note: NotePublic) {
    e.stopPropagation();
    setSavingId(note.id);
    setSaveError(null);
    try {
      const trimmed = draftText.trim();
      const payloadText = trimmed === "" || trimmed === note.text ? null : trimmed;
      const updated = await updateNote(note.id, { edited_text: payloadText });
      onNoteUpdated(updated);
      setEditingNoteId(null);
    } catch (err) {
      setSaveError(
        axios.isAxiosError(err)
          ? err.response?.data?.detail ?? "Failed to save edit."
          : "Failed to save edit."
      );
    } finally {
      setSavingId(null);
    }
  }

  async function togglePin(e: React.MouseEvent, note: NotePublic) {
    e.stopPropagation();
    try {
      const updated = await updateNote(note.id, { is_pinned: !note.is_pinned });
      onNoteUpdated(updated);
    } catch {
      setSaveError("Failed to update pin.");
    }
  }

  return (
    <div className="flex h-full flex-col bg-surface-container-low border-l-2 border-on-surface">

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between border-b-2 border-on-surface px-4 py-3 bg-surface">
        <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">
          Notes {notes.length > 0 && `(${notes.length})`}
        </h2>
        <Link
          to={`/documents/${documentId}/notebook`}
          className="font-label-caps text-label-caps text-primary hover:underline underline-offset-2"
          style={{ fontSize: "10px" }}
        >
          My Notebook →
        </Link>
      </div>

      {/* Level tabs — bookmark ribbon style */}
      <div className="shrink-0 flex border-b-2 border-on-surface bg-surface-container">
        {NOTE_LEVELS.map((l, i) => {
          const active = noteLevel === l.value;
          return (
            <button
              key={l.value}
              onClick={() => onNoteLevelChange(l.value)}
              className={`flex-1 py-2 px-1 font-label-caps text-label-caps transition-colors border-r-2 border-on-surface last:border-r-0 ${
                active
                  ? "bg-secondary-container text-on-secondary-container"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              }`}
              style={{
                fontSize: "9px",
                transform: active ? "none" : `rotate(${[0.5, -0.5, 0.5, -0.5][i]}deg)`,
              }}
            >
              {l.label}
            </button>
          );
        })}
      </div>

      {saveError && (
        <div className="shrink-0 bg-error-container border-b-2 border-on-surface px-3 py-2 font-body text-body-md text-on-error-container text-sm">
          {saveError}
        </div>
      )}

      {/* Notes list */}
      <div className="flex-1 overflow-auto p-3">
        {notesLoading ? (
          <div className="flex items-center gap-2 py-6">
            <span className="material-symbols-outlined text-primary animate-spin" style={{ animationDuration: "1.5s" }}>
              autorenew
            </span>
            <span className="font-body text-body-md text-on-surface-variant">Loading {noteLevel} notes...</span>
          </div>
        ) : notes.length === 0 ? (
          <div className="py-8 text-center">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant">edit_note</span>
            <p className="font-body text-body-md text-on-surface-variant mt-2">
              {noteLevel === "paragraph"
                ? 'No notes yet. Click "Generate Notes" above.'
                : `No ${noteLevel}-level notes yet. Generate paragraph notes first, then build the roll-up.`}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {notes.map((n, i) => {
              const active = n.id === activeNoteId;
              const editing = editingNoteId === n.id;
              const hasEdit = Boolean(n.edited_text);
              return (
                <li
                  key={n.id}
                  ref={(node) => { noteRefs.current[n.id] = node; }}
                  onClick={() => !editing && handleNoteClick(n)}
                  className={`relative p-3 transition-all ${
                    editing ? "cursor-default" : "cursor-pointer"
                  } ${
                    active
                      ? "hand-drawn-border bg-secondary-fixed shadow-sketch-sm"
                      : "hand-drawn-border-thin bg-white hover:bg-primary-fixed/20"
                  }`}
                  style={{ transform: `rotate(${i % 2 === 0 ? "0.3" : "-0.3"}deg)` }}
                >
                  {/* Top row: badges + actions */}
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      {hasEdit && (
                        <span
                          className="font-label-caps text-label-caps bg-tertiary-fixed text-on-tertiary-fixed px-1.5 py-0.5"
                          style={{
                            fontSize: "8px",
                            borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
                            border: "1px solid #1c1b1b",
                          }}
                        >
                          Edited
                        </span>
                      )}
                      {n.is_pinned && (
                        <span className="text-secondary text-sm" title="Pinned to notebook">★</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!editing && (
                        <button
                          onClick={(e) => startEdit(e, n)}
                          className="hand-drawn-border-thin bg-white px-2 py-0.5 font-label-caps text-label-caps hover:bg-surface-container transition-colors"
                          style={{ fontSize: "9px" }}
                        >
                          Edit
                        </button>
                      )}
                      <button
                        onClick={(e) => togglePin(e, n)}
                        title={n.is_pinned ? "Unpin from notebook" : "Pin to notebook"}
                        className={`font-label-caps text-label-caps px-2 py-0.5 transition-colors hand-drawn-border-thin ${
                          n.is_pinned
                            ? "bg-secondary-fixed text-on-secondary-fixed"
                            : "bg-white text-on-surface-variant hover:bg-secondary-fixed/30"
                        }`}
                        style={{ fontSize: "9px" }}
                      >
                        {n.is_pinned ? "★ Pinned" : "☆ Pin"}
                      </button>
                    </div>
                  </div>

                  {/* Note content */}
                  {editing ? (
                    <div onClick={(e) => e.stopPropagation()} className="space-y-2">
                      <textarea
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        rows={4}
                        autoFocus
                        className="w-full bg-surface-container-lowest border-2 border-on-surface p-2 font-body text-body-md focus:outline-none focus:border-primary resize-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={cancelEdit}
                          className="hand-drawn-border-thin bg-white px-3 py-1 font-label-caps text-label-caps hover:bg-surface-container transition-colors"
                          style={{ fontSize: "10px" }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={(e) => saveEdit(e, n)}
                          disabled={savingId === n.id}
                          className="hand-drawn-border bg-primary text-on-primary px-3 py-1 font-label-caps text-label-caps hover:bg-primary/80 disabled:opacity-50 transition-colors"
                          style={{ fontSize: "10px" }}
                        >
                          {savingId === n.id ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="font-body text-body-md text-on-surface leading-relaxed">
                        {n.edited_text ?? n.text}
                      </p>
                      {hasEdit && (
                        <p className="mt-1 font-mono text-source-code text-on-surface-variant italic">
                          Original: {n.text}
                        </p>
                      )}
                    </>
                  )}

                  {/* Source info */}
                  <p className="mt-2 font-mono text-source-code text-on-surface-variant">
                    {n.source_pages.length === 1
                      ? `p.${n.source_pages[0]}`
                      : `p.${n.source_pages[0]}–${n.source_pages[n.source_pages.length - 1]}`}
                    {n.paragraph_id !== null && ` · ¶${n.paragraph_id}`}
                    {` · ${n.source_chunk_ids.length} chunk${n.source_chunk_ids.length === 1 ? "" : "s"}`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
