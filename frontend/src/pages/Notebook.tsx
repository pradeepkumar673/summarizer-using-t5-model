import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import {
  getDocument,
  getNotebook,
  updateNote,
  type DocumentDetail,
  type NotePublic,
} from "../api/documents";

export default function Notebook() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [notes, setNotes] = useState<NotePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unpinningId, setUnpinningId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [docDetail, notebookNotes] = await Promise.all([
          getDocument(id!),
          getNotebook(id!),
        ]);
        if (cancelled) return;
        setDoc(docDetail);
        setNotes(notebookNotes);
      } catch (err) {
        if (!cancelled) {
          setError(
            axios.isAxiosError(err)
              ? err.response?.data?.detail ?? "Failed to load notebook."
              : "Failed to load notebook."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleUnpin(note: NotePublic) {
    if (!id) return;
    setUnpinningId(note.id);
    try {
      const updated = await updateNote(note.id, { is_pinned: false });
      setNotes((prev) =>
        updated.is_pinned || updated.edited_text
          ? prev.map((n) => (n.id === note.id ? updated : n))
          : prev.filter((n) => n.id !== note.id)
      );
    } catch {
      setError("Failed to unpin note.");
    } finally {
      setUnpinningId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading notebook...
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error ?? "Document not found."}</p>
        <Link to="/documents" className="text-blue-600 hover:underline">
          Back to documents
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-6 py-4">
        <div>
          <Link to={`/documents/${doc.id}`} className="text-sm text-blue-600 hover:underline">
            &larr; Back to workspace
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            My Notebook &mdash; {doc.title}
          </h1>
          <p className="text-sm text-slate-500">
            Pinned and personally-edited notes for this document.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl p-6">
        {notes.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nothing here yet. Pin a note or save a personal edit in the workspace and it'll show
            up here.
          </p>
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    {n.level}
                  </span>
                  <button
                    onClick={() => handleUnpin(n)}
                    disabled={unpinningId === n.id}
                    className="text-xs font-medium text-amber-600 hover:underline disabled:opacity-50"
                  >
                    {n.is_pinned ? "Unpin" : "Remove from view"}
                  </button>
                </div>
                <p className="text-sm text-slate-800">{n.edited_text ?? n.text}</p>
                {n.edited_text && (
                  <p className="mt-1 text-xs italic text-slate-400">
                    Original AI summary: {n.text}
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-400">
                  {n.source_pages.length === 1
                    ? `Page ${n.source_pages[0]}`
                    : `Pages ${n.source_pages[0]}&ndash;${n.source_pages[n.source_pages.length - 1]}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
