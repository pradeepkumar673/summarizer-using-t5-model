import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listDocuments, type DocumentPublic } from "../api/documents";

function statusBadgeClass(status: DocumentPublic["status"]): string {
  if (status === "ready" || status === "segmented") return "bg-green-100 text-green-700";
  if (status === "processing") return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

export default function Documents() {
  const [documents, setDocuments] = useState<DocumentPublic[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listDocuments()
      .then(setDocuments)
      .catch(() => setError("Failed to load documents."));
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white shadow-md rounded-xl p-8 space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">My Documents</h1>
          <Link
            to="/upload"
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
          >
            Upload New
          </Link>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {!documents && !error && <p className="text-slate-500">Loading...</p>}
        {documents && documents.length === 0 && (
          <p className="text-slate-500">No documents uploaded yet.</p>
        )}

        <ul className="divide-y divide-slate-200">
          {documents?.map((doc) => (
            <li key={doc.id} className="py-3">
              <Link to={`/documents/${doc.id}`} className="flex justify-between items-center group">
                <div>
                  <p className="font-medium text-slate-800 group-hover:text-blue-600">{doc.title}</p>
                  <p className="text-sm text-slate-500">
                    {doc.total_pages} page{doc.total_pages !== 1 ? "s" : ""}
                  </p>
                </div>
                <span className={"text-xs font-semibold px-2 py-1 rounded-full " + statusBadgeClass(doc.status)}>
                  {doc.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
