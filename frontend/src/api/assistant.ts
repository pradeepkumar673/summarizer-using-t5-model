import api from "./client";

export type AssistantSource = {
  chunk_id: string;
  page_number: number;
  paragraph_id: number;
  score: number;
  text: string;
};

export type AskResponse = {
  answer: string;
  sources: AssistantSource[];
  message_id: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: AssistantSource[];
  created_at: string;
};

export async function askAssistant(
  documentId: string,
  question: string
): Promise<AskResponse> {
  const res = await api.post<AskResponse>(
    `/api/documents/${documentId}/assistant`,
    { question }
  );
  return res.data;
}

export async function getAssistantHistory(
  documentId: string
): Promise<ChatMessage[]> {
  const res = await api.get<ChatMessage[]>(
    `/api/documents/${documentId}/assistant/history`
  );
  return res.data;
}
