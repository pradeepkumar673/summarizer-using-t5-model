/**
 * STEP 14 — Knowledge Graph page
 *
 * Renders the document's knowledge graph using @xyflow/react.
 * - Topic-Centric Layout: Each Topic forms a clean horizontal cluster with its child concept cards.
 * - Category-Coded Nodes: Definitions, Formulas, Units, Rules, Examples, Exceptions.
 * - Topic Filtering: Dropdown to isolate specific topics or view all cleanly.
 * - Interactive: Click node/edge → jumps to corresponding page in PDF.
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
const ESS_X_BASE = 360;
const ESS_W = 230;

// ── Build ReactFlow nodes and edges from raw API data ────────────────────────
function buildFlowElements(
  rawNodes: GraphNode[],
  rawEdges: GraphEdge[],
  selectedTopicFilter: string = "all"
): { nodes: Node[]; edges: Edge[] } {
  const allTopics = rawNodes.filter((n) => n.node_type === "topic");
  const allEssentials = rawNodes.filter((n) => n.node_type !== "topic");

  const topicChildrenMap: Record<string, GraphNode[]> = {};
  allTopics.forEach((t) => (topicChildrenMap[t.id] = []));
  const essentialParentMap: Record<string, string> = {};

  rawEdges.forEach((edge) => {
    if (edge.edge_type === "contains") {
      if (topicChildrenMap[edge.source]) {
        const essNode = allEssentials.find((e) => e.id === edge.target);
        if (essNode && !topicChildrenMap[edge.source].some((e) => e.id === essNode.id)) {
          topicChildrenMap[edge.source].push(essNode);
          essentialParentMap[essNode.id] = edge.source;
        }
      }
    }
  });

  // Map remaining unparented essentials by page proximity
  allEssentials.forEach((ess) => {
    if (!essentialParentMap[ess.id] && allTopics.length > 0) {
      const page = ess.page_start ?? ess.source_page ?? 1;
      let closestTopic = allTopics[0];
      let minDiff = Infinity;
      allTopics.forEach((t) => {
        const tPage = t.page_start ?? t.source_page ?? 1;
        const diff = Math.abs(page - tPage);
        if (diff < minDiff) {
          minDiff = diff;
          closestTopic = t;
        }
      });
      topicChildrenMap[closestTopic.id].push(ess);
      essentialParentMap[ess.id] = closestTopic.id;
    }
  });

  const filteredTopics = selectedTopicFilter === "all"
    ? allTopics
    : allTopics.filter((t) => t.id === selectedTopicFilter || t.label.toLowerCase().includes(selectedTopicFilter.toLowerCase()));

  const flowNodes: Node[] = [];
  const validNodeIds = new Set<string>();

  let currentY = 50;

  filteredTopics.forEach((topic) => {
    validNodeIds.add(topic.id);

    const children = topicChildrenMap[topic.id] || [];
    const numRows = Math.ceil(children.length / 2);
    const clusterHeight = Math.max(140, numRows * 105 + 30);

    // Parent Topic Node on the left
    flowNodes.push({
      id: topic.id,
      position: { x: TOPIC_X, y: currentY + Math.max(0, (clusterHeight - 80) / 2) },
      data: { label: topic.label, rawNode: topic },
      style: {
        background: topic.colour || "#005da7",
        color: "#ffffff",
        border: "3px solid #1c1b1b",
        borderRadius: "14px",
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        width: 240,
        boxShadow: "4px 4px 0px #1c1b1b",
        fontFamily: "Bricolage Grotesque, sans-serif",
      },
      sourcePosition: "right" as any,
      targetPosition: "left" as any,
    });

    // Child Essential Nodes in structured 2-column grid to the right
    children.forEach((child, idx) => {
      validNodeIds.add(child.id);
      const col = idx % 2;
      const row = Math.floor(idx / 2);

      const childX = ESS_X_BASE + col * (ESS_W + 35);
      const childY = currentY + row * 105;

      flowNodes.push({
        id: child.id,
        position: { x: childX, y: childY },
        data: { label: child.label, rawNode: child },
        style: {
          background: child.colour || "#ffffff",
          color: "#ffffff",
          border: "2px solid #1c1b1b",
          borderRadius: "10px",
          padding: "8px 12px",
          fontSize: 11,
          fontWeight: 600,
          width: ESS_W,
          boxShadow: "3px 3px 0px #1c1b1b",
          whiteSpace: "normal",
          wordBreak: "break-word",
          fontFamily: "Karla, sans-serif",
        },
        sourcePosition: "right" as any,
        targetPosition: "left" as any,
      });
    });

    currentY += clusterHeight + 70; // 70px separation between topic clusters
  });

  const flowEdges: Edge[] = rawEdges
    .filter((e) => validNodeIds.has(e.source) && validNodeIds.has(e.target))
    .map((e, idx) => {
      const isLeadsTo = e.edge_type === "leads_to";
      const isRelated = e.edge_type === "related";
      return {
        id: e.edge_id ?? `edge-${idx}`,
        source: e.source,
        target: e.target,
        label: e.label,
        labelStyle: { fontSize: 10, fill: "#414751", fontWeight: 600, fontFamily: "JetBrains Mono, monospace" },
        labelBgStyle: { fill: "#fcf9f8", fillOpacity: 0.95 },
        animated: isLeadsTo,
        type: isRelated ? "straight" : "bezier",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isLeadsTo ? "#005da7" : isRelated ? "#717783" : "#1c1b1b",
          width: 14,
          height: 14,
        },
        style: {
          stroke: isLeadsTo ? "#005da7" : isRelated ? "#717783" : "#1c1b1b",
          strokeWidth: isLeadsTo ? 2.5 : 1.5,
          strokeDasharray: isRelated ? "6,4" : undefined,
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
  const [rawGraphData, setRawGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<string | null>(null);
  const [topicFilter, setTopicFilter] = useState<string>("all");

  const focusSearchResult = useWorkspaceStore((s) => s.focusSearchResult);

  // Re-build layout whenever topicFilter or rawGraphData changes
  useEffect(() => {
    if (rawGraphData.nodes.length > 0) {
      const { nodes: fn, edges: fe } = buildFlowElements(
        rawGraphData.nodes,
        rawGraphData.edges,
        topicFilter
      );
      setNodes(fn);
      setEdges(fe);
    }
  }, [topicFilter, rawGraphData, setNodes, setEdges]);

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
        setRawGraphData(graphData);
      } catch (err) {
        if (!cancelled)
          setError(
            axios.isAxiosError(err)
              ? err.response?.data?.detail ?? "Failed to load graph."
              : "Failed to load graph."
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
      setRawGraphData(graphData);
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

  const topicsList = rawGraphData.nodes.filter((n) => n.node_type === "topic");
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
            Showing {totalNodes} nodes ({totalEdges} connections)
          </p>
        </div>

        {/* Filter & Action Controls */}
        <div className="flex items-center gap-3">
          {topicsList.length > 0 && (
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 border-2 border-on-surface rounded-lg shadow-sketch-sm">
              <span className="font-label-caps text-xs text-on-surface-variant font-bold">Filter Topic:</span>
              <select
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                className="bg-transparent font-mono text-xs text-on-surface outline-none cursor-pointer font-semibold"
              >
                <option value="all">🌟 All Topics ({topicsList.length})</option>
                {topicsList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="hand-drawn-border bg-white px-5 py-2 font-label-caps text-label-caps hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            {generating ? "Building..." : rawGraphData.nodes.length === 0 ? "Build Graph" : "Rebuild Graph"}
          </button>
        </div>
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
        {rawGraphData.nodes.length === 0 ? (
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
            fitViewOptions={{ padding: 0.2 }}
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
