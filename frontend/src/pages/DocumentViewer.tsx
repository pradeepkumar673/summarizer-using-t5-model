import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import axios from "axios";
import {
  getDocument,
  getDocumentFileUrl,
  processDocument,
  getTopics,
  summarizeDocument,
  summarizeHierarchy,
  getNotes,
  type DocumentDetail,
  type TopicPublic,
  type NotePublic,
  type NoteLevel,
} from "../api/documents";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const NOTE_LEVELS: { value: NoteLevel; label: string }[] = [
  { value: "paragraph", label: "Paragraph" },
  { value: "topic", label: "Topic" },
  { value: "page", label: "Page" },
  { value: "chapter", label: "Chapter" },
];

export default function DocumentViewer() {
  const { id } = useParams<{ id: string }>();

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [topics, setTopics] = useState<TopicPublic[]>([]);
  const [notes, setNotes] = useState<NotePublic[]>([]);
  const [noteLevel, setNoteLevel] = useState<NoteLevel>("paragraph");
  const [numPages, setNumPages] = useState(0);

  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [buildingHierarchy, setBuildingHierarchy] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const docDetail = await getDocument(id!);
        if (cancelled) return;
        setDoc(docDetail);

        try {
          const topicsList = await getTopics(id!);
          if (!cancelled) setTopics(topicsList);
        } catch {
          // No topics yet is expected for unprocessed documents - not an error
        }

        try {
          const notesList = await getNotes(id!, noteLevel);
          if (!cancelled) setNotes(notesList);
        } catch {
          // No notes yet is expected before summarization has been run - not an error
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            axios.isAxiosError(err)
              ? err.response?.data?.detail ?? "Failed to load document."
              : "Failed to load document."
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

  useEffect(() => {
    if (!id || loading) return;
    let cancelled = false;

    async function loadNotesForLevel() {
      setNotesLoading(true);
      try {
        const notesList = await getNotes(id!, noteLevel);
        if (!cancelled) setNotes(notesList);
      } catch {
        if (!cancelled) setNotes([]);
      } finally {
        if (!cancelled) setNotesLoading(false);
      }
    }

    loadNotesForLevel();
    return () => {
      cancelled = true;
    };
  }, [id, noteLevel, loading]);

  async function handleProcess() {
    if (!id) return;
    setProcessing(true);
    setError(null);
    try {
      const topicsList = await processDocument(id);
      setTopics(topicsList);
      setDoc((prev) => (prev ? { ...prev, status: "segmented" } : prev));
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.detail ?? "Failed to process document."
          : "Failed to process document."
      );
    } finally {
      setProcessing(false);
    }
  }

  async function handleSummarize() {
    if (!id) return;
    setSummarizing(true);
    setNotesError(null);
    try {
      const generated = await summarizeDocument(id);
      if (noteLevel === "paragraph") {
        setNotes(generated);
      }
    } catch (err) {
      setNotesError(
        axios.isAxiosError(err)
          ? err.response?.data?.detail ?? "Failed to generate notes."
          : "Failed to generate notes."
      );
    } finally {
      setSummarizing(false);
    }
  }

  async function handleBuildHierarchy() {
    if (!id) return;
    setBuildingHierarchy(true);
    setNotesError(null);
    try {
      const result = await summarizeHierarchy(id);
      if (noteLevel === "topic") setNotes(result.topic);
      else if (noteLevel === "page") setNotes(result.page);
      else if (noteLevel === "chapter") setNotes(result.chapter);
    } catch (err) {
      setNotesError(
        axios.isAxiosError(err)
          ? err.response?.data?.detail ?? "Failed to build topic/page/chapter roll-up."
          : "Failed to build topic/page/chapter roll-up."
      );
    } finally {
      setBuildingHierarchy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading document...
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
          <Link to="/documents" className="text-sm text-blue-600 hover:underline">
            &larr; All documents
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">{doc.title}</h1>
          <p className="text-sm text-slate-500">
            {doc.total_pages} pages &bull; status: {doc.status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleProcess}
            disabled={processing}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processing ? "Segmenting topics..." : "Segment Topics"}
          </button>
          <button
            onClick={handleSummarize}
            disabled={summarizing}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {summarizing ? "Generating notes..." : "Generate Notes"}
          </button>
          <button
            onClick={handleBuildHierarchy}
            disabled={buildingHierarchy}
            title="Rolls up existing paragraph notes into Topic, Page, and Chapter summaries"
            className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {buildingHierarchy ? "Building roll-up..." : "Build Topic/Page/Chapter Roll-up"}
          </button>
        </div>
      </header>

      {summarizing && (
        <div className="border-b bg-indigo-50 px-6 py-3 text-sm text-indigo-800">
          Running real T5 inference on every paragraph in this document. On CPU this can
          legitimately take a minute or more for longer documents.
        </div>
      )}
      {buildingHierarchy && (
        <div className="border-b bg-purple-50 px-6 py-3 text-sm text-purple-800">
          Rolling up paragraph notes into topic, page, and chapter summaries &ndash; this
          re-summarizes with T5 at each level and can take a little while too.
        </div>
      )}
      {notesError && (
        <div className="border-b bg-red-50 px-6 py-3 text-sm text-red-700">{notesError}</div>
      )}

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[220px_1fr_360px]">
        <aside className="space-y-2">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Topics
          </h2>
          {topics.length === 0 ? (
            <p className="text-sm text-slate-400">No topics yet. Click "Segment Topics" above.</p>
          ) : (
            <ul className="space-y-1">
              {topics.map((t) => (
                <li
                  key={t.id}
                  className="rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
                >
                  <span className="font-medium">{t.title}</span>
                  <span className="ml-1 text-xs text-slate-400">
                    (p. {t.page_range[0]}&ndash;{t.page_range[1]})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="flex flex-col items-center gap-4">
          <Document
            file={getDocumentFileUrl(doc.id)}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            onLoadError={(err) => setError(`Failed to render PDF: ${err.message}`)}
            loading={<p className="text-sm text-slate-500">Loading PDF...</p>}
          >
            {Array.from({ length: numPages }, (_, i) => (
              <Page
                key={i}
                pageNumber={i + 1}
                className="mb-4 shadow border border-slate-200"
                width={500}
              />
            ))}
          </Document>
        </main>

        <aside className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Notes {notes.length > 0 && `(${notes.length})`}
            </h2>
          </div>

          <div className="flex gap-1 rounded-md bg-slate-100 p-1">
            {NOTE_LEVELS.map((l) => (
              <button
                key={l.value}
                onClick={() => setNoteLevel(l.value)}
                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  noteLevel === l.value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          {notesLoading ? (
            <p className="text-sm text-slate-400">Loading {noteLevel} notes...</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-slate-400">
              {noteLevel === "paragraph"
                ? 'No notes yet. Click "Generate Notes" above.'
                : `No ${noteLevel}-level notes yet. Generate paragraph notes first, then click "Build Topic/Page/Chapter Roll-up".`}
            </p>
          ) : (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
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
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
