import { useState, type FormEvent } from "react";
import axios from "axios";
import { searchKeyword, searchSemantic, type SearchResult } from "../api/documents";
import { useWorkspaceStore } from "../store/workspaceStore";

type SearchMode = "keyword" | "semantic";

interface SearchBarProps {
  documentId: string;
}

export default function SearchBar({ documentId }: SearchBarProps) {
  const [mode, setMode] = useState<SearchMode>("keyword");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const focusSearchResult = useWorkspaceStore((s) => s.focusSearchResult);

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data =
        mode === "keyword"
          ? await searchKeyword(documentId, trimmed)
          : await searchSemantic(documentId, trimmed);
      setResults(data);
      setOpen(true);
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.detail ?? "Search failed."
          : "Search failed."
      );
      setResults([]);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  function handleResultClick(r: SearchResult) {
    focusSearchResult({
      page: r.page_number,
      box: r.bounding_box,
      noteId: r.note_id,
      noteLevel: r.note_level,
    });
    setOpen(false);
  }

  function handleModeChange(next: SearchMode) {
    setMode(next);
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="relative w-full max-w-md">
      <form onSubmit={runSearch} className="flex items-center gap-2">
        <div className="flex shrink-0 overflow-hidden rounded-md border border-slate-300">
          <button
            type="button"
            onClick={() => handleModeChange("keyword")}
            className={`px-2 py-1.5 text-xs font-medium transition-colors ${
              mode === "keyword"
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Keyword
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("semantic")}
            className={`px-2 py-1.5 text-xs font-medium transition-colors ${
              mode === "semantic"
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Semantic
          </button>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={mode === "keyword" ? "Search exact words..." : "Search by meaning..."}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "..." : "Search"}
        </button>
      </form>

      {open && (
        <div className="absolute z-20 mt-1 max-h-96 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-1.5">
            <span className="text-xs font-medium text-slate-500">
              {loading
                ? "Searching..."
                : error
                ? "Error"
                : `${results.length} result${results.length === 1 ? "" : "s"} (${mode})`}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-slate-400 hover:text-slate-700"
            >
              Close
            </button>
          </div>
          {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}
          {!error && !loading && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">
              No matches found. {mode === "semantic" && 'Run "Segment Topics" first to build the semantic index.'}
            </p>
          )}
          <ul className="divide-y divide-slate-100">
            {results.map((r, i) => (
              <li
                key={`${r.source_type}_${r.chunk_id ?? r.note_id}_${i}`}
                onClick={() => handleResultClick(r)}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-blue-50"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      r.source_type === "note"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {r.source_type === "note" ? `${r.note_level} note` : "source text"}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Page {r.page_number} &bull; score {r.score.toFixed(3)}
                  </span>
                </div>
                <p className="max-h-10 overflow-hidden text-slate-700">{r.text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
