"""
STEP 6: hierarchical roll-up of Notes.

    paragraph (Step 5)  -->  topic  -->  page  -->  chapter

Each level concatenates its children's summary text and re-summarizes with
T5 via summarize_long_text (which chunks + batches instead of truncating
when the concatenated text exceeds the model's input window). Every
resulting Note keeps the FULL list of source paragraphs/pages/bounding
boxes it was built from, for traceability.
"""

import logging
from collections import defaultdict
from datetime import datetime, timezone

from summarization_service import summarize_long_text

logger = logging.getLogger(__name__)


def _merge_bounding_boxes(notes: list[dict]) -> list[dict]:
    return [bb for n in notes for bb in n["source_bounding_boxes"]]


def _merge_chunk_ids(notes: list[dict]) -> list[str]:
    """Union of source_chunk_ids across notes, de-duplicated, order preserved."""
    seen: list[str] = []
    seen_set: set[str] = set()
    for n in notes:
        for cid in n["source_chunk_ids"]:
            if cid not in seen_set:
                seen_set.add(cid)
                seen.append(cid)
    return seen


def _merge_pages(notes: list[dict]) -> list[int]:
    pages: set[int] = set()
    for n in notes:
        pages.update(n["source_pages"])
    return sorted(pages)


async def build_topic_notes(db, document_id: str) -> list[dict]:
    """
    For each Topic, concatenates its child paragraph-level Notes' text and
    summarizes with T5 to produce one topic-level Note. Traces back to EVERY
    contributing paragraph (source_chunk_ids / source_pages / bounding boxes
    are all unions across the whole topic, not just the first paragraph).
    """
    topics = await db.topics.find({"document_id": document_id}).sort("order_index", 1).to_list(None)
    if not topics:
        return []

    paragraph_notes = await db.notes.find(
        {"document_id": document_id, "level": "paragraph"}
    ).to_list(None)

    notes_by_topic: dict[str, list[dict]] = defaultdict(list)
    for n in paragraph_notes:
        if n.get("topic_id"):
            notes_by_topic[n["topic_id"]].append(n)

    topic_docs = []
    for topic in topics:
        topic_id = str(topic["_id"])
        child_notes = notes_by_topic.get(topic_id, [])
        if not child_notes:
            logger.warning(
                "build_topic_notes: topic %s ('%s') has no paragraph-level notes "
                "yet -- run POST /summarize first. Skipping this topic.",
                topic_id, topic.get("title"),
            )
            continue

        child_notes.sort(key=lambda n: (n["source_pages"][0], n.get("paragraph_id") or 0))
        combined_text = " ".join(n["text"] for n in child_notes)

        summary = summarize_long_text(combined_text, max_length=100, min_length=20)

        topic_docs.append(
            {
                "document_id": document_id,
                "level": "topic",
                "text": summary,
                "topic_id": topic_id,
                "paragraph_id": None,
                "source_chunk_ids": _merge_chunk_ids(child_notes),
                "source_pages": _merge_pages(child_notes),
                "source_bounding_boxes": _merge_bounding_boxes(child_notes),
                "created_at": datetime.now(timezone.utc),
            }
        )
    return topic_docs


async def build_page_notes(db, document_id: str) -> list[dict]:
    """
    Groups topic-level Notes by the page range of their parent Topic to
    produce one page-level Note per page that has topic content on it.
    The summarized TEXT for a page comes from every topic note that
    overlaps that page (per spec); the traceability fields (source_chunk_ids
    / bounding boxes) are drawn specifically from paragraph-level notes that
    fall on that exact page, so a page note never claims a source outside
    the page it represents.
    """
    topic_notes = await db.notes.find({"document_id": document_id, "level": "topic"}).to_list(None)
    if not topic_notes:
        return []

    topics = await db.topics.find({"document_id": document_id}).to_list(None)
    topics_by_id = {str(t["_id"]): t for t in topics}

    paragraph_notes = await db.notes.find(
        {"document_id": document_id, "level": "paragraph"}
    ).to_list(None)

    page_map: dict[int, list[dict]] = defaultdict(list)
    for note in topic_notes:
        topic = topics_by_id.get(note["topic_id"])
        if not topic:
            continue
        lo, hi = topic["page_range"]
        for page_number in range(lo, hi + 1):
            page_map[page_number].append(note)

    page_docs = []
    for page_number in sorted(page_map):
        contributing = page_map[page_number]
        combined_text = " ".join(n["text"] for n in contributing)
        summary = summarize_long_text(combined_text, max_length=100, min_length=20)

        page_paragraph_notes = [n for n in paragraph_notes if page_number in n["source_pages"]]

        page_docs.append(
            {
                "document_id": document_id,
                "level": "page",
                "text": summary,
                "topic_id": None,
                "paragraph_id": None,
                "source_chunk_ids": _merge_chunk_ids(page_paragraph_notes),
                "source_pages": [page_number],
                "source_bounding_boxes": _merge_bounding_boxes(page_paragraph_notes),
                "created_at": datetime.now(timezone.utc),
            }
        )
    return page_docs


async def build_chapter_note(db, document_id: str) -> dict | None:
    """Groups ALL page-level Notes for the document into one chapter-level Note."""
    page_notes = await db.notes.find({"document_id": document_id, "level": "page"}).to_list(None)
    if not page_notes:
        return None

    page_notes.sort(key=lambda n: n["source_pages"][0])
    combined_text = " ".join(n["text"] for n in page_notes)
    summary = summarize_long_text(combined_text, max_length=130, min_length=30)

    return {
        "document_id": document_id,
        "level": "chapter",
        "text": summary,
        "topic_id": None,
        "paragraph_id": None,
        "source_chunk_ids": _merge_chunk_ids(page_notes),
        "source_pages": _merge_pages(page_notes),
        "source_bounding_boxes": _merge_bounding_boxes(page_notes),
        "created_at": datetime.now(timezone.utc),
    }
