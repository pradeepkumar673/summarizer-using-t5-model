import { useEffect, useMemo, useRef } from "react";
import type { ChunkPublic, NoteLevel, NotePublic } from "../api/documents";
import { useWorkspaceStore } from "../store/workspaceStore";
import { buildChunkIndex, resolveNoteHighlights } from "../lib/highlights";

const NOTE_LEVELS: { value: NoteLevel; label: string }[] = [
  { value: "paragraph", label: "Paragraph" },
  { value: "topic", label: "Topic" },
  { value: "page", label: "Page" },
  { value: "chapter", label: "Chapter" },
];

interface NotesPaneProps {
  notes: NotePublic[];
  chunks: ChunkPublic[];
  notesLoading: boolean;
  noteLevel: NoteLevel;
  onNoteLevelChange: (level: NoteLevel) => void;
}

export default function NotesPane({
  notes,
  chunks,
  notesLoading,
  noteLevel,
  onNoteLevelChange,
}: NotesPaneProps) {
  const noteRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const activeNoteId = useWorkspaceStore((s) => s.activeNoteId);
  const noteScrollToken = useWorkspaceStore((s) => s.noteScrollToken);
  const activateNote = useWorkspaceStore((s) => s.activateNote);

  const chunkIndex = useMemo(() => buildChunkIndex(chunks), [chunks]);

  useEffect(() => {
    if (!activeNoteId) return;
    const node = noteRefs.current[activeNoteId];
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeNoteId, noteScrollToken, notes]);

  function handleNoteClick(note: NotePublic) {
    activateNote(note.id, resolveNoteHighlights(note, chunkIndex));
  }

  return (
    <div className="flex h-full flex-col border-l bg-white">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Notes {notes.length > 0 && `(${notes.length})`}
        </h2>
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
              return (
                <li
                  key={n.id}
                  ref={(node) => {
                    noteRefs.current[n.id] = node;
                  }}
                  onClick={() => handleNoteClick(n)}
                  className={`cursor-pointer rounded-lg border p-3 shadow-sm transition-all ${
                    active
                      ? "border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300"
                      : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
                  }`}
                >
                  <p className="text-sm text-slate-800">{n.text}</p>
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
