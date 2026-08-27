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
      {/* Search form */}
      <form onSubmit={runSearch} className="flex items-center gap-2">

        {/* Mode toggle — notebook tab style */}
        <div
          className="flex shrink-0 overflow-hidden"
          style={{ border: "2px solid #1c1b1b", borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}
        >
          {(["keyword", "semantic"] as SearchMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleModeChange(m)}
              className={`px-2.5 py-1.5 font-label-caps transition-colors ${
                mode === m
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
              }`}
              style={{ fontSize: "10px" }}
            >
              {m === "keyword" ? "🔍 Keyword" : "🧠 Semantic"}
            </button>
          ))}
        </div>

        {/* Search input */}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={mode === "keyword" ? "Search exact words..." : "Search by meaning..."}
          className="w-full bg-surface-container-lowest border-2 border-on-surface px-3 py-1.5 font-body text-body-md text-on-surface focus:outline-none focus:border-primary transition-colors"
          style={{ borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}
        />

        {/* Search button */}
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 bg-white px-3 py-1.5 font-label-caps text-label-caps text-on-surface hover:bg-primary/10 transition-colors disabled:opacity-50 active:scale-95"
          style={{
            border: "2px solid #1c1b1b",
            borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
            fontSize: "10px",
          }}
        >
          {loading ? "..." : "Search"}
        </button>
      </form>

      {/* Results dropdown — paper drop-down overlay */}
      {open && (
        <div
          className="absolute z-20 mt-2 max-h-96 w-full overflow-auto bg-white"
          style={{
            border: "2px solid #1c1b1b",
            borderRadius: "15px 255px 15px 225px / 225px 15px 255px 15px",
            boxShadow: "4px 4px 0px #1c1b1b",
          }}
        >
          {/* Dropdown header */}
          <div className="flex items-center justify-between border-b-2 border-on-surface bg-surface-container-low px-4 py-2">
            <span className="font-mono text-source-code text-on-surface-variant">
              {loading
                ? "Searching..."
                : error
                ? "Error"
                : `${results.length} result${results.length === 1 ? "" : "s"} (${mode})`}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="font-label-caps text-label-caps text-on-surface-variant hover:text-error transition-colors"
              style={{ fontSize: "10px" }}
            >
              ✕ Close
            </button>
          </div>

          {error && (
            <p className="px-4 py-2 font-body text-body-md text-error">{error}</p>
          )}
          {!error && !loading && results.length === 0 && (
            <p className="px-4 py-3 font-body text-body-md text-on-surface-variant">
              No matches found.{" "}
              {mode === "semantic" && 'Run "Segment Topics" first to build the semantic index.'}
            </p>
          )}

          <ul>
            {results.map((r, i) => (
              <li
                key={`${r.source_type}_${r.chunk_id ?? r.note_id}_${i}`}
                onClick={() => handleResultClick(r)}
                className="cursor-pointer px-4 py-3 hover:bg-primary-fixed/20 border-b border-outline-variant last:border-b-0 transition-colors"
              >
                <div className="mb-1 flex items-center gap-2 flex-wrap">
                  <span
                    className={`font-label-caps text-label-caps px-1.5 py-0.5 ${
                      r.source_type === "note"
                        ? "bg-tertiary-fixed text-on-tertiary-fixed"
                        : "bg-surface-variant text-on-surface-variant"
                    }`}
                    style={{
                      fontSize: "8px",
                      border: "1px solid #1c1b1b",
                      borderRadius: "255px 5px 225px 5px / 5px 225px 5px 255px",
                    }}
                  >
                    {r.source_type === "note" ? `${r.note_level} note` : "source text"}
                  </span>
                  <span className="font-mono text-source-code text-on-surface-variant">
                    p.{r.page_number} · {r.score.toFixed(3)}
                  </span>
                </div>
                <p className="font-body text-body-md text-on-surface max-h-10 overflow-hidden leading-snug">
                  {r.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
