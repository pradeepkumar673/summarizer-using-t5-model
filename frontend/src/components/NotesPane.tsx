import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { updateNote, type ChunkPublic, type NoteLevel, type NotePublic } from "../api/documents";
import { logActivity } from "../api/activity";
import { useWorkspaceStore } from "../store/workspaceStore";
import { buildChunkIndex, resolveNoteHighlights } from "../lib/highlights";

const NOTE_LEVELS: { value: NoteLevel; label: string }[] = [
  { value: "paragraph", label: "Paragraph" },
  { value: "topic", label: "Topic" },
  { value: "page", label: "Page" },
  { value: "chapter", label: "Chapter" },
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
    // Log note_click for each source paragraph
    if (note.paragraph_id != null) {
      logActivity(documentId, note.paragraph_id, "note_click");
    } else {
      note.source_chunk_ids.forEach(() => {
        if (note.paragraph_id != null)
          logActivity(documentId, note.paragraph_id, "note_click");
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
    <div className="flex h-full flex-col border-l bg-white">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Notes {notes.length > 0 && `(${notes.length})`}
        </h2>
        <Link
          to={`/documents/${documentId}/notebook`}
          className="text-xs font-medium text-indigo-600 hover:underline"
        >
          My Notebook &rarr;
        </Link>
      </div>

      <div className="flex gap-1 border-b bg-slate-50 p-2">
        {NOTE_LEVELS.map((l) => (
          <button
            key={l.value}
            onClick={() => onNoteLevelChange(l.value)}
            className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
              noteLevel === l.value
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {saveError && (
        <div className="border-b bg-red-50 px-3 py-2 text-xs text-red-700">{saveError}</div>
      )}

      <div className="flex-1 overflow-auto p-3">
        {notesLoading ? (
          <p className="text-sm text-slate-400">Loading {noteLevel} notes...</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-slate-400">
            {noteLevel === "paragraph"
              ? 'No notes yet. Click "Generate Notes" above.'
              : `No ${noteLevel}-level notes yet. Generate paragraph notes first, then build the roll-up.`}
          </p>
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => {
              const active = n.id === activeNoteId;
              const editing = editingNoteId === n.id;
              const hasEdit = Boolean(n.edited_text);
              return (
                <li
                  key={n.id}
                  ref={(node) => {
                    noteRefs.current[n.id] = node;
                  }}
                  onClick={() => !editing && handleNoteClick(n)}
                  className={`rounded-lg border p-3 shadow-sm transition-all ${
                    editing ? "cursor-default" : "cursor-pointer"
                  } ${
                    active
                      ? "border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300"
                      : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      {hasEdit && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                          Edited
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!editing && (
                        <button
                          onClick={(e) => startEdit(e, n)}
                          className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        onClick={(e) => togglePin(e, n)}
                        title={n.is_pinned ? "Unpin from notebook" : "Pin to notebook"}
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          n.is_pinned
                            ? "text-amber-500 hover:bg-amber-50 font-medium"
                            : "text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                        }`}
                      >
                        {n.is_pinned ? "Pinned" : "Pin"}
                      </button>
                    </div>
                  </div>

                  {editing ? (
                    <div onClick={(e) => e.stopPropagation()} className="space-y-2">
                      <textarea
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        rows={3}
                        autoFocus
                        className="w-full rounded-md border border-slate-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={(e) => cancelEdit(e)}
                          className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={(e) => saveEdit(e, n)}
                          disabled={savingId === n.id}
                          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {savingId === n.id ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-slate-800">{n.edited_text ?? n.text}</p>
                      {hasEdit && (
                        <p className="mt-1 text-xs italic text-slate-400">
                          Original AI summary: {n.text}
                        </p>
                      )}
                    </>
                  )}

                  <p className="mt-2 text-xs text-slate-400">
                    {n.source_pages.length === 1
                      ? `Page ${n.source_pages[0]}`
                      : `Pages ${n.source_pages[0]}&ndash;${n.source_pages[n.source_pages.length - 1]}`}
                    {n.paragraph_id !== null && ` &bull; paragraph #${n.paragraph_id}`}
                    {" &bull; "}
                    from {n.source_chunk_ids.length} paragraph
                    {n.source_chunk_ids.length === 1 ? "" : "s"}
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
