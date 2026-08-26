import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { getDocument, getDocumentFileUrl, type DocumentDetail } from "../api/documents";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export default function DocumentViewer() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);

  useEffect(() => {
    if (!id) return;
    getDocument(id)
      .then(setDetail)
      .catch(() => setError("Failed to load document."));
  }, [id]);

  if (!id) return null;

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex justify-between items-center">
          <Link to="/documents" className="text-blue-600 font-medium text-sm">
            &larr; Back to Documents
          </Link>
          {detail && <h1 className="text-xl font-bold">{detail.title}</h1>}
        </div>

        {error && <p className="text-red-600">{error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white shadow-md rounded-xl p-4 flex flex-col items-center overflow-auto max-h-[85vh]">
            <Document
              file={getDocumentFileUrl(id)}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              onLoadError={() => setError("Failed to render PDF.")}
              loading={<p className="text-slate-500">Loading PDF...</p>}
            >
              {Array.from({ length: numPages }, (_, i) => (
                <Page
                  key={`page_${i + 1}`}
                  pageNumber={i + 1}
                  className="mb-4 border border-slate-200"
                  width={500}
                />
              ))}
            </Document>
          </div>

          <div className="bg-white shadow-md rounded-xl p-4 overflow-auto max-h-[85vh] space-y-3">
            <h2 className="font-semibold text-slate-700">
              Extracted Text Blocks ({detail?.chunks.length ?? 0})
            </h2>
            {!detail && !error && <p className="text-slate-500 text-sm">Loading...</p>}
            {detail?.chunks.map((chunk) => (
              <div key={chunk.id} className="border-b border-slate-100 pb-2">
                <p className="text-xs text-slate-400 mb-1">
                  Page {chunk.page_number} &bull; Block {chunk.paragraph_id} &bull; bbox(
                  {chunk.bounding_box.x0}, {chunk.bounding_box.y0}, {chunk.bounding_box.x1},{" "}
                  {chunk.bounding_box.y1})
                </p>
                <p className="text-sm text-slate-700">{chunk.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
