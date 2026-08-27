import { useEffect, useState, type ChangeEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { fetchMe, type UserPublic } from "../api/auth";
import { listDocuments, uploadDocument, type DocumentPublic } from "../api/documents";
import axios from "axios";

export default function Dashboard() {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [documents, setDocuments] = useState<DocumentPublic[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const navigate = useNavigate();

  // Load User and Documents on mount
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

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    setUploadProgress(0);

    try {
      const doc = await uploadDocument(file, setUploadProgress);
      setSuccess(`"${doc.title}" uploaded successfully! Starting background pipeline...`);
      setFile(null);
      loadDocs();
      // Redirect to the newly uploaded document viewer to track progress
      setTimeout(() => {
        navigate(`/documents/${doc.id}`);
      }, 1500);
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
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Header Navigation */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            TP
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Traceable PDF Notes
            </h1>
            <p className="text-[10px] text-indigo-400 font-medium uppercase tracking-wider">Workspace Dashboard</p>
          </div>
        </div>

        <div className="flex items-center space-x-6">
          {user && (
            <div className="hidden md:block text-right">
              <p className="text-sm font-medium text-slate-200">{user.email}</p>
              <p className="text-xs text-slate-500">Active Session</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg transition-all border border-slate-700"
          >
            Log Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-8">
        
        {/* Statistics Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-6 flex flex-col justify-between hover:border-slate-700/80 transition-all">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Uploaded Books</span>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold text-white">{documents?.length ?? 0}</span>
              <span className="text-xs text-slate-500">PDF files</span>
            </div>
          </div>
          
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-6 flex flex-col justify-between hover:border-slate-700/80 transition-all">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Pages Processed</span>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold text-indigo-400">{totalPages}</span>
              <span className="text-xs text-slate-500">Pages total</span>
            </div>
          </div>

          <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-6 flex flex-col justify-between hover:border-slate-700/80 transition-all">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pipeline Server</span>
            <div className="mt-2 flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-sm font-semibold text-slate-200">Connected</span>
              <span className="text-xs text-slate-500">(Celery & Redis)</span>
            </div>
          </div>
        </section>

        {/* Workspace Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Panel: Upload Zone */}
          <section className="lg:col-span-5 space-y-6">
            <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 space-y-6">
              <div>
                <h2 className="text-lg font-bold text-white">Upload Textbook</h2>
                <p className="text-xs text-slate-400">Ingest documents into the pipeline to extract notes, graphs, and exam essentials.</p>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-lg">
                  {error}
                </div>
              )}
              {success && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-3 rounded-lg">
                  {success}
                </div>
              )}

              {/* Upload Input Area */}
              <div className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-xl p-8 text-center transition-all relative cursor-pointer bg-slate-950/20">
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={uploading}
                />
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 mx-auto flex items-center justify-center">
                    <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">
                      {file ? "File selected!" : "Click or drag PDF here"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">PDF file formats up to 50MB</p>
                  </div>
                </div>
              </div>

              {file && (
                <div className="bg-slate-900 border border-slate-850 p-3 rounded-lg flex items-center justify-between">
                  <div className="truncate max-w-[80%]">
                    <p className="text-xs font-medium text-slate-200 truncate">{file.name}</p>
                    <p className="text-[10px] text-slate-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                  <button
                    onClick={() => setFile(null)}
                    className="text-xs text-slate-500 hover:text-white"
                  >
                    Remove
                  </button>
                </div>
              )}

              {uploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-violet-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl font-semibold text-xs tracking-wide uppercase transition-all shadow-lg shadow-indigo-600/10"
              >
                {uploading ? `Uploading & Parsing...` : "Upload Document"}
              </button>
            </div>
          </section>

          {/* Right Panel: Document List */}
          <section className="lg:col-span-7 space-y-6">
            <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-white">Study Library</h2>
                  <p className="text-xs text-slate-400">Select any active textbook to open its traceable study workspace.</p>
                </div>
              </div>

              {!documents && (
                <div className="text-center py-12 text-slate-500 text-sm">
                  Loading your study library...
                </div>
              )}

              {documents && documents.length === 0 && (
                <div className="text-center py-12 border border-dashed border-slate-855 rounded-xl bg-slate-950/10">
                  <p className="text-sm text-slate-400">No documents found in your library.</p>
                  <p className="text-xs text-slate-600 mt-1">Upload a PDF textbook on the left to begin.</p>
                </div>
              )}

              {documents && documents.length > 0 && (
                <div className="space-y-4">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="border border-slate-850 bg-slate-950/20 hover:bg-slate-950/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all hover:border-slate-800"
                    >
                      <div className="space-y-1 truncate max-w-xs md:max-w-md">
                        <Link
                          to={`/documents/${doc.id}`}
                          className="font-semibold text-sm text-slate-200 hover:text-indigo-400 transition-colors truncate block"
                        >
                          {doc.title}
                        </Link>
                        <div className="flex items-center space-x-3 text-xs text-slate-500">
                          <span>{doc.total_pages} page{doc.total_pages !== 1 ? "s" : ""}</span>
                          <span>•</span>
                          <span>{new Date(doc.upload_date).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end space-x-4">
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full ${
                          doc.status === "ready"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : doc.status === "failed"
                            ? "bg-red-500/10 text-red-400 border border-red-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}>
                          {doc.status}
                        </span>

                        <Link
                          to={`/documents/${doc.id}`}
                          className="px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600 border border-indigo-500/20 text-indigo-400 hover:text-white rounded-lg text-xs font-semibold transition-all"
                        >
                          Open Workspace
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
