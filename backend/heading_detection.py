import re
import statistics

NUMBERED_HEADING_PATTERN = re.compile(r"^(\d+(\.\d+)*)[\.\)]?\s+\S")
CHAPTER_SECTION_PATTERN = re.compile(r"^(chapter|section|unit|part)\s+\d+", re.IGNORECASE)

FONT_SIZE_HEADING_RATIO = 1.15  # heading font must be >=15% larger than body baseline
MAX_HEADING_WORDS = 15


def compute_body_font_baseline(chunks: list[dict]) -> float | None:
    """Median font size across all blocks approximates normal body text size."""
    sizes = [c["avg_font_size"] for c in chunks if c.get("avg_font_size")]
    if not sizes:
        return None
    return statistics.median(sizes)


def is_heading(chunk: dict, baseline_font_size: float | None) -> bool:
    text = chunk["text"].strip()
    word_count = len(text.split())

    if word_count == 0 or word_count > MAX_HEADING_WORDS:
        return False

    # Font-based heuristics (real PyMuPDF span data, when available)
    if baseline_font_size and chunk.get("avg_font_size"):
        if chunk["avg_font_size"] >= baseline_font_size * FONT_SIZE_HEADING_RATIO:
            return True
        if chunk.get("is_bold") and chunk["avg_font_size"] >= baseline_font_size:
            return True

    # Text-pattern fallback heuristics (used when font metadata is missing,
    # e.g. for documents uploaded before font capture was added)
    if NUMBERED_HEADING_PATTERN.match(text):
        return True

    if CHAPTER_SECTION_PATTERN.match(text):
        return True

    if text.isupper() and word_count <= 10 and len(text) > 2:
        return True

    return False
