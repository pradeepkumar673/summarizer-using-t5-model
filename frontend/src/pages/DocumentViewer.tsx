import { useCallback, useEffect, useState } from "react";
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
  getDocumentStatus,
  retryDocumentPipeline,
  type DocumentDetail,
  type TopicPublic,
  type NotePublic,
  type NoteLevel,
} from "../api/documents";
import { useWorkspaceStore } from "../store/workspaceStore";
import PdfPane from "../components/PdfPane";
import NotesPane from "../components/NotesPane";
import SearchBar from "../components/SearchBar";
import AssistantPanel from "../components/AssistantPanel";
import { HeatmapLegend } from "../components/HeatmapOverlay";
import BookmarkTabs from "../components/sketch/BookmarkTabs";
import SketchButton from "../components/sketch/SketchButton";
import SketchProgress from "../components/sketch/SketchProgress";
import Logo from "../components/sketch/Logo";

const STAGE_LABELS: Record<string, string> = {
  queued:      "Queued for processing...",
  extracting:  "Extracting text from PDF...",
  segmenting:  "Segmenting topics...",
  summarizing: "Generating T5 summaries...",
  hierarchy:   "Building hierarchy...",
  embedding:   "Creating semantic index...",
  exam_essentials: "Extracting exam essentials...",
  graph:       "Building knowledge graph...",
};

const STAGE_ORDER = ["queued","extracting","segmenting","summarizing","hierarchy","embedding","exam_essentials","graph"];

function stageProgress(status: string): number {
  const idx = STAGE_ORDER.indexOf(status);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / STAGE_ORDER.length) * 90);
}

