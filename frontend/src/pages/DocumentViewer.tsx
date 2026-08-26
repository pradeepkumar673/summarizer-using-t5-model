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
  getNotes,
  type DocumentDetail,
  type TopicPublic,
  type NotePublic,
} from "../api/documents";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export default function DocumentViewer() {
  const { id } = useParams<{ id: string }>();

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [topics, setTopics] = useState<TopicPublic[]>([]);
  const [notes, setNotes] = useState<NotePublic[]>([]);
  const [numPages, setNumPages] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
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
          const notesList = await getNotes(id!);
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
      setNotes(generated);
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
        <div className="flex items-center gap-3">
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
        </div>
      </header>

      {summarizing && (
        <div className="border-b bg-indigo-50 px-6 py-3 text-sm text-indigo-800">
          Running real T5 inference on every paragraph in this document. On CPU this can
          legitimately take a minute or more for longer documents &ndash; this panel will update
          automatically once it's done.
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
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Notes {notes.length > 0 && `(${notes.length})`}
          </h2>
          {notes.length === 0 ? (
            <p className="text-sm text-slate-400">
              No notes yet. Click "Generate Notes" above to run T5 summarization over every
              paragraph in this document.
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
                    Page {n.source_page} &bull; paragraph #{n.paragraph_id}
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
