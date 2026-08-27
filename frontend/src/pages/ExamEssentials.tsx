import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import {
  getDocument,
  getExamEssentials,
  generateExamEssentials,
  getExportMarkdownUrl,
  getExportPdfUrl,
  type DocumentDetail,
  type ExamCategory,
  type ExamEssential,
  type ExamEssentialsResult,
} from "../api/documents";
import { useWorkspaceStore } from "../store/workspaceStore";
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

// Category metadata — sketch-palette accent colours replacing generic Tailwind colours
const CATEGORY_META: {
  key: ExamCategory;
  label: string;
  icon: string;
  borderColor: string;
  bgColor: string;
  badgeBg: string;
  badgeText: string;
}[] = [
  { key: "definition", label: "Definitions",         icon: "book_2",           borderColor: "border-primary",            bgColor: "bg-primary-fixed/30",       badgeBg: "bg-primary-fixed",      badgeText: "text-on-primary-fixed" },
  { key: "formula",    label: "Formulas",             icon: "functions",        borderColor: "border-secondary",          bgColor: "bg-secondary-fixed/30",     badgeBg: "bg-secondary-fixed",    badgeText: "text-on-secondary-fixed" },
  { key: "unit",       label: "Units & Symbols",      icon: "straighten",       borderColor: "border-tertiary",           bgColor: "bg-tertiary-fixed/20",      badgeBg: "bg-tertiary-fixed",     badgeText: "text-on-tertiary-fixed" },
  { key: "rule",       label: "Rules & Laws",         icon: "gavel",            borderColor: "border-secondary-container",bgColor: "bg-secondary-fixed-dim/30", badgeBg: "bg-secondary-container",badgeText: "text-on-secondary-container" },
  { key: "example",   label: "Examples",              icon: "lightbulb",        borderColor: "border-tertiary-container", bgColor: "bg-tertiary-fixed/10",      badgeBg: "bg-tertiary-fixed-dim", badgeText: "text-on-tertiary-fixed-variant" },
  { key: "exception", label: "Exceptions & Caveats",  icon: "warning",          borderColor: "border-error",              bgColor: "bg-error-container/50",     badgeBg: "bg-error-container",    badgeText: "text-on-error-container" },
];

const EMPTY_RESULT: ExamEssentialsResult = {
  definition: [], formula: [], unit: [], rule: [], example: [], exception: [],
};

