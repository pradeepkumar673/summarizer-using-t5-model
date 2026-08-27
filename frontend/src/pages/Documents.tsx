import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listDocuments, type DocumentPublic } from "../api/documents";
import SketchHeader from "../components/sketch/SketchHeader";

const STATUS_CHIP: Record<string, string> = {
  ready:      "bg-tertiary-fixed-dim text-on-tertiary-fixed border-2 border-on-surface",
  segmented:  "bg-tertiary-fixed-dim text-on-tertiary-fixed border-2 border-on-surface",
  failed:     "bg-error-container text-on-error-container border-2 border-on-surface",
  queued:     "bg-secondary-fixed text-on-secondary-fixed border-2 border-on-surface",
  extracting: "bg-primary-fixed text-on-primary-fixed border-2 border-on-surface",
  segmenting: "bg-primary-fixed text-on-primary-fixed border-2 border-on-surface",
  summarizing:"bg-primary-fixed text-on-primary-fixed border-2 border-on-surface",
};

export default function Documents() {
  const [documents, setDocuments] = useState<DocumentPublic[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listDocuments()
      .then(setDocuments)
      .catch(() => setError("Failed to load documents."));
  }, []);

  return (
    <div className="min-h-screen bg-checkered text-on-surface font-body">
      <SketchHeader />

      <main className="pt-24 pb-16 px-6 md:px-8 max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="font-display text-headline-md">My Documents</h1>
          <Link
            to="/upload"
            className="hand-drawn-border bg-white px-4 py-2 font-label-caps text-label-caps hover:bg-primary/10 transition-colors"
          >
            + Upload New
          </Link>
        </div>

        {error && (
          <div className="hand-drawn-border-thin bg-error-container p-3 font-body text-body-md text-on-error-container mb-4">
            {error}
          </div>
        )}
        {!documents && !error && (
          <p className="font-body text-body-md text-on-surface-variant">Loading...</p>
        )}
        {documents && documents.length === 0 && (
          <div className="hand-drawn-dashed py-16 text-center bg-surface-container-lowest">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant">menu_book</span>
            <p className="font-body text-body-md text-on-surface-variant mt-3">No documents yet. Upload one to begin.</p>
          </div>
        )}

        {documents && documents.length > 0 && (
          <ul className="space-y-3">
            {documents.map((doc, i) => (
              <li
                key={doc.id}
                className="bg-white hand-drawn-border-thin shadow-sketch-sm"
                style={{ transform: `rotate(${i % 2 === 0 ? "0.2" : "-0.2"}deg)` }}
              >
                <Link
                  to={`/documents/${doc.id}`}
                  className="flex justify-between items-center p-4 group"
                >
                  <div className="min-w-0">
                    <p className="font-headline text-headline-sm truncate group-hover:text-primary transition-colors" style={{ fontSize: "16px" }}>
                      {doc.title}
                    </p>
                    <p className="font-mono text-source-code text-on-surface-variant">
                      {doc.total_pages} page{doc.total_pages !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <span
                    className={`font-label-caps text-label-caps uppercase px-2.5 py-1 ml-4 shrink-0 ${
                      STATUS_CHIP[doc.status] ?? "bg-surface-variant text-on-surface-variant border-2 border-on-surface"
                    }`}
                    style={{ borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}
                  >
                    {doc.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
