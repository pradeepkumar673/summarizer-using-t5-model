import api from "./client";

export type DocumentStatus = "processing" | "ready" | "failed";

export type DocumentPublic = {
  id: string;
  title: string;
  owner_id: string;
  upload_date: string;
  total_pages: number;
  status: DocumentStatus;
};

export type BoundingBox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type ChunkPublic = {
  id: string;
  document_id: string;
  page_number: number;
  paragraph_id: number;
  text: string;
  bounding_box: BoundingBox;
};

export type DocumentDetail = DocumentPublic & {
  chunks: ChunkPublic[];
};

export async function uploadDocument(
  file: File,
  onProgress: (percent: number) => void
): Promise<DocumentPublic> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await api.post<DocumentPublic>("/api/documents/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (event) => {
      if (event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
  return res.data;
}

export async function listDocuments(): Promise<DocumentPublic[]> {
  const res = await api.get<DocumentPublic[]>("/api/documents");
  return res.data;
}

export async function getDocument(id: string): Promise<DocumentDetail> {
  const res = await api.get<DocumentDetail>(`/api/documents/${id}`);
  return res.data;
}

export function getDocumentFileUrl(id: string): string {
  return `http://localhost:8000/api/documents/${id}/file`;
}
