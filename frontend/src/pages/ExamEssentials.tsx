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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 200);
}

const CATEGORY_META: {
  key: ExamCategory;
  label: string;
  color: string;
  badge: string;
}[] = [
  {
    key: "definition",
    label: "Definitions",
    color: "border-blue-200 bg-blue-50",
    badge: "bg-blue-100 text-blue-700",
  },
  {
    key: "formula",
    label: "Formulas",
    color: "border-purple-200 bg-purple-50",
    badge: "bg-purple-100 text-purple-700",
  },
  {
    key: "unit",
    label: "Units & Symbols",
    color: "border-teal-200 bg-teal-50",
    badge: "bg-teal-100 text-teal-700",
  },
  {
    key: "rule",
    label: "Rules & Laws",
    color: "border-amber-200 bg-amber-50",
    badge: "bg-amber-100 text-amber-700",
  },
  {
    key: "example",
    label: "Examples",
    color: "border-green-200 bg-green-50",
    badge: "bg-green-100 text-green-700",
  },
  {
    key: "exception",
    label: "Exceptions & Caveats",
    color: "border-red-200 bg-red-50",
    badge: "bg-red-100 text-red-700",
  },
];

const EMPTY_RESULT: ExamEssentialsResult = {
  definition: [],
  formula: [],
  unit: [],
  rule: [],
  example: [],
  exception: [],
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
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.detail ?? "Export failed."
          : "Export failed."
      );
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
        const [docDetail, examData] = await Promise.all([
          getDocument(id!),
          getExamEssentials(id!),
        ]);
        if (cancelled) return;
        setDoc(docDetail);
        setEssentials(examData);
      } catch (err) {
        if (!cancelled) {
          setError(
            axios.isAxiosError(err)
              ? err.response?.data?.detail ?? "Failed to load exam essentials."
              : "Failed to load exam essentials."
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

  async function handleGenerate() {
    if (!id) return;
    setGenerating(true);
    setError(null);
    try {
      const data = await generateExamEssentials(id);
      setEssentials(data);
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.detail ?? "Extraction failed."
          : "Extraction failed."
      );
    } finally {
      setGenerating(false);
    }
  }

  function handleEntryClick(entry: ExamEssential) {
    focusSearchResult({
      page: entry.source_page,
      box: entry.source_bounding_box,
    });
  }

  const totalCount = Object.values(essentials).reduce((s, arr) => s + arr.length, 0);
  const activeItems = essentials[activeCategory] ?? [];
  const activeMeta =
    CATEGORY_META.find((m) => m.key === activeCategory) ?? CATEGORY_META[0];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading exam essentials…
      </div>
    );
  }

  if (error && !doc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error}</p>
        <Link to="/documents" className="text-blue-600 hover:underline">
          Back to documents
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="border-b bg-white px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              to={`/documents/${id}`}
              className="text-sm text-blue-600 hover:underline"
            >
              &larr; Back to workspace
            </Link>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">
              Exam Essentials &mdash; {doc?.title ?? ""}
            </h1>
            <p className="text-sm text-slate-500">
              {totalCount > 0
                ? `${totalCount} key items extracted across ${Object.keys(essentials).length} categories.`
                : "No items extracted yet. Click the button to run extraction."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={generating || exporting !== null}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? "Extracting…" : totalCount === 0 ? "Extract Key Info" : "Re-extract"}
            </button>
            <button
              onClick={() => handleExport("md")}
              disabled={exporting !== null || generating}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {exporting === "md" ? "Downloading…" : "Download .md"}
            </button>
            <button
              onClick={() => handleExport("pdf")}
              disabled={exporting !== null || generating}
              className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              {exporting === "pdf" ? "Downloading…" : "Download .pdf"}
            </button>
          </div>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </header>

      <div className="mx-auto max-w-5xl p-6">
        {/* ── Category tabs ────────────────────────────────────────────── */}
        <div className="mb-6 flex flex-wrap gap-2">
          {CATEGORY_META.map((meta) => {
            const count = essentials[meta.key]?.length ?? 0;
            const isActive = activeCategory === meta.key;
            return (
              <button
                key={meta.key}
                onClick={() => setActiveCategory(meta.key)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
                  isActive
                    ? "border-indigo-300 bg-indigo-600 text-white shadow"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {meta.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    isActive ? "bg-white/20 text-white" : meta.badge
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Entry list ───────────────────────────────────────────────── */}
        {activeItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <p className="text-slate-400">
              No {activeMeta.label.toLowerCase()} found.{" "}
              {totalCount === 0 && "Click &ldquo;Extract Key Info&rdquo; to run the extractor."}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {activeItems.map((entry) => (
              <li
                key={entry.id}
                onClick={() => handleEntryClick(entry)}
                className={`cursor-pointer rounded-xl border p-4 shadow-sm transition-all hover:shadow-md ${activeMeta.color} hover:brightness-95`}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${activeMeta.badge}`}
                  >
                    {entry.category}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Page {entry.source_page}
                  </span>
                  {entry.source_bounding_box && (
                    <span className="text-[10px] text-indigo-500">
                      ↗ Click to highlight in PDF
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-slate-800">{entry.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
