/**
 * STEP 14 — Knowledge Graph page
 *
 * Renders the document's knowledge graph using @xyflow/react.
 * - Nodes: Topics (indigo) and ExamEssentials (colour-coded by category)
 * - Edges: "contains" (topic→essential), "leads_to" (topic→topic), "related" (essential↔essential)
 * - Click a node → fires focusSearchResult to highlight its source page in the PDF
 * - Click an edge → highlights the justifying paragraphs in the PDF
 *
 * Layout: Uses a simple layered layout where Topic nodes form a left column
 * and ExamEssential nodes fan out to the right, positioned by source_page.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import BookmarkTabs from "../components/sketch/BookmarkTabs";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  useNodesState,
  useEdgesState,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getDocument, type DocumentDetail } from "../api/documents";
import { generateGraph, getGraph, type GraphNode, type GraphEdge } from "../api/graph";
import { useWorkspaceStore } from "../store/workspaceStore";

// ── Layout constants ─────────────────────────────────────────────────────────
const TOPIC_X = 60;
const TOPIC_Y_GAP = 130;
const ESS_X_BASE = 360;
const ESS_X_GAP = 260;
const ESS_Y_GAP = 90;

// Category column offsets so essentials don't all pile on top of each other
const CAT_COL: Record<string, number> = {
  definition: 0,
  formula: 1,
  unit: 2,
  rule: 0,
  example: 1,
  exception: 2,
};

// ── Node width / height ──────────────────────────────────────────────────────
const TOPIC_W = 200;
const ESS_W = 220;

// ── Build ReactFlow nodes and edges from raw API data ────────────────────────
function buildFlowElements(
  rawNodes: GraphNode[],
  rawEdges: GraphEdge[]
): { nodes: Node[]; edges: Edge[] } {
  const topics = rawNodes.filter((n) => n.node_type === "topic");
  const essentials = rawNodes.filter((n) => n.node_type !== "topic");

  // Track y position per category column
  const colY: Record<number, number> = {};

  const flowNodes: Node[] = [];

  // Topic nodes – left column, evenly spaced
  topics.forEach((t, i) => {
    flowNodes.push({
      id: t.id,
      position: { x: TOPIC_X, y: 40 + i * TOPIC_Y_GAP },
      data: {
        label: t.label,
        rawNode: t,
      },
      style: {
        background: t.colour,
        color: "#fff",
        border: "3px solid #1c1b1b",
        borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 700,
        width: TOPIC_W,
        boxShadow: "3px 3px 0px #1c1b1b",
        fontFamily: "Bricolage Grotesque, sans-serif",
      },
      sourcePosition: "right" as any,
      targetPosition: "left" as any,
    });
  });

  // Essential nodes – multi-column layout to the right
  essentials.forEach((e) => {
    const col = CAT_COL[e.node_type] ?? 0;
    const currentY = colY[col] ?? 20;
    colY[col] = currentY + ESS_Y_GAP;

    const x = ESS_X_BASE + col * ESS_X_GAP;
    flowNodes.push({
      id: e.id,
      position: { x, y: currentY },
      data: { label: e.label, rawNode: e },
      style: {
        background: e.colour,
        color: "#fff",
        border: "2px solid #1c1b1b",
        borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
        padding: "6px 10px",
        fontSize: 11,
        width: ESS_W,
        boxShadow: "2px 2px 0px #1c1b1b",
        whiteSpace: "normal",
        wordBreak: "break-word",
        fontFamily: "Karla, sans-serif",
      },
      sourcePosition: "right" as any,
      targetPosition: "left" as any,
    });
  });

  // Edges
  const flowEdges: Edge[] = rawEdges.map((e, idx) => {
    const isLeadsTo = e.edge_type === "leads_to";
    const isRelated = e.edge_type === "related";
    return {
      id: e.edge_id ?? `edge-${idx}`,
      source: e.source,
      target: e.target,
      label: e.label,
      labelStyle: { fontSize: 10, fill: "#414751", fontFamily: "JetBrains Mono, monospace" },
      labelBgStyle: { fill: "#fcf9f8", fillOpacity: 0.9 },
      animated: isLeadsTo,
      type: isRelated ? "straight" : "smoothstep",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isLeadsTo ? "#005da7" : isRelated ? "#717783" : "#1c1b1b",
        width: 16,
        height: 16,
      },
      style: {
        stroke: isLeadsTo ? "#005da7" : isRelated ? "#717783" : "#1c1b1b",
        strokeWidth: isLeadsTo ? 2.5 : 1.5,
        strokeDasharray: isRelated ? "6,4" : isLeadsTo ? undefined : "3,3",
      },
      data: { rawEdge: e },
    };
  });

  return { nodes: flowNodes, edges: flowEdges };
}

// ── Legend component ─────────────────────────────────────────────────────────
const LEGEND_ITEMS: { colour: string; label: string }[] = [
  { colour: "#005da7", label: "Topic" },
  { colour: "#2976c7", label: "Definition" },
  { colour: "#835500", label: "Formula" },
  { colour: "#386800", label: "Unit" },
  { colour: "#feae2c", label: "Rule" },
  { colour: "#498300", label: "Example" },
  { colour: "#ba1a1a", label: "Exception" },
];

function Legend() {
  return (
    <div
      className="flex flex-wrap items-center gap-3 bg-surface px-4 py-2"
      style={{
        border: "2px solid #1c1b1b",
        borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
        boxShadow: "2px 2px 0px #1c1b1b",
      }}
    >
      {LEGEND_ITEMS.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-3.5 w-3.5"
            style={{
              background: item.colour,
              border: "1.5px solid #1c1b1b",
              borderRadius: "255px 5px 225px 5px / 5px 225px 5px 255px",
            }}
          />
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", color: "#1c1b1b", fontWeight: 700 }}>
            {item.label}
          </span>
        </span>
      ))}
      <span style={{ marginLeft: "8px", borderLeft: "1px solid #c1c7d3", paddingLeft: "8px", fontFamily: "JetBrains Mono, monospace", fontSize: "9px", color: "#414751" }}>
        ── contains | <span style={{ color: "#005da7" }}>⟶ leads to</span> | - - related
      </span>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function KnowledgeGraph() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<string | null>(null);

  const focusSearchResult = useWorkspaceStore((s) => s.focusSearchResult);

  // Load document + existing graph on mount
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [docDetail, graphData] = await Promise.all([
          getDocument(id!),
          getGraph(id!),
        ]);
        if (cancelled) return;
        setDoc(docDetail);
        const { nodes: fn, edges: fe } = buildFlowElements(
          graphData.nodes,
          graphData.edges
        );
        setNodes(fn);
        setEdges(fe);
      } catch (err) {
        if (!cancelled)
          setError(
            axios.isAxiosError(err)
              ? err.response?.data?.detail ?? "Failed to load."
              : "Failed to load."
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleGenerate() {
    if (!id) return;
    setGenerating(true);
    setError(null);
    try {
      const graphData = await generateGraph(id);
      const { nodes: fn, edges: fe } = buildFlowElements(
        graphData.nodes,
        graphData.edges
      );
      setNodes(fn);
      setEdges(fe);
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.detail ?? "Graph generation failed."
          : "Graph generation failed."
      );
    } finally {
      setGenerating(false);
    }
  }

  // Click on a node → focus corresponding source page in PDF
  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const rawNode = node.data?.rawNode as GraphNode | undefined;
      if (!rawNode) return;
      const page = rawNode.source_page ?? rawNode.page_start ?? 1;
      focusSearchResult({ page, box: null });
      setSelectedInfo(
        `Node: ${rawNode.label} | Type: ${rawNode.node_type} | Page: ${page}`
      );
    },
    [focusSearchResult]
  );

  // Click on an edge → focus the first justifying source page
  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_event, edge) => {
      const rawEdge = edge.data?.rawEdge as GraphEdge | undefined;
      if (!rawEdge) return;
      const page = rawEdge.source_page ?? 1;
      focusSearchResult({ page, box: null });
      setSelectedInfo(
        `Edge: "${rawEdge.label}" | Paragraphs: [${rawEdge.source_paragraph_ids.join(", ")}] | Page: ${page}`
      );
    },
    [focusSearchResult]
  );

  const totalNodes = nodes.length;
  const totalEdges = edges.length;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-checkered">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-primary animate-spin" style={{ animationDuration: "2s" }}>autorenew</span>
          <p className="mt-4" style={{ fontFamily: "Bricolage Grotesque, sans-serif", fontSize: "24px", color: "#414751" }}>Loading knowledge graph...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-surface">
      {/* ── Sketch Header ──────────────────────────────────────────────── */}
      <header className="shrink-0 bg-surface border-b-2 border-on-surface px-6 py-3 flex flex-wrap items-center justify-between gap-3 z-30">
        <div>
          <Link
            to={`/documents/${id}`}
            className="font-label-caps text-label-caps text-primary hover:underline"
            style={{ fontSize: "11px" }}
          >
            ← Back to workspace
          </Link>
          <h1 className="font-headline text-headline-sm mt-0.5">
            Knowledge Graph — {doc?.title ?? ""}
          </h1>
          <p className="font-mono text-source-code text-on-surface-variant">
            {totalNodes} nodes · {totalEdges} edges
            {totalNodes === 0 && " · click 'Build Graph' to generate"}
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="hand-drawn-border bg-white px-5 py-2 font-label-caps text-label-caps hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
        >
          {generating ? "Building..." : totalNodes === 0 ? "Build Graph" : "Rebuild Graph"}
        </button>
      </header>

      {error && (
        <div className="shrink-0 bg-error-container border-b-2 border-on-surface px-6 py-2 font-body text-body-md text-on-error-container">
          {error}
        </div>
      )}

      {selectedInfo && (
        <div className="shrink-0 bg-secondary-fixed/40 border-b-2 border-on-surface px-6 py-1.5 font-mono text-source-code text-on-surface-variant">
          ↗ {selectedInfo}
        </div>
      )}

      {/* ── Graph canvas — cream paper background ────────────────────── */}
      <div className="flex-1 relative">
        {totalNodes === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center bg-checkered">
            <span className="text-6xl">🕸️</span>
            <div className="bg-white hand-drawn-border shadow-sketch p-8 max-w-md">
              <p className="font-headline text-headline-sm mb-2">No graph yet</p>
              <p className="font-body text-body-md text-on-surface-variant">
                Click <strong>Build Graph</strong> to generate the knowledge graph from topics and exam essentials.
              </p>
              <p className="font-mono text-source-code text-on-surface-variant mt-2">
                Requires "Segment Topics" and "Extract Key Info" first.
              </p>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.2}
            maxZoom={2.5}
            colorMode="light"
            style={{ background: "#fcf9f8" }}
          >
            <Background color="#e5e2e1" gap={20} />
            <Controls />
            <MiniMap
              nodeColor={(node) =>
                (node.style?.background as string) ?? "#005da7"
              }
              maskColor="rgba(252,249,248,0.7)"
            />
            <Panel position="bottom-left">
              <Legend />
            </Panel>
          </ReactFlow>
        )}

        {/* BookmarkTabs */}
        {id && (
          <BookmarkTabs documentId={id} status={doc?.status} />
        )}
      </div>
    </div>
  );
}