export default function DocumentViewer() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [topics, setTopics] = useState<TopicPublic[]>([]);
  const [notes, setNotes] = useState<NotePublic[]>([]);
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
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [status, setStatus] = useState<string | null>(null);


  const setActiveDocument = useWorkspaceStore((s) => s.setActiveDocument);
  const requestedNoteLevel = useWorkspaceStore((s) => s.requestedNoteLevel);

  const loadDocument = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const docDetail = await getDocument(id);
      setDoc(docDetail);
      try { setTopics(await getTopics(id)); } catch { /* no topics yet */ }
      try {
        const notesList = await getNotes(id, noteLevel);
        setNotes(notesList);
        if (noteLevel === "paragraph") setParagraphNotes(notesList);
      } catch { /* no notes yet */ }
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.detail ?? "Failed to load document." : "Failed to load document.");
    }
  }, [id, noteLevel]);

  useEffect(() => {
    if (!id) return;
    setActiveDocument(id);
    setLoading(true);
    loadDocument().finally(() => setLoading(false));
  }, [id, setActiveDocument, loadDocument]);

  useEffect(() => {
    if (!id) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    const poll = async () => {
      try {
        const { status: s } = await getDocumentStatus(id!);
        if (cancelled) return;
        setStatus(s);
        if (s === "ready" || s === "failed") {
          if (interval) clearInterval(interval);
          if (s === "ready") loadDocument();
        }
      } catch { /* ignore */ }
    };
    if (doc && doc.status !== "ready" && doc.status !== "failed") {
      poll();
      interval = setInterval(poll, 2000);
    } else {
      if (doc) setStatus(doc.status);
    }
    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [id, doc, loadDocument]);

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
      } catch { if (!cancelled) setNotes([]); }
      finally { if (!cancelled) setNotesLoading(false); }
    }
    loadNotesForLevel();
    return () => { cancelled = true; };
  }, [id, noteLevel, loading]);

  useEffect(() => {
    if (requestedNoteLevel && requestedNoteLevel !== noteLevel) setNoteLevel(requestedNoteLevel);
  }, [requestedNoteLevel, noteLevel]);

  async function handleProcess() {
    if (!id) return;
    setProcessing(true); setError(null);
    try {
      const topicsList = await processDocument(id);
      setTopics(topicsList);
      setDoc((prev) => (prev ? { ...prev, status: "segmented" } : prev));
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.detail ?? "Failed to process." : "Failed to process.");
    } finally { setProcessing(false); }
  }

  async function handleSummarize() {
    if (!id) return;
    setSummarizing(true); setNotesError(null);
    try {
      const generated = await summarizeDocument(id);
      setParagraphNotes(generated);
      if (noteLevel === "paragraph") setNotes(generated);
    } catch (err) {
      setNotesError(axios.isAxiosError(err) ? err.response?.data?.detail ?? "Failed to generate notes." : "Failed to generate notes.");
    } finally { setSummarizing(false); }
  }

  async function handleBuildHierarchy() {
    if (!id) return;
    setBuildingHierarchy(true); setNotesError(null);
    try {
      const result = await summarizeHierarchy(id);
      if (noteLevel === "topic") setNotes(result.topic);
      else if (noteLevel === "page") setNotes(result.page);
      else if (noteLevel === "chapter") setNotes(result.chapter);
    } catch (err) {
      setNotesError(axios.isAxiosError(err) ? err.response?.data?.detail ?? "Failed to build roll-up." : "Failed to build roll-up.");
    } finally { setBuildingHierarchy(false); }
  }

  async function handleRetry() {
    if (!id) return;
    setStatus("queued");
    try { await retryDocumentPipeline(id); }
    catch (err) { setError(axios.isAxiosError(err) ? err.response?.data?.detail ?? "Failed to restart." : "Failed to restart."); }
  }

  function handleNoteUpdated(updated: NotePublic) {
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    if (updated.level === "paragraph") setParagraphNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-checkered">
        <div className="text-center">
          <span className="material-symbols-outlined text-6xl text-primary animate-spin" style={{ animationDuration: "2s" }}>
            autorenew
          </span>
          <p className="font-headline text-headline-sm mt-4 text-on-surface-variant">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-checkered">
        <div className="bg-white hand-drawn-border shadow-sketch p-8 max-w-md text-center">
          <span className="material-symbols-outlined text-5xl text-error">error</span>
          <p className="font-headline text-headline-sm mt-3 mb-4">{error ?? "Document not found."}</p>
          <Link to="/documents" className="hand-drawn-border-thin px-4 py-2 font-label-caps text-label-caps hover:bg-primary/10 transition-colors">
            ← Back to Documents
          </Link>
        </div>
      </div>
    );
  }

  // ── Processing banner ────────────────────────────────────────────────────
  const isProcessing = status && status !== "ready" && status !== "failed" && status !== "segmented";
  const isFailed = status === "failed";
  const isSegmented = status === "segmented";

  return (
    <>
      <div className="flex h-screen flex-col bg-surface overflow-hidden">

        {/* ── App Bar ─────────────────────────────────────────────────────── */}
        <header className="shrink-0 bg-surface border-b-2 border-on-surface px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3 z-30">
          <div className="flex items-center gap-4 min-w-0">
            <Link to="/documents" className="shrink-0">
              <Logo size="sm" />
            </Link>
            <div className="min-w-0">
              <h1 className="font-headline text-headline-sm truncate">{doc.title}</h1>
              <p className="font-mono text-source-code text-on-surface-variant">
                {doc.total_pages} pages · {status ?? doc.status}
              </p>
            </div>
          </div>

          {/* Search + actions */}
          <div className="flex flex-wrap items-center gap-2">
            <SearchBar documentId={doc.id} />

            <SketchButton
              onClick={() => setAssistantOpen(true)}
              disabled={status !== "ready"}
              variant="primary"
              size="sm"
            >
              🤖 Ask AI
            </SketchButton>
            <SketchButton
              onClick={() => setShowHeatmap((v) => !v)}
              disabled={status !== "ready"}
              variant={showHeatmap ? "secondary" : "primary"}
              size="sm"
            >
              🔥 {showHeatmap ? "Hide" : "Heatmap"}
            </SketchButton>
            <SketchButton
              onClick={handleProcess}
              disabled={processing || (status !== "ready" && status !== "segmented")}
              variant="ghost"
              size="sm"
            >
              {processing ? "Segmenting..." : "Segment Topics"}
            </SketchButton>
            <SketchButton
              onClick={handleSummarize}
              disabled={summarizing || (status !== "ready" && status !== "segmented")}
              variant="primary"
              size="sm"
            >
              {summarizing ? "Generating..." : "Generate Notes"}
            </SketchButton>
            <SketchButton
              onClick={handleBuildHierarchy}
              disabled={buildingHierarchy || (status !== "ready" && status !== "segmented")}
              variant="ghost"
              size="sm"
              title="Roll up paragraph notes into Topic, Page, and Chapter summaries"
            >
              {buildingHierarchy ? "Building..." : "Build Roll-up"}
            </SketchButton>
          </div>
        </header>

        {/* ── Processing / status banners ──────────────────────────────────── */}
        {isProcessing && (
          <div className="shrink-0 bg-primary-fixed border-b-2 border-on-surface px-6 py-3">
            <div className="flex items-center justify-between gap-4 mb-2">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary animate-spin" style={{ animationDuration: "1.5s" }}>
                  autorenew
                </span>
                <span className="font-headline text-headline-sm" style={{ fontSize: "14px" }}>
                  {STAGE_LABELS[status!] || status}
                </span>
              </div>
              <button
                onClick={handleRetry}
                className="hand-drawn-border-thin bg-white px-3 py-1 font-label-caps text-label-caps text-on-surface hover:bg-error-container hover:text-on-error-container transition-colors text-xs"
              >
                Force Restart
              </button>
            </div>
            <SketchProgress value={stageProgress(status!)} />
          </div>
        )}

        {isFailed && (
          <div className="shrink-0 bg-error-container border-b-2 border-on-surface px-6 py-3 flex items-center justify-between">
            <span className="font-headline text-on-error-container" style={{ fontSize: "14px" }}>
              Processing failed. Please restart.
            </span>
            <button
              onClick={handleRetry}
              className="hand-drawn-border-thin bg-white px-3 py-1.5 font-label-caps text-label-caps text-error hover:bg-error hover:text-on-error transition-colors"
            >
              Restart Ingestion
            </button>
          </div>
        )}

        {isSegmented && (
          <div className="shrink-0 bg-tertiary-fixed/60 border-b-2 border-on-surface px-6 py-2 flex items-center justify-between">
            <span className="font-body text-body-md text-on-tertiary-fixed">
              ✓ Topics segmented — click "Generate Notes" or force restart.
            </span>
            <button
              onClick={handleRetry}
              className="hand-drawn-border-thin bg-white px-3 py-1 font-label-caps text-label-caps text-on-surface hover:bg-primary/10 transition-colors text-xs"
            >
              Force Restart
            </button>
          </div>
        )}

        {summarizing && (
          <div className="shrink-0 bg-primary-fixed/50 border-b-2 border-on-surface px-6 py-2">
            <span className="font-body text-body-md text-on-primary-fixed">
              Running T5 inference on every paragraph. On CPU this may take a minute or more...
            </span>
          </div>
        )}
        {buildingHierarchy && (
          <div className="shrink-0 bg-secondary-fixed/50 border-b-2 border-on-surface px-6 py-2">
            <span className="font-body text-body-md text-on-secondary-fixed">
              Rolling up paragraph notes into topic, page, and chapter summaries...
            </span>
          </div>
        )}
        {notesError && (
          <div className="shrink-0 bg-error-container border-b-2 border-on-surface px-6 py-2">
            <span className="font-body text-body-md text-on-error-container">{notesError}</span>
          </div>
        )}
        {showHeatmap && (
          <div className="shrink-0 bg-surface-container border-b-2 border-on-surface px-6 py-2 flex items-center gap-3">
            <HeatmapLegend />
          </div>
        )}

        {/* ── Main split layout ────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Topics sidebar */}
          <aside className="w-44 md:w-52 shrink-0 overflow-auto border-r-2 border-on-surface bg-surface-container-low p-4">
            <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest mb-3">
              Topics
            </h2>
            {topics.length === 0 ? (
              <p className="font-body text-body-md text-on-surface-variant text-sm">
                No topics yet. Click "Segment Topics" above.
              </p>
            ) : (
              <ul className="space-y-1">
                {topics.map((t) => (
                  <li
                    key={t.id}
                    className="hand-drawn-border-thin bg-white px-2 py-1.5 text-sm cursor-pointer hover:bg-surface-container transition-colors"
                  >
                    <span className="font-headline block truncate" style={{ fontSize: "13px" }}>{t.title}</span>
                    <span className="font-mono text-source-code text-on-surface-variant block">
                      p.{t.page_range[0]}–{t.page_range[1]}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* Navigation links */}
            <div className="mt-6 space-y-2 border-t-2 border-outline-variant pt-4">
              {[
                { label: "📓 Notebook", path: `/documents/${doc.id}/notebook` },
                { label: "📝 Exam Essentials", path: `/documents/${doc.id}/exam-essentials` },
                { label: "🕸️ Knowledge Graph", path: `/documents/${doc.id}/graph` },
                { label: "🎓 Viva Simulator", path: `/documents/${doc.id}/viva` },
              ].map(({ label, path }) => (
                <Link
                  key={path}
                  to={status === "ready" ? path : "#"}
                  className={`block font-label-caps text-label-caps px-2 py-1 hover:bg-surface-container transition-colors ${
                    status !== "ready" ? "opacity-40 pointer-events-none" : "text-primary"
                  }`}
                  style={{ fontSize: "10px" }}
                >
                  {label}
                </Link>
              ))}
            </div>
          </aside>

          {/* PDF + Notes resizable panels */}
          <div className="flex-1 overflow-hidden min-w-0">
            <PanelGroup orientation="horizontal" className="h-full">
              <Panel defaultSize={65} minSize={30}>
                <PdfPane
                  fileUrl={getDocumentFileUrl(doc.id)}
                  numPages={numPages || doc.total_pages}
                  chunks={doc.chunks}
                  paragraphNotes={paragraphNotes}
                  documentId={doc.id}
                  showHeatmap={showHeatmap}
                  onNumPages={setNumPages}
                  onLoadError={setError}
                />
              </Panel>
              {/* Sketch-style resizable divider */}
              <PanelResizeHandle className="w-3 cursor-col-resize relative flex items-center justify-center bg-surface-container border-x-2 border-on-surface hover:bg-secondary-fixed/40 transition-colors group">
                <div className="flex flex-col gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="w-1 h-1 rounded-full bg-on-surface-variant group-hover:bg-on-surface transition-colors" />
                  ))}
                </div>
              </PanelResizeHandle>
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

        {/* Right BookmarkTabs */}
        <BookmarkTabs
          documentId={doc.id}
          status={status ?? doc.status}
          onHeatmapClick={() => setShowHeatmap((v) => !v)}
          onSearchClick={() => setAssistantOpen((v) => !v)}
        />
      </div>

      <AssistantPanel
        documentId={doc.id}
        isOpen={assistantOpen}
        onClose={() => setAssistantOpen(false)}
      />
    </>
  );
}
