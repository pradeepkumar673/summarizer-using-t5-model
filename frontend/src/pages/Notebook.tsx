import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import {
  getDocument,
  getNotebook,
  updateNote,
  getExportMarkdownUrl,
  getExportPdfUrl,
  type DocumentDetail,
  type NotePublic,
} from "../api/documents";
import apiClient from "../api/client";
import SketchHeader from "../components/sketch/SketchHeader";
import SketchButton from "../components/sketch/SketchButton";
import BookmarkTabs from "../components/sketch/BookmarkTabs";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 200);
}

export default function Notebook() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [notes, setNotes] = useState<NotePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unpinningId, setUnpinningId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"md" | "pdf" | null>(null);

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
          setError(axios.isAxiosError(err) ? err.response?.data?.detail ?? "Failed to load notebook." : "Failed to load notebook.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
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

  async function handleExport(format: "md" | "pdf") {
    if (!id) return;
    setExporting(format);
    setError(null);
    try {
      const url = format === "md" ? getExportMarkdownUrl(id) : getExportPdfUrl(id);
      const res = await apiClient.get(url, { responseType: "blob" });
      const mimeType = format === "md" ? "text/markdown" : "application/pdf";
      const extension = format === "md" ? ".md" : ".pdf";
      const blob = new Blob([res.data], { type: mimeType });
      const filename = (doc?.title ?? "notebook").replace(/\s+/g, "_") + extension;
      downloadBlob(blob, filename);
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.detail ?? "Export failed." : "Export failed.");
    } finally {
      setExporting(null);
    }
  }

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-checkered">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-primary animate-spin" style={{ animationDuration: "2s" }}>autorenew</span>
          <p className="font-headline text-headline-sm mt-4 text-on-surface-variant">Loading notebook...</p>
        </div>
      </div>
    );
  }

  if (error && !doc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-checkered">
        <div className="bg-white hand-drawn-border shadow-sketch p-8 max-w-md text-center">
          <span className="material-symbols-outlined text-5xl text-error">error</span>
          <p className="font-headline text-headline-sm mt-3 mb-4">{error ?? "Document not found."}</p>
          <Link to="/documents" className="hand-drawn-border-thin px-4 py-2 font-label-caps text-label-caps">← Back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-checkered text-on-surface font-body">
      <SketchHeader />
      <BookmarkTabs documentId={id!} status={doc?.status} />

      <main className="pt-24 pb-16 px-6 md:px-8 max-w-2xl mx-auto pr-20 md:pr-28">

        {/* Back + title */}
        <div className="mb-6">
          <Link to={`/documents/${doc?.id}`} className="font-label-caps text-label-caps text-primary hover:underline" style={{ fontSize: "11px" }}>
            ← Back to workspace
          </Link>
          <h1 className="font-display text-headline-md mt-2">📓 My Notebook</h1>
          <p className="font-body text-body-md text-on-surface-variant mt-1">
            {doc?.title} — pinned &amp; personally-edited notes
          </p>
        </div>

        {/* Export actions */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <SketchButton
            onClick={() => handleExport("md")}
            disabled={exporting !== null || notes.length === 0}
            variant="ghost"
            size="sm"
          >
            {exporting === "md" ? "Downloading..." : "⬇ Download .md"}
          </SketchButton>
          <SketchButton
            onClick={() => handleExport("pdf")}
            disabled={exporting !== null || notes.length === 0}
            variant="primary"
            size="sm"
          >
            {exporting === "pdf" ? "Downloading..." : "⬇ Download .pdf"}
          </SketchButton>
        </div>

        {error && (
          <div className="mb-5 hand-drawn-border-thin bg-error-container p-3 font-body text-body-md text-on-error-container">
            {error}
          </div>
        )}

        {/* Notes */}
        {notes.length === 0 ? (
          <div className="hand-drawn-dashed py-16 text-center bg-surface-container-lowest">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant">bookmark</span>
            <p className="font-body text-body-md text-on-surface-variant mt-3 max-w-sm mx-auto">
              Nothing here yet. Pin a note or save a personal edit in the workspace and it'll appear here.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {notes.map((n, i) => (
              <li
                key={n.id}
                className="bg-white hand-drawn-border-thin shadow-sketch-sm p-4"
                style={{ transform: `rotate(${i % 2 === 0 ? "0.3" : "-0.3"}deg)` }}
              >
                {/* Top row */}
                <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-label-caps text-label-caps bg-surface-variant text-on-surface-variant px-1.5 py-0.5 uppercase tracking-widest"
                      style={{ fontSize: "8px", border: "1px solid #1c1b1b", borderRadius: "255px 5px 225px 5px / 5px 225px 5px 255px" }}
                    >
                      {n.level}
                    </span>
                    {n.is_pinned && (
                      <span className="text-secondary text-sm" title="Pinned">★</span>
                    )}
                    {n.edited_text && (
                      <span
                        className="font-label-caps text-label-caps bg-tertiary-fixed text-on-tertiary-fixed px-1.5 py-0.5"
                        style={{ fontSize: "8px", border: "1px solid #1c1b1b", borderRadius: "255px 5px 225px 5px / 5px 225px 5px 255px" }}
                      >
                        Edited
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleUnpin(n)}
                    disabled={unpinningId === n.id}
                    className="font-label-caps text-label-caps text-secondary hover:underline disabled:opacity-50 transition-colors"
                    style={{ fontSize: "10px" }}
                  >
                    {n.is_pinned ? "☆ Unpin" : "Remove"}
                  </button>
                </div>

                {/* Note text */}
                <p className="font-body text-body-md text-on-surface leading-relaxed">
                  {n.edited_text ?? n.text}
                </p>
                {n.edited_text && (
                  <p className="mt-1 font-mono text-source-code text-on-surface-variant italic">
                    Original: {n.text}
                  </p>
                )}

                {/* Source pages */}
                <p className="mt-2 font-mono text-source-code text-on-surface-variant">
                  {n.source_pages.length === 1
                    ? `p.${n.source_pages[0]}`
                    : `p.${n.source_pages[0]}–${n.source_pages[n.source_pages.length - 1]}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
