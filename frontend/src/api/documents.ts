import api from "./client";

export type DocumentStatus = "processing" | "ready" | "segmented" | "failed";

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
  avg_font_size: number | null;
  is_bold: boolean;
};

export type DocumentDetail = DocumentPublic & {
  chunks: ChunkPublic[];
};

export type TopicPublic = {
  id: string;
  document_id: string;
  title: string;
  order_index: number;
  paragraph_ids: string[];
  page_range: [number, number];
};

export type NoteLevel = "paragraph";

export type NotePublic = {
  id: string;
  document_id: string;
  topic_id: string | null;
  paragraph_id: number;
  level: NoteLevel;
  text: string;
  source_page: number;
  source_bounding_box: BoundingBox;
  created_at: string;
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

export async function processDocument(id: string): Promise<TopicPublic[]> {
  const res = await api.post<TopicPublic[]>(`/api/documents/${id}/process`);
  return res.data;
}

export async function getTopics(id: string): Promise<TopicPublic[]> {
  const res = await api.get<TopicPublic[]>(`/api/documents/${id}/topics`);
  return res.data;
}

export async function summarizeDocument(id: string): Promise<NotePublic[]> {
  const res = await api.post<NotePublic[]>(`/api/documents/${id}/summarize`);
  return res.data;
}

export async function getNotes(
  id: string,
  level: NoteLevel = "paragraph"
): Promise<NotePublic[]> {
  const res = await api.get<NotePublic[]>(`/api/documents/${id}/notes`, {
    params: { level },
  });
  return res.data;
}