export default function ExamEssentials() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [essentials, setEssentials] = useState<ExamEssentialsResult>(EMPTY_RESULT);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ExamCategory>("definition");
  const [exporting, setExporting] = useState<"md" | "pdf" | null>(null);

  const focusSearchResult = useWorkspaceStore((s) => s.focusSearchResult);

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
      const filename = (doc?.title ?? "exam_essentials").replace(/\s+/g, "_") + extension;
      downloadBlob(blob, filename);
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.detail ?? "Export failed." : "Export failed.");
    } finally {
      setExporting(null);
    }
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [docDetail, examData] = await Promise.all([getDocument(id!), getExamEssentials(id!)]);
        if (cancelled) return;
        setDoc(docDetail);
        setEssentials(examData);
      } catch (err) {
        if (!cancelled) setError(axios.isAxiosError(err) ? err.response?.data?.detail ?? "Failed to load exam essentials." : "Failed to load exam essentials.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  async function handleGenerate() {
    if (!id) return;
    setGenerating(true);
    setError(null);
    try {
      const data = await generateExamEssentials(id);
      setEssentials(data);
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.detail ?? "Extraction failed." : "Extraction failed.");
    } finally {
      setGenerating(false);
    }
  }

  function handleEntryClick(entry: ExamEssential) {
    focusSearchResult({ page: entry.source_page, box: entry.source_bounding_box });
  }

  const totalCount = Object.values(essentials).reduce((s, arr) => s + arr.length, 0);
  const activeItems = essentials[activeCategory] ?? [];
  const activeMeta = CATEGORY_META.find((m) => m.key === activeCategory) ?? CATEGORY_META[0];

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-checkered">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-primary animate-spin" style={{ animationDuration: "2s" }}>autorenew</span>
          <p className="font-headline text-headline-sm mt-4 text-on-surface-variant">Loading exam essentials...</p>
        </div>
      </div>
    );
  }

  if (error && !doc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-checkered">
        <div className="bg-white hand-drawn-border shadow-sketch p-8 max-w-md text-center">
          <span className="material-symbols-outlined text-5xl text-error">error</span>
          <p className="font-headline text-headline-sm mt-3 mb-4">{error}</p>
          <Link to="/documents" className="hand-drawn-border-thin px-4 py-2 font-label-caps text-label-caps">← Back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-checkered text-on-surface font-body">
      <SketchHeader />

      <BookmarkTabs documentId={id!} status={doc?.status} />

      <main className="pt-24 pb-16 px-6 md:px-8 max-w-5xl mx-auto pr-20 md:pr-28">

        {/* Back + title */}
        <div className="mb-6">
          <Link to={`/documents/${id}`} className="font-label-caps text-label-caps text-primary hover:underline">
            ← Back to workspace
          </Link>
          <h1 className="font-display text-headline-md mt-2">{doc?.title ?? ""}</h1>
          <p className="font-body text-body-md text-on-surface-variant mt-1">
            {totalCount > 0
              ? `${totalCount} key items across ${CATEGORY_META.filter(m => (essentials[m.key]?.length ?? 0) > 0).length} categories`
              : "No items extracted yet."}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <SketchButton
            onClick={handleGenerate}
            disabled={generating || exporting !== null}
            variant="primary"
            size="md"
            style={{ transform: "rotate(-0.5deg)" }}
          >
            {generating ? "Extracting..." : totalCount === 0 ? "Extract Key Info" : "Re-extract"}
          </SketchButton>
          <SketchButton
            onClick={() => handleExport("md")}
            disabled={exporting !== null || generating || totalCount === 0}
            variant="ghost"
            size="sm"
          >
            {exporting === "md" ? "Downloading..." : "⬇ Download .md"}
          </SketchButton>
          <SketchButton
            onClick={() => handleExport("pdf")}
            disabled={exporting !== null || generating || totalCount === 0}
            variant="ghost"
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

        {/* Category tabs — notebook divider style */}
        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORY_META.map((meta, i) => {
            const count = essentials[meta.key]?.length ?? 0;
            const isActive = activeCategory === meta.key;
            return (
              <button
                key={meta.key}
                onClick={() => setActiveCategory(meta.key)}
                className={`flex items-center gap-2 px-4 py-2 font-label-caps text-label-caps transition-all ${
                  isActive
                    ? `hand-drawn-border ${meta.bgColor} shadow-sketch-sm`
                    : "hand-drawn-border-thin bg-white hover:bg-surface-container"
                }`}
                style={{ transform: `rotate(${[0, 0.5, -0.5, 0, 0.5, -0.3][i]}deg)` }}
              >
                <span className="material-symbols-outlined text-base">{meta.icon}</span>
                {meta.label}
                <span
                  className={`font-mono text-label-caps px-1.5 py-0.5 ${meta.badgeBg} ${meta.badgeText}`}
                  style={{
                    fontSize: "9px",
                    borderRadius: "255px 5px 225px 5px / 5px 225px 5px 255px",
                    border: "1px solid #1c1b1b",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Section heading — notebook rule */}
        <div className="flex items-center gap-3 mb-4">
          <span className="material-symbols-outlined text-2xl">{activeMeta.icon}</span>
          <h2 className="font-headline text-headline-sm">{activeMeta.label}</h2>
          <div className="flex-1 border-b-2 border-on-surface" style={{ borderStyle: "dashed" }} />
          <span className="font-mono text-source-code text-on-surface-variant">{activeItems.length} items</span>
        </div>

        {/* Entry list */}
        {activeItems.length === 0 ? (
          <div className="hand-drawn-dashed py-16 text-center bg-surface-container-lowest">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant">{activeMeta.icon}</span>
            <p className="font-body text-body-md text-on-surface-variant mt-3">
              No {activeMeta.label.toLowerCase()} found.{" "}
              {totalCount === 0 && 'Click "Extract Key Info" to run the extractor.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {activeItems.map((entry, i) => (
              <li
                key={entry.id}
                onClick={() => handleEntryClick(entry)}
                className={`cursor-pointer p-4 transition-all hover:shadow-sketch-sm
                  hand-drawn-border-thin ${activeMeta.bgColor} border-l-4 ${activeMeta.borderColor}`}
                style={{ transform: `rotate(${i % 2 === 0 ? "0.2" : "-0.2"}deg)` }}
              >
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span
                    className={`font-label-caps text-label-caps uppercase tracking-wider px-2 py-0.5 ${activeMeta.badgeBg} ${activeMeta.badgeText}`}
                    style={{
                      fontSize: "9px",
                      borderRadius: "255px 5px 225px 5px / 5px 225px 5px 255px",
                      border: "1px solid #1c1b1b",
                    }}
                  >
                    {entry.category}
                  </span>
                  <span className="font-mono text-source-code text-on-surface-variant">
                    p.{entry.source_page}
                  </span>
                  {entry.source_bounding_box && (
                    <span className="font-label-caps text-label-caps text-primary" style={{ fontSize: "9px" }}>
                      ↗ click to highlight
                    </span>
                  )}
                </div>
                <p className="font-body text-body-md text-on-surface leading-relaxed">
                  {entry.text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
