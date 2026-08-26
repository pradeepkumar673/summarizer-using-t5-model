"""
STEP 14: Knowledge-graph construction using NetworkX.

Builds nodes from:
  - Topics (Step 4)
  - ExamEssentials (Step 10): definitions, formulas, units, rules, examples, exceptions

Builds edges from real heuristics:
  - topic → exam_essential : if the essential's source_page falls within the
    topic's page_range, creating a "contains" edge.
  - topic → topic (consecutive): "leads_to" edges based on order_index.
  - exam_essential → exam_essential (same-page co-occurrence): "related"
    edges when two essentials from different categories share the same
    source_page (cross-category co-occurrence on a single page).

Every edge carries the source paragraph_id(s) that justify it.
"""
from __future__ import annotations

import logging
from typing import Any

import networkx as nx

logger = logging.getLogger(__name__)

# ── Node type prefixes ────────────────────────────────────────────────────────
TOPIC_PREFIX = "topic_"
ESSENTIAL_PREFIX = "ess_"

# ── Category colours (for the frontend) ───────────────────────────────────────
CATEGORY_COLOUR: dict[str, str] = {
    "topic": "#6366f1",       # indigo-500
    "definition": "#3b82f6",  # blue-500
    "formula": "#8b5cf6",     # violet-500
    "unit": "#14b8a6",        # teal-500
    "rule": "#f59e0b",        # amber-500
    "example": "#22c55e",     # green-500
    "exception": "#ef4444",   # red-500
}


def build_graph(
    topics: list[dict],
    exam_essentials: list[dict],
) -> dict[str, Any]:
    """
    Returns a serialized ``{"nodes": [...], "edges": [...]}`` dict suitable
    for storage in MongoDB and direct consumption by the frontend.
    """
    G = nx.DiGraph()

    # ── 1. Add Topic nodes ────────────────────────────────────────────────────
    sorted_topics = sorted(topics, key=lambda t: t.get("order_index", 0))
    for t in sorted_topics:
        tid = TOPIC_PREFIX + str(t["_id"])
        page_range = t.get("page_range", [0, 0])
        G.add_node(
            tid,
            label=t.get("title", "Untitled Topic"),
            node_type="topic",
            colour=CATEGORY_COLOUR["topic"],
            page_start=page_range[0] if page_range else 0,
            page_end=page_range[1] if len(page_range) > 1 else page_range[0],
            paragraph_ids=[str(pid) for pid in t.get("paragraph_ids", [])],
        )

    # ── 2. Add ExamEssential nodes ────────────────────────────────────────────
    for e in exam_essentials:
        eid = ESSENTIAL_PREFIX + str(e["_id"])
        cat = e.get("category", "definition")
        label = e.get("text", "")[:80]
        if len(e.get("text", "")) > 80:
            label += "…"
        G.add_node(
            eid,
            label=label,
            node_type=cat,
            colour=CATEGORY_COLOUR.get(cat, "#64748b"),
            source_page=e.get("source_page", 0),
            paragraph_ids=[],
        )

    # ── 3. Edges: topic → exam_essential ("contains") ─────────────────────────
    for t in sorted_topics:
        tid = TOPIC_PREFIX + str(t["_id"])
        page_range = t.get("page_range", [0, 0])
        p_start = page_range[0] if page_range else 0
        p_end = page_range[1] if len(page_range) > 1 else p_start

        for e in exam_essentials:
            sp = e.get("source_page", 0)
            if p_start <= sp <= p_end:
                eid = ESSENTIAL_PREFIX + str(e["_id"])
                edge_key = f"{tid}__contains__{eid}"
                # Source paragraph justification: the topic's paragraph_ids
                justifying = [str(pid) for pid in t.get("paragraph_ids", [])]
                G.add_edge(
                    tid,
                    eid,
                    edge_id=edge_key,
                    edge_type="contains",
                    label="contains",
                    source_paragraph_ids=justifying,
                    source_page=sp,
                )

    # ── 4. Edges: topic → topic ("leads_to" by order_index) ──────────────────
    for i in range(len(sorted_topics) - 1):
        t_curr = sorted_topics[i]
        t_next = sorted_topics[i + 1]
        tid_curr = TOPIC_PREFIX + str(t_curr["_id"])
        tid_next = TOPIC_PREFIX + str(t_next["_id"])
        # Justifying paragraphs: last paragraph(s) of current topic +
        # first paragraph(s) of next topic
        justifying = (
            [str(p) for p in t_curr.get("paragraph_ids", [])[-2:]]
            + [str(p) for p in t_next.get("paragraph_ids", [])[:2]]
        )
        G.add_edge(
            tid_curr,
            tid_next,
            edge_id=f"{tid_curr}__leads_to__{tid_next}",
            edge_type="leads_to",
            label="leads to",
            source_paragraph_ids=justifying,
            source_page=None,
        )

    # ── 5. Edges: cross-category same-page co-occurrence ("related") ──────────
    essentials_by_page: dict[int, list[dict]] = {}
    for e in exam_essentials:
        sp = e.get("source_page", 0)
        essentials_by_page.setdefault(sp, []).append(e)

    for page, items in essentials_by_page.items():
        if len(items) < 2:
            continue
        # Only connect items of DIFFERENT categories on the same page
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                if items[i].get("category") == items[j].get("category"):
                    continue
                eid_a = ESSENTIAL_PREFIX + str(items[i]["_id"])
                eid_b = ESSENTIAL_PREFIX + str(items[j]["_id"])
                edge_key = f"{eid_a}__related__{eid_b}"
                if not G.has_edge(eid_a, eid_b):
                    G.add_edge(
                        eid_a,
                        eid_b,
                        edge_id=edge_key,
                        edge_type="related",
                        label="related",
                        source_paragraph_ids=[],
                        source_page=page,
                    )

    # ── 6. Serialize ──────────────────────────────────────────────────────────
    nodes = []
    for nid, data in G.nodes(data=True):
        nodes.append({"id": nid, **data})

    edges = []
    for u, v, data in G.edges(data=True):
        edges.append({"source": u, "target": v, **data})

    logger.info(
        "[knowledge_graph] Built graph: %d nodes, %d edges",
        len(nodes),
        len(edges),
    )
    return {"nodes": nodes, "edges": edges}
