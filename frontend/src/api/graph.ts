import api from "./client";

export type GraphNodeType =
  | "topic"
  | "definition"
  | "formula"
  | "unit"
  | "rule"
  | "example"
  | "exception";

export type GraphNode = {
  id: string;
  label: string;
  node_type: GraphNodeType;
  colour: string;
  source_page?: number;
  page_start?: number;
  page_end?: number;
  paragraph_ids: string[];
};

export type GraphEdge = {
  source: string;
  target: string;
  edge_id: string;
  edge_type: "contains" | "leads_to" | "related";
  label: string;
  source_paragraph_ids: string[];
  source_page: number | null;
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export async function generateGraph(documentId: string): Promise<GraphData> {
  const res = await api.post<GraphData>(
    `/api/documents/${documentId}/graph/generate`
  );
  return res.data;
}

export async function getGraph(documentId: string): Promise<GraphData> {
  const res = await api.get<GraphData>(
    `/api/documents/${documentId}/graph`
  );
  return res.data;
}
