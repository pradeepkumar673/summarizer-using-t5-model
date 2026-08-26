import api from "./client";

export type EventType =
  | "reread"
  | "note_click"
  | "doubt_asked"
  | "manual_highlight"
  | "quiz_wrong"
  | "time_spent";

export type HeatLevel = "none" | "yellow" | "orange" | "red";

/** Heat level -> paragraph_id (string keys). */
export type HeatmapResult = Record<string, HeatLevel>;

/**
 * Fire-and-forget: log a user interaction.
 * Errors are silently suppressed so they never disrupt UX.
 */
export function logActivity(
  documentId: string,
  paragraphId: number,
  eventType: EventType,
  value = 1.0
): void {
  api
    .post("/api/activity/log", {
      document_id: documentId,
      paragraph_id: paragraphId,
      event_type: eventType,
      value,
    })
    .catch(() => {
      /* intentionally silent */
    });
}

export async function getHeatmap(documentId: string): Promise<HeatmapResult> {
  const res = await api.get<HeatmapResult>(
    `/api/documents/${documentId}/heatmap`
  );
  return res.data;
}
