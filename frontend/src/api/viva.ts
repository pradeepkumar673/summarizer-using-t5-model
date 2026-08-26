import api from "./client";

export type Difficulty = "easy" | "medium" | "hard";

export type StartResponse = {
  session_id: string;
  question: string;
  difficulty: Difficulty;
  topic_title: string;
};

export type RubricScore = {
  conceptual_accuracy: number;
  completeness: number;
  clarity: number;
  use_of_examples: number;
  confidence: number;
};

export type AnswerResponse = {
  evaluation: RubricScore;
  overall_score: number;
  feedback: string;
  missing_keywords: string[];
  next_question: string | null;
  next_difficulty: Difficulty;
  source_page: number | null;
  source_paragraph_id: number | null;
  session_complete: boolean;
};

export type QARound = {
  question: string;
  difficulty: Difficulty;
  answer: string;
  evaluation: RubricScore;
  overall_score: number;
  feedback: string;
  missing_keywords: string[];
  next_question: string | null;
  source_page: number | null;
  source_paragraph_id: number | null;
};

export type SessionDetail = {
  id: string;
  document_id: string;
  topic_id: string;
  topic_title: string;
  status: string;
  current_difficulty: Difficulty;
  rounds: QARound[];
  created_at: string;
};

export type PastSession = {
  id: string;
  topic_title: string;
  status: string;
  rounds: number;
  created_at: string;
};

export async function startViva(
  documentId: string,
  topicId: string
): Promise<StartResponse> {
  const res = await api.post<StartResponse>("/api/viva/start", {
    document_id: documentId,
    topic_id: topicId,
  });
  return res.data;
}

export async function submitAnswer(
  sessionId: string,
  answer: string
): Promise<AnswerResponse> {
  const res = await api.post<AnswerResponse>(`/api/viva/${sessionId}/answer`, {
    answer,
  });
  return res.data;
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  const res = await api.get<SessionDetail>(`/api/viva/${sessionId}`);
  return res.data;
}

export async function listSessions(documentId: string): Promise<PastSession[]> {
  const res = await api.get<PastSession[]>(
    `/api/viva/document/${documentId}/sessions`
  );
  return res.data;
}
