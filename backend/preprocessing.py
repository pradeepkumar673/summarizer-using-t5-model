import re
import statistics
from collections import defaultdict
import spacy

PAGE_NUMBER_PATTERN = re.compile(
    r"^\s*(page\s+)?\d+(\s*/\s*\d+)?(\s+of\s+\d+)?\s*$", re.IGNORECASE
)

_nlp = None


def get_nlp():
    """Lazily loads en_core_web_sm once per process (expensive to load)."""
    global _nlp
    if _nlp is None:
        _nlp = spacy.load("en_core_web_sm", disable=["ner", "lemmatizer"])
    return _nlp


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def is_page_number_noise(text: str) -> bool:
    return bool(PAGE_NUMBER_PATTERN.match(text.strip()))


def detect_repeated_header_footer_texts(chunks: list[dict], min_page_repeats: int = 3) -> set[str]:
    """
    Finds short block texts that repeat verbatim across many distinct pages –
    a strong signal of running headers/footers rather than real content.
    """
    pages_by_text: dict[str, set[int]] = defaultdict(set)
    for c in chunks:
        norm = normalize_whitespace(c["text"]).lower()
        if not norm or len(norm) > 80:
            continue  # headers/footers are typically short
        pages_by_text[norm].add(c["page_number"])

    return {text for text, pages in pages_by_text.items() if len(pages) >= min_page_repeats}


def clean_chunks(chunks: list[dict]) -> list[dict]:
    """
    Removes page-number noise and repeated header/footer blocks, normalizes
    whitespace. Preserves every other field (page_number, paragraph_id,
    bounding_box, avg_font_size, is_bold, _id) unchanged for traceability.
    """
    noise_texts = detect_repeated_header_footer_texts(chunks)
    cleaned = []

    for c in chunks:
        norm = normalize_whitespace(c["text"])
        if not norm:
            continue
        if is_page_number_noise(norm):
            continue
        if norm.lower() in noise_texts:
            continue

        cleaned_chunk = dict(c)
        cleaned_chunk["text"] = norm
        cleaned.append(cleaned_chunk)

    return cleaned


def split_into_sentences(text: str) -> list[str]:
    """Real spaCy sentence segmentation (dependency-parse-based boundaries)."""
    nlp = get_nlp()
    doc = nlp(text)
    return [sent.text.strip() for sent in doc.sents if sent.text.strip()]
