import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
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
import { useWorkspaceStore } from "../store/workspaceStore";
import PdfPane from "../components/PdfPane";
import NotesPane from "../components/NotesPane";

export default function DocumentViewer() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [topics, setTopics] = useState<TopicPublic[]>([]);
  const [notes, setNotes] = useState<NotePublic[]>([]);
  // Dedicated cache of paragraph-level notes, kept independent of whatever
  // level the Notes tab is currently showing -- click-to-highlight from the
  // PDF always resolves against paragraph notes (the only 1:1 chunk<->note
  // level), regardless of which roll-up tab is active.
  const [paragraphNotes, setParagraphNotes] = useState<NotePublic[]>([]);
  const [noteLevel, setNoteLevel] = useState<NoteLevel>("paragraph");
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [buildingHierarchy, setBuildingHierarchy] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  const setActiveDocument = useWorkspaceStore((s) => s.setActiveDocument);
  const requestedNoteLevel = useWorkspaceStore((s) => s.requestedNoteLevel);

  useEffect(() => {
    if (!id) return;
    setActiveDocument(id);
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
          // no topics yet -- fine
        }
        try {
          const notesList = await getNotes(id!, noteLevel);
          if (!cancelled) {
            setNotes(notesList);
            if (noteLevel === "paragraph") setParagraphNotes(notesList);
          }
        } catch {
          // no notes yet -- fine
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            axios.isAxiosError(err) ? err.response?.data?.detail ?? "Failed to load document." : "Failed to load document."
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id || loading) return;
    let cancelled = false;
    async function loadNotesForLevel() {
      setNotesLoading(true);
      try {
        const notesList = await getNotes(id!, noteLevel);
        if (!cancelled) {
          setNotes(notesList);
          if (noteLevel === "paragraph") setParagraphNotes(notesList);
        }
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

  // A paragraph was clicked in the PDF -- switch the Notes tab to
  // "paragraph" level so the target note is actually in `notes` to scroll to.
  useEffect(() => {
    if (requestedNoteLevel && requestedNoteLevel !== noteLevel) {
      setNoteLevel(requestedNoteLevel);
    }
  }, [requestedNoteLevel, noteLevel]);

  async function handleProcess() {
    if (!id) return;
    setProcessing(true);
    setError(null);
    try {
      const topicsList = await processDocument(id);
      setTopics(topicsList);
      setDoc((prev) => (prev ? { ...prev, status: "segmented" } : prev));
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.detail ?? "Failed to process document." : "Failed to process document.");
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
      setParagraphNotes(generated);
      if (noteLevel === "paragraph") setNotes(generated);
    } catch (err) {
      setNotesError(axios.isAxiosError(err) ? err.response?.data?.detail ?? "Failed to generate notes." : "Failed to generate notes.");
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
        axios.isAxiosError(err) ? err.response?.data?.detail ?? "Failed to build topic/page/chapter roll-up." : "Failed to build topic/page/chapter roll-up."
      );
    } finally {
      setBuildingHierarchy(false);
    }
  }

  function handleNoteUpdated(updated: NotePublic) {
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    if (updated.level === "paragraph") {
      setParagraphNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading document...</div>;
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
    <div className="flex h-screen flex-col bg-slate-50">
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
          <Link
            to={`/documents/${doc.id}/notebook`}
            className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
          >
            My Notebook
          </Link>
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
          Running real T5 inference on every paragraph in this document. On CPU this can legitimately take a minute or more.
        </div>
      )}
      {buildingHierarchy && (
        <div className="border-b bg-purple-50 px-6 py-3 text-sm text-purple-800">
          Rolling up paragraph notes into topic, page, and chapter summaries.
        </div>
      )}
      {notesError && <div className="border-b bg-red-50 px-6 py-3 text-sm text-red-700">{notesError}</div>}

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 shrink-0 overflow-auto border-r bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Topics</h2>
          {topics.length === 0 ? (
            <p className="text-sm text-slate-400">No topics yet. Click "Segment Topics" above.</p>
          ) : (
            <ul className="space-y-1">
              {topics.map((t) => (
                <li key={t.id} className="rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-100">
                  <span className="font-medium">{t.title}</span>
                  <span className="ml-1 text-xs text-slate-400">
                    (p. {t.page_range[0]}&ndash;{t.page_range[1]})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="flex-1 overflow-hidden">
          <PanelGroup orientation="horizontal" className="h-full">
            <Panel defaultSize={65} minSize={30}>
              <PdfPane
                fileUrl={getDocumentFileUrl(doc.id)}
                numPages={numPages || doc.total_pages}
                chunks={doc.chunks}
                paragraphNotes={paragraphNotes}
                onNumPages={setNumPages}
                onLoadError={setError}
              />
            </Panel>
            <PanelResizeHandle className="w-1.5 cursor-col-resize bg-slate-200 transition-colors hover:bg-blue-400" />
            <Panel defaultSize={35} minSize={20}>
              <NotesPane
                documentId={doc.id}
                notes={notes}
                chunks={doc.chunks}
                notesLoading={notesLoading}
                noteLevel={noteLevel}
                onNoteLevelChange={setNoteLevel}
                onNoteUpdated={handleNoteUpdated}
              />
            </Panel>
          </PanelGroup>
        </div>
      </div>
    </div>
  );
}
