from heading_detection import compute_body_font_baseline, is_heading


def segment_topics(chunks: list[dict]) -> list[dict]:
    """
    Groups cleaned, ordered chunks into topics anchored on detected headings.
    Each returned topic dict has: title, order_index, paragraph_ids (the
    unique chunk IDs it was built from, for traceability back to source
    page/bbox), page_range ([min_page, max_page]).

    Content appearing before the first detected heading is grouped under
    an "Introduction" topic rather than discarded.
    """
    if not chunks:
        return []

    baseline_font_size = compute_body_font_baseline(chunks)
    topics: list[dict] = []
    order_index = 0
    current_topic = {
        "title": "Introduction",
        "order_index": order_index,
        "paragraph_ids": [],
        "pages": [],
    }
    topics.append(current_topic)

    for chunk in chunks:
        if is_heading(chunk, baseline_font_size):
            if current_topic["paragraph_ids"]:
                # Current topic already has content -> start a fresh topic
                order_index += 1
                current_topic = {
                    "title": chunk["text"],
                    "order_index": order_index,
                    "paragraph_ids": [],
                    "pages": [],
                }
                topics.append(current_topic)
            else:
                # Current topic is still empty (e.g. very first block, or two
                # consecutive headings) -> just rename it instead of creating
                # an empty topic
                current_topic["title"] = chunk["text"]
            continue

        current_topic["paragraph_ids"].append(str(chunk["_id"]))
        current_topic["pages"].append(chunk["page_number"])

    final_topics = []
    for t in topics:
        if not t["paragraph_ids"]:
            continue  # drop topics that ended up with no body content
        final_topics.append(
            {
                "title": t["title"],
                "order_index": t["order_index"],
                "paragraph_ids": t["paragraph_ids"],
                "page_range": [min(t["pages"]), max(t["pages"])],
            }
        )
    return final_topics
