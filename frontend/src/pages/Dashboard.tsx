import { useEffect, useState, useRef, type ChangeEvent, type DragEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { fetchMe, type UserPublic } from "../api/auth";
import { listDocuments, uploadDocument, deleteDocument, type DocumentPublic } from "../api/documents";
import axios from "axios";
import SketchHeader from "../components/sketch/SketchHeader";
import SketchButton from "../components/sketch/SketchButton";
import SketchProgress from "../components/sketch/SketchProgress";

const STATUS_CHIP: Record<string, string> = {
  ready:    "bg-tertiary-fixed-dim text-on-tertiary-fixed border-2 border-on-surface",
  failed:   "bg-error-container text-on-error-container border-2 border-on-surface",
  queued:   "bg-secondary-fixed text-on-secondary-fixed border-2 border-on-surface",
  extracting: "bg-primary-fixed text-on-primary-fixed border-2 border-on-surface",
  segmenting: "bg-primary-fixed text-on-primary-fixed border-2 border-on-surface",
  summarizing:"bg-primary-fixed text-on-primary-fixed border-2 border-on-surface",
};

export default function Dashboard() {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [documents, setDocuments] = useState<DocumentPublic[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  async function handleDeleteDocument(e: React.MouseEvent, docId: string, title: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete "${title}"? This will remove all associated notes and data.`)) return;
    setDeletingId(docId);
    try {
      await deleteDocument(docId);
      setDocuments((prev) => (prev ? prev.filter((d) => d.id !== docId) : null));
    } catch {
      alert("Failed to delete document.");
    } finally {
      setDeletingId(null);
    }
  }


  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("access_token");
        navigate("/login");
      });
    loadDocs();
  }, [navigate]);

  async function loadDocs() {
    try {
      const docs = await listDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error("Failed to load documents", err);
    }
  }

  function handleLogout() {
    localStorage.removeItem("access_token");
    navigate("/login");
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    if (selected && selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are allowed.");
      setFile(null);
      return;
    }
    setError(null);
    setSuccess(null);
    setFile(selected);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;
    if (dropped.type !== "application/pdf" && !dropped.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are allowed.");
      return;
    }
    setError(null);
    setSuccess(null);
    setFile(dropped);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    setUploadProgress(0);
    try {
      const doc = await uploadDocument(file, setUploadProgress);
      setSuccess(`"${doc.title}" uploaded! Starting pipeline...`);
      setFile(null);
      loadDocs();
      setTimeout(() => navigate(`/documents/${doc.id}`), 1500);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else {
        setError("Failed to upload the document. Please try again.");
      }
    } finally {
      setUploading(false);
    }
  }

  const totalPages = documents?.reduce((acc, doc) => acc + (doc.total_pages || 0), 0) || 0;

  return (
    <div className="min-h-screen bg-checkered text-on-surface font-body overflow-x-hidden">
      <SketchHeader
        userEmail={user?.email}
        onLogout={handleLogout}
      />

      <main className="pt-24 pb-16 px-6 md:px-8 max-w-6xl mx-auto">

        {/* Welcome heading */}
        <div className="mb-10 mt-4">
          <h1 className="font-display text-display-lg" style={{ letterSpacing: "-0.02em" }}>
            Study Library
          </h1>
          <p className="font-body text-body-lg text-on-surface-variant mt-1">
            Upload a PDF textbook to extract notes, graphs, and exam essentials.
          </p>
        </div>

        {/* Stats Row */}
        <div className="flex flex-wrap gap-4 mb-10">
          {[
            { label: "Uploaded Books", value: documents?.length ?? 0, color: "text-primary" },
            { label: "Total Pages", value: totalPages, color: "text-secondary" },
            { label: "Pipeline", value: "Active", color: "text-tertiary" },
          ].map(({ label, value, color }, i) => (
            <div
              key={label}
              className="bg-white hand-drawn-border-thin shadow-sketch-sm px-5 py-4 flex flex-col gap-1 min-w-36"
              style={{ transform: `rotate(${[0, -1, 1][i]}deg)` }}
            >
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">{label}</span>
              <span className={`font-display text-headline-md ${color}`}>{value}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Upload Panel */}
          <section className="lg:col-span-5">
            <div className="bg-white hand-drawn-border shadow-sketch p-6 md:p-8 relative"
                 style={{ transform: "rotate(-0.5deg)" }}>
              <h2 className="font-headline text-headline-sm mb-1">Upload Textbook</h2>
              <p className="font-body text-body-md text-on-surface-variant mb-5">
                PDF files — up to 80+ pages supported
              </p>

              {error && (
                <div className="mb-4 hand-drawn-border-thin bg-error-container p-3 text-on-error-container text-sm font-body">
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-4 hand-drawn-border-thin bg-tertiary-fixed/60 p-3 text-on-tertiary-fixed text-sm font-body">
                  {success}
                </div>
              )}

              {/* Drop Zone */}
              <div
                className={`hand-drawn-dashed h-44 flex flex-col items-center justify-center cursor-pointer transition-colors group ${
                  dragging ? "bg-primary-fixed/20" : "bg-surface-container-lowest hover:bg-surface-container"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={uploading}
                />
                <span className="material-symbols-outlined text-5xl text-primary group-hover:-translate-y-1 transition-transform mb-3">
                  upload_file
                </span>
                <p className="font-headline text-headline-sm text-center">
                  {file ? file.name : "Drop PDF here"}
                </p>
                <p className="font-body text-body-md text-on-surface-variant text-center mt-1">
                  {file
                    ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                    : "or click to browse"}
                </p>
              </div>

              {uploading && (
                <div className="mt-5">
                  <SketchProgress value={uploadProgress} label="Uploading..." />
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <SketchButton
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  variant="primary"
                  size="lg"
                  style={{ transform: "rotate(1deg)" }}
                >
                  {uploading ? "Uploading..." : "Upload Document"}
                </SketchButton>
              </div>
            </div>
          </section>

          {/* Documents Panel */}
          <section className="lg:col-span-7">
            <div className="bg-white hand-drawn-border shadow-sketch p-6 md:p-8"
                 style={{ transform: "rotate(0.5deg)" }}>
              <div className="flex justify-between items-center mb-5">
                <h2 className="font-headline text-headline-sm">Your Documents</h2>
                <Link
                  to="/upload"
                  className="font-label-caps text-label-caps text-primary hover:underline underline-offset-2"
                >
                  + New Upload
                </Link>
              </div>

              {!documents && (
                <div className="py-12 text-center font-body text-on-surface-variant">
                  Loading your study library...
                </div>
              )}

              {documents && documents.length === 0 && (
                <div className="py-12 hand-drawn-dashed flex flex-col items-center gap-3 bg-surface-container-lowest">
                  <span className="material-symbols-outlined text-5xl text-on-surface-variant">menu_book</span>
                  <p className="font-body text-body-md text-on-surface-variant">No documents yet.</p>
                  <p className="font-body text-body-md text-on-surface-variant text-sm">Upload a PDF on the left to begin.</p>
                </div>
              )}

              {documents && documents.length > 0 && (
                <ul className="space-y-4">
                  {documents.map((doc, i) => (
                    <li
                      key={doc.id}
                      className="bg-surface-container-low hand-drawn-border-thin p-4 flex items-center justify-between gap-4 hover:bg-surface-container transition-colors"
                      style={{ transform: `rotate(${i % 2 === 0 ? "0.3" : "-0.3"}deg)` }}
                    >
                      <div className="flex-1 truncate">
                        <Link
                          to={`/documents/${doc.id}`}
                          className="font-headline text-headline-sm hover:text-primary transition-colors truncate block"
                          style={{ fontSize: "16px" }}
                        >
                          {doc.title}
                        </Link>
                        <p className="font-mono text-source-code text-on-surface-variant mt-0.5">
                          {doc.total_pages} pages · {new Date(doc.upload_date).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className={`font-label-caps text-label-caps uppercase px-2.5 py-1 ${
                            STATUS_CHIP[doc.status] ?? "bg-surface-variant text-on-surface-variant border-2 border-on-surface"
                          }`}
                          style={{ borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}
                        >
                          {doc.status}
                        </span>
                        <Link
                          to={`/documents/${doc.id}`}
                          className="hand-drawn-border-thin bg-white px-3 py-1.5 font-label-caps text-label-caps hover:bg-primary/10 transition-colors whitespace-nowrap"
                        >
                          Open
                        </Link>
                        <button
                          onClick={(e) => handleDeleteDocument(e, doc.id, doc.title)}
                          disabled={deletingId === doc.id}
                          title="Delete document"
                          className="hand-drawn-border-thin bg-white text-error px-3 py-1.5 font-label-caps text-label-caps hover:bg-error-container transition-colors whitespace-nowrap disabled:opacity-50"
                        >
                          {deletingId === doc.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
