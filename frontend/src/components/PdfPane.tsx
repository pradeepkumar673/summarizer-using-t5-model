import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useWorkspaceStore } from "../store/workspaceStore";
import { buildChunkIndex, resolveNoteHighlights } from "../lib/highlights";
import type { ChunkPublic, NotePublic } from "../api/documents";
import HeatmapOverlay from "./HeatmapOverlay";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type ViewportPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
};

interface PageScale {
  naturalWidth: number;
  naturalHeight: number;
  renderWidth: number;
  renderHeight: number;
  scale: number;
}

interface PdfPaneProps {
  fileUrl: string;
  numPages: number;
  chunks: ChunkPublic[];
  paragraphNotes: NotePublic[];
  documentId: string;
  showHeatmap: boolean;
  onNumPages: (n: number) => void;
  onLoadError: (message: string) => void;
}

export default function PdfPane({
  fileUrl,
  numPages,
  chunks,
  paragraphNotes,
  documentId,
  showHeatmap,
  onNumPages,
  onLoadError,
}: PdfPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const highlightRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [containerWidth, setContainerWidth] = useState(600);
  const [zoom, setZoom] = useState(1);
  const [pageScales, setPageScales] = useState<Record<number, PageScale>>({});

  const activeHighlights = useWorkspaceStore((s) => s.activeHighlights);
  const highlightScrollToken = useWorkspaceStore((s) => s.highlightScrollToken);
  const activateChunk = useWorkspaceStore((s) => s.activateChunk);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const renderWidth = useMemo(() => {
    const base = Math.max(280, containerWidth - 32);
    return Math.round(base * zoom);
  }, [containerWidth, zoom]);

  const chunksByPage = useMemo(() => {
    const map: Record<number, ChunkPublic[]> = {};
    for (const c of chunks) (map[c.page_number] ??= []).push(c);
    return map;
  }, [chunks]);

  const chunkIndex = useMemo(() => buildChunkIndex(chunks), [chunks]);

  const chunkIdToNote = useMemo(() => {
    const map: Record<string, NotePublic> = {};
    for (const note of paragraphNotes) {
      for (const chunkId of note.source_chunk_ids) map[chunkId] = note;
    }
    return map;
  }, [paragraphNotes]);

  const handlePageLoadSuccess = useCallback(
    (pageNumber: number) => (page: ViewportPage) => {
      const viewport = page.getViewport({ scale: 1 });
      setPageScales((prev) => ({
        ...prev,
        [pageNumber]: {
          naturalWidth: viewport.width,
          naturalHeight: viewport.height,
          renderWidth,
          renderHeight: (viewport.height / viewport.width) * renderWidth,
          scale: renderWidth / viewport.width,
        },
      }));
    },
    [renderWidth]
  );

  useEffect(() => {
    setPageScales((prev) => {
      const next: Record<number, PageScale> = {};
      for (const [pageStr, s] of Object.entries(prev)) {
        const scale = renderWidth / s.naturalWidth;
        next[Number(pageStr)] = {
          ...s,
          renderWidth,
          renderHeight: s.naturalHeight * scale,
          scale,
        };
      }
      return next;
    });
  }, [renderWidth]);

  const handleChunkClick = useCallback(
    (chunk: ChunkPublic) => {
      const note = chunkIdToNote[chunk.id];
      if (!note) return;
      activateChunk(note.id, "paragraph", resolveNoteHighlights(note, chunkIndex));
    },
    [chunkIdToNote, chunkIndex, activateChunk]
  );

  const registerHighlightRef = useCallback(
    (key: string) => (node: HTMLDivElement | null) => {
      highlightRefs.current[key] = node;
    },
    []
  );

  useEffect(() => {
    if (activeHighlights.length === 0) return;
    const key = `${activeHighlights[0].page}_0`;
    let attempts = 0;
    let raf = 0;
    const tryScroll = () => {
      const node = highlightRefs.current[key];
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      attempts += 1;
      if (attempts < 30) raf = requestAnimationFrame(tryScroll);
    };
    tryScroll();
    return () => cancelAnimationFrame(raf);
  }, [highlightScrollToken]);


  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-white px-3 py-2">
        <span className="text-xs font-medium text-slate-500">Document</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            -
          </button>
          <span className="w-12 text-center text-xs text-slate-500">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            +
          </button>
          <button
            onClick={() => setZoom(1)}
            className="ml-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Reset
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto bg-slate-100 p-4">
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages: n }) => onNumPages(n)}
          onLoadError={(err) => onLoadError(`Failed to render PDF: ${err.message}`)}
          loading={<p className="text-sm text-slate-500">Loading PDF...</p>}
        >
          {Array.from({ length: numPages }, (_, i) => {
            const pageNumber = i + 1;
            const scaleInfo = pageScales[pageNumber];
            const pageChunks = chunksByPage[pageNumber] ?? [];
            const pageHighlights = activeHighlights
              .map((h, idx) => ({ ...h, idx }))
              .filter((h) => h.page === pageNumber);

            return (
              <div
                key={pageNumber}
                className="relative mx-auto mb-4 border border-slate-200 shadow"
                style={{ width: scaleInfo?.renderWidth ?? renderWidth }}
              >
                <Page pageNumber={pageNumber} width={renderWidth} onLoadSuccess={handlePageLoadSuccess(pageNumber)} />

                {/* Chunk click overlays (note traceability) */}
                {scaleInfo &&
                  pageChunks.map((chunk) => {
                    const clickable = Boolean(chunkIdToNote[chunk.id]);
                    return (
                      <div
                        key={chunk.id}
                        onClick={() => handleChunkClick(chunk)}
                        title={clickable ? "View note for this paragraph" : undefined}
                        className={clickable ? "absolute cursor-pointer transition-colors hover:bg-blue-400/20" : "absolute"}
                        style={{
                          left: chunk.bounding_box.x0 * scaleInfo.scale,
                          top: chunk.bounding_box.y0 * scaleInfo.scale,
                          width: (chunk.bounding_box.x1 - chunk.bounding_box.x0) * scaleInfo.scale,
                          height: (chunk.bounding_box.y1 - chunk.bounding_box.y0) * scaleInfo.scale,
                          pointerEvents: clickable ? "auto" : "none",
                        }}
                      />
                    );
                  })}

                {/* Heatmap overlays — rendered per page using HeatmapOverlay */}
                {scaleInfo && showHeatmap && (
                  <HeatmapOverlay
                    documentId={documentId}
                    chunks={pageChunks}
                    pageScales={{ [pageNumber]: scaleInfo }}
                    visiblePages={[pageNumber]}
                  />
                )}

                {/* Search / note active-highlight overlays */}
                {scaleInfo &&
                  pageHighlights.map((h) => (
                    <div
                      key={`${pageNumber}_${h.idx}`}
                      ref={registerHighlightRef(`${pageNumber}_${h.idx}`)}
                      className="pointer-events-none absolute rounded-sm bg-yellow-300/50 ring-2 ring-yellow-400"
                      style={{
                        left: h.box.x0 * scaleInfo.scale,
                        top: h.box.y0 * scaleInfo.scale,
                        width: (h.box.x1 - h.box.x0) * scaleInfo.scale,
                        height: (h.box.y1 - h.box.y0) * scaleInfo.scale,
                      }}
                    />
                  ))}
              </div>
            );
          })}
        </Document>
      </div>
    </div>
  );
}
