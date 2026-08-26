import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  getDocument,
  getDocumentFileUrl,
  processDocument,
  getTopics,
  type DocumentDetail,
  type TopicPublic,
} from "../api/documents";
import axios from "axios";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export default function DocumentViewer() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);

  const [topics, setTopics] = useState<TopicPublic[]>([]);
  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getDocument(id)
      .then(setDetail)
      .catch(() => setError("Failed to load document."));

    getTopics(id)
      .then(setTopics)
      .catch(() => {
        // No topics yet is expected for unprocessed documents - not an error
      });
  }, [id]);

  async function handleProcess() {
    if (!id) return;
    setProcessing(true);
    setProcessError(null);
    try {
      const result = await processDocument(id);
      setTopics(result);
      setDetail((prev) => (prev ? { ...prev, status: "segmented" } : prev));
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        setProcessError(err.response.data.detail);
      } else {
        setProcessError("Failed to process document.");
      }
    } finally {
      setProcessing(false);
    }
  }

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

        <div className="bg-white shadow-md rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600">
              Status: <span className="font-semibold">{detail?.status ?? "loading..."}</span>
            </p>
            {processError && <p className="text-red-600 text-sm mt-1">{processError}</p>}
          </div>
          <button
            onClick={handleProcess}
            disabled={processing || !detail || detail.status === "processing"}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {processing ? "Processing..." : "Process Document"}
          </button>
        </div>

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

          <div className="space-y-6">
            {topics.length > 0 && (
              <div className="bg-white shadow-md rounded-xl p-4 overflow-auto max-h-[38vh] space-y-3">
                <h2 className="font-semibold text-slate-700">Detected Topics ({topics.length})</h2>
                {topics.map((topic) => (
                  <div key={topic.id} className="border-b border-slate-100 pb-2">
                    <p className="font-medium text-slate-800">{topic.title}</p>
                    <p className="text-xs text-slate-400">
                      Pages {topic.page_range[0]}&ndash;{topic.page_range[1]} &bull; {topic.paragraph_ids.length} block
                      {topic.paragraph_ids.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-white shadow-md rounded-xl p-4 overflow-auto max-h-[45vh] space-y-3">
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
                    {chunk.avg_font_size && ` &bull; font ${chunk.avg_font_size}pt${chunk.is_bold ? " bold" : ""}`}
                  </p>
                  <p className="text-sm text-slate-700">{chunk.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
