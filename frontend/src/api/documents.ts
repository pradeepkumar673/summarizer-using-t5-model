import api from "./client";

export type DocumentStatus =
  | "queued"
  | "extracting"
  | "segmenting"
  | "segmented"
  | "summarizing"
  | "hierarchy"
  | "embedding"
  | "exam_essentials"
  | "graph"
  | "ready"
  | "failed"
  | "processing";

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

export type NoteLevel = "paragraph" | "topic" | "page" | "chapter";

export type NotePublic = {
  id: string;
  document_id: string;
  level: NoteLevel;
  text: string;
  edited_text: string | null;
  is_pinned: boolean;
  user_id: string;
  topic_id: string | null;
  paragraph_id: number | null;
  source_chunk_ids: string[];
  source_pages: number[];
  source_bounding_boxes: BoundingBox[];
  created_at: string;
};

export type NoteUpdatePayload = {
  edited_text?: string | null;
  is_pinned?: boolean;
};

export type HierarchyResult = {
  topic: NotePublic[];
  page: NotePublic[];
  chapter: NotePublic[];
};

export type SearchSourceType = "chunk" | "note";

export type SearchResult = {
  source_type: SearchSourceType;
  chunk_id: string | null;
  note_id: string | null;
  note_level: NoteLevel | null;
  page_number: number;
  paragraph_id: number | null;
  text: string;
  bounding_box: BoundingBox | null;
  score: number;
};

export type ExamCategory =
  | "definition"
  | "formula"
  | "unit"
  | "rule"
  | "example"
  | "exception";

export type ExamEssential = {
  id: string;
  document_id: string;
  category: ExamCategory;
  text: string;
  source_page: number;
  source_bounding_box: BoundingBox | null;
  created_at: string;
};

export type ExamEssentialsResult = Record<ExamCategory, ExamEssential[]>;

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
  const token = localStorage.getItem("access_token");
  return `http://localhost:8000/api/documents/${id}/file${token ? `?token=${token}` : ""}`;
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

export async function summarizeHierarchy(id: string): Promise<HierarchyResult> {
  const res = await api.post<HierarchyResult>(`/api/documents/${id}/summarize/hierarchy`);
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

export async function getNotebook(id: string): Promise<NotePublic[]> {
  const res = await api.get<NotePublic[]>(`/api/documents/${id}/notebook`);
  return res.data;
}

export async function updateNote(
  noteId: string,
  payload: NoteUpdatePayload
): Promise<NotePublic> {
  const res = await api.patch<NotePublic>(`/api/notes/${noteId}`, payload);
  return res.data;
}

export async function deleteNote(noteId: string): Promise<void> {
  await api.delete(`/api/notes/${noteId}`);
}

export async function clearNotes(
  documentId: string,
  level: NoteLevel | "all" = "all"
): Promise<{ deleted_count: number }> {
  const res = await api.delete<{ deleted_count: number }>(
    `/api/documents/${documentId}/notes`,
    { params: { level } }
  );
  return res.data;
}


export async function searchKeyword(id: string, q: string): Promise<SearchResult[]> {
  const res = await api.get<SearchResult[]>(`/api/documents/${id}/search`, {
    params: { q },
  });
  return res.data;
}

export async function searchSemantic(
  id: string,
  q: string,
  topK = 8
): Promise<SearchResult[]> {
  const res = await api.get<SearchResult[]>(`/api/documents/${id}/search/semantic`, {
    params: { q, top_k: topK },
  });
  return res.data;
}

export async function generateExamEssentials(
  id: string
): Promise<ExamEssentialsResult> {
  const res = await api.post<ExamEssentialsResult>(
    `/api/documents/${id}/exam-essentials/generate`
  );
  return res.data;
}

export async function getExamEssentials(
  id: string
): Promise<ExamEssentialsResult> {
  const res = await api.get<ExamEssentialsResult>(
    `/api/documents/${id}/exam-essentials`
  );
  return res.data;
}

/** Returns the direct download URL for the Markdown export. */
export function getExportMarkdownUrl(id: string): string {
  const token = localStorage.getItem("access_token");
  return `http://localhost:8000/api/documents/${id}/export/markdown${token ? `?token=${token}` : ""}`;
}

/** Returns the direct download URL for the PDF export. */
export function getExportPdfUrl(id: string): string {
  const token = localStorage.getItem("access_token");
  return `http://localhost:8000/api/documents/${id}/export/pdf${token ? `?token=${token}` : ""}`;
}

export async function getDocumentStatus(id: string): Promise<{ status: string }> {
  const res = await api.get<{ status: string }>(`/api/documents/${id}/status`);
  return res.data;
}

export async function retryDocumentPipeline(id: string): Promise<{ status: string }> {
  const res = await api.post<{ status: string }>(`/api/documents/${id}/retry`);
  return res.data;
}


