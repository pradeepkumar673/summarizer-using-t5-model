import fitz  # PyMuPDF


def extract_blocks_from_pdf(file_path: str) -> tuple[int, list[dict]]:
    """
    Opens a PDF and extracts real text blocks in reading order using
    PyMuPDF's structured dict extraction. Returns (total_pages, chunks).

    Each chunk dict has: page_number (1-indexed), paragraph_id (0-indexed
    per page), text, bounding_box (x0, y0, x1, y1) in PDF point coordinates.
    """
    doc = fitz.open(file_path)
    total_pages = doc.page_count
    chunks: list[dict] = []

    for page_index in range(total_pages):
        page = doc.load_page(page_index)
        page_dict = page.get_text("dict")
        paragraph_id = 0

        for block in page_dict.get("blocks", []):
            # block["type"] == 0 means a text block (1 = image block)
            if block.get("type") != 0:
                continue

            block_text_parts = []
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    span_text = span.get("text", "")
                    if span_text.strip():
                        block_text_parts.append(span_text)

            block_text = " ".join(block_text_parts).strip()
            if not block_text:
                continue

            x0, y0, x1, y1 = block["bbox"]

            chunks.append(
                {
                    "page_number": page_index + 1,
                    "paragraph_id": paragraph_id,
                    "text": block_text,
                    "bounding_box": {
                        "x0": round(x0, 2),
                        "y0": round(y0, 2),
                        "x1": round(x1, 2),
                        "y1": round(y1, 2),
                    },
                }
            )
            paragraph_id += 1

    doc.close()
    return total_pages, chunks
