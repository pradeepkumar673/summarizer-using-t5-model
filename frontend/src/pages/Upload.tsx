import { useState, useRef, type ChangeEvent, type DragEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { uploadDocument } from "../api/documents";
import axios from "axios";
import SketchHeader from "../components/sketch/SketchHeader";
import SketchButton from "../components/sketch/SketchButton";
import SketchProgress from "../components/sketch/SketchProgress";

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    if (selected && selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are allowed.");
      setFile(null);
      return;
    }
    setError(null);
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
    setFile(dropped);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      const doc = await uploadDocument(file, setProgress);
      navigate(`/documents/${doc.id}`);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else {
        setError("Upload failed. Please try again.");
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-checkered text-on-surface font-body overflow-x-hidden relative">
      <SketchHeader />

      {/* Right-side greyed bookmark tabs (disabled on upload page) */}
      <nav className="fixed right-0 top-24 w-16 flex flex-col gap-3 z-40 items-end">
        {[
          { icon: "edit_note", rot: 1 },
          { icon: "local_fire_department", rot: -1 },
          { icon: "assignment_turned_in", rot: 2 },
          { icon: "hub", rot: -2 },
          { icon: "record_voice_over", rot: 1 },
          { icon: "search", rot: -1 },
        ].map(({ icon, rot }) => (
          <div
            key={icon}
            className="bg-surface-variant text-on-surface-variant py-3 px-2 -mr-1 rounded-l-full border-2 border-on-surface opacity-40 flex items-center translate-x-3"
            style={{ transform: `rotate(${rot}deg) translateX(12px)` }}
          >
            <span className="material-symbols-outlined text-xl">{icon}</span>
          </div>
        ))}
      </nav>

      <main className="pt-28 pb-20 px-6 md:px-8 max-w-5xl mx-auto flex flex-col items-center justify-center min-h-[calc(100vh-80px)]">

        {/* Upload Card */}
        <div className="relative bg-white hand-drawn-border shadow-sketch p-8 md:p-12 w-full max-w-2xl"
             style={{ transform: "rotate(-1deg)" }}>

          {/* Annotation: your textbook */}
          <div className="absolute -top-14 -left-4 md:-left-16 hidden md:block"
               style={{ transform: "rotate(-15deg)" }}>
            <p className="marker-text text-error text-lg mb-1">your textbook / chapter / notes</p>
            <svg fill="none" height="40" viewBox="0 0 60 40" width="60" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 5Q30 35 55 35M55 35L45 25M55 35L45 45"
                stroke="#ba1a1a" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            </svg>
          </div>

          {/* Annotation: page limit */}
          <div className="absolute -right-6 top-1/4 hidden md:block"
               style={{ transform: "rotate(10deg)" }}>
            <svg fill="none" height="30" viewBox="0 0 40 30" width="40" xmlns="http://www.w3.org/2000/svg">
              <path d="M35 5Q15 25 5 25M5 25L15 15M5 25L15 35"
                stroke="#ba1a1a" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            </svg>
            <p className="marker-text text-error text-base mt-1">up to 80+ pages</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 hand-drawn-border-thin bg-error-container p-3 text-on-error-container font-body text-sm">
              {error}
            </div>
          )}

          {/* Drop Zone */}
          <div
            className={`hand-drawn-dashed bg-surface-container-lowest h-64 flex flex-col items-center justify-center p-6 relative cursor-pointer transition-colors group ${
              dragging ? "bg-primary-fixed/30" : "hover:bg-surface-container"
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
            />
            <div className="mb-4 text-primary group-hover:-translate-y-2 transition-transform duration-300">
              <span className="material-symbols-outlined text-6xl">upload_file</span>
            </div>
            <h2 className="font-headline text-headline-sm mb-2 text-center">
              {file ? file.name : "Drop your PDF here"}
            </h2>
            <p className="font-body text-body-md text-on-surface-variant text-center">
              {file
                ? `${(file.size / (1024 * 1024)).toFixed(1)} MB — ready to upload`
                : "or click to browse"}
            </p>
          </div>

          {/* Progress bar */}
          {uploading && (
            <div className="mt-6">
              <SketchProgress value={progress} label="Uploading..." />
            </div>
          )}

          {/* Actions */}
          <div className="mt-8 flex items-center justify-between gap-4 flex-wrap">
            <Link
              to="/documents"
              className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary underline underline-offset-2 transition-colors"
            >
              My Documents
            </Link>
            <SketchButton
              onClick={handleUpload}
              disabled={!file || uploading}
              variant="primary"
              size="lg"
              style={{ transform: "rotate(1deg)" }}
            >
              {uploading ? `Processing... ${progress}%` : "Upload PDF"}
            </SketchButton>
          </div>
        </div>

        {/* Feature chips */}
        <div className="mt-14 flex flex-wrap justify-center gap-5">
          {[
            { icon: "draw", label: "Traceable Notes", color: "text-primary", rot: -2 },
            { icon: "whatshot", label: "Confusion Heatmap", color: "text-secondary", rot: 3 },
            { icon: "mic", label: "Viva Practice", color: "text-tertiary", rot: -1 },
          ].map(({ icon, label, color, rot }) => (
            <div
              key={label}
              className="bg-surface-container-low hand-drawn-border-thin px-4 py-2 flex items-center gap-2"
              style={{ transform: `rotate(${rot}deg)` }}
            >
              <span className={`material-symbols-outlined ${color}`}>{icon}</span>
              <span className="marker-text text-lg">{label}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
