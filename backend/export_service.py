"""
STEP 11: Export service — shared logic that assembles notebook + exam
essentials data and renders it to Markdown or PDF (via reportlab).
"""
from __future__ import annotations

import io
import textwrap
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)

# ── Category ordering ────────────────────────────────────────────────────────
EXAM_CATEGORY_ORDER = ["definition", "formula", "unit", "rule", "example", "exception"]
EXAM_CATEGORY_LABELS = {
    "definition": "Definitions",
    "formula": "Formulas",
    "unit": "Units & Symbols",
    "rule": "Rules & Laws",
    "example": "Examples",
    "exception": "Exceptions & Caveats",
}


# ────────────────────────────────────────────────────────────────────────────
# Markdown generator
# ────────────────────────────────────────────────────────────────────────────

def build_markdown(
    doc_title: str,
    topics: list[dict],
    notebook_notes: list[dict],
    exam_essentials: dict[str, list[dict]],
) -> str:
    """
    Returns a UTF-8 Markdown string. Structure:
      # <title>
      > export timestamp

      ## My Notebook
      ### <topic title or "Unsorted Notes">
      - [page N] note text (edited marker if applicable)

      ## Exam Essentials
      ### Definitions
      - [page N] text
      ### Formulas
      ...
    """
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines: list[str] = [
        f"# {doc_title}",
        "",
        f"> Exported on {now}",
        "",
    ]

    # ── Notebook section ─────────────────────────────────────────────────────
    lines += ["## My Notebook", ""]

    if not notebook_notes:
        lines += ["> _No pinned or edited notes found._", ""]
    else:
        # Group notes by topic_id → topic title
        topic_map: dict[str | None, dict] = {None: {"title": "Unsorted Notes", "order_index": 9999}}
        for t in topics:
            topic_map[str(t["_id"])] = t

        grouped: dict[str | None, list[dict]] = {}
        for n in notebook_notes:
            tid = n.get("topic_id")
            grouped.setdefault(tid, []).append(n)

        # Sort groups by topic order
        sorted_keys = sorted(
            grouped.keys(),
            key=lambda k: topic_map.get(k, {}).get("order_index", 9999),
        )

        for tid in sorted_keys:
            group_notes = grouped[tid]
            topic_title = topic_map.get(tid, {}).get("title", "Unsorted Notes")
            lines += [f"### {topic_title}", ""]
            for n in group_notes:
                display_text = n.get("edited_text") or n["text"]
                pages = n.get("source_pages", [])
                page_str = f"p.{pages[0]}" if pages else ""
                is_edited = bool(n.get("edited_text"))
                edit_flag = " _(edited)_" if is_edited else ""
                is_pinned = n.get("is_pinned", False)
                pin_flag = " 📌" if is_pinned else ""
                lines.append(f"- [{page_str}] {display_text}{edit_flag}{pin_flag}")
                if is_edited:
                    orig = n["text"]
                    lines.append(f"  - _Original AI summary: {orig}_")
            lines.append("")

    # ── Exam Essentials section ───────────────────────────────────────────────
    lines += ["## Exam Essentials", ""]

    has_any = any(exam_essentials.get(cat) for cat in EXAM_CATEGORY_ORDER)
    if not has_any:
        lines += ["> _No exam essentials extracted yet._", ""]
    else:
        for cat in EXAM_CATEGORY_ORDER:
            items = exam_essentials.get(cat, [])
            if not items:
                continue
            label = EXAM_CATEGORY_LABELS[cat]
            lines += [f"### {label}", ""]
            for item in items:
                page = item.get("source_page", "?")
                text = item["text"]
                lines.append(f"- [p.{page}] {text}")
            lines.append("")

    return "\n".join(lines)


# ────────────────────────────────────────────────────────────────────────────
# PDF generator (reportlab)
# ────────────────────────────────────────────────────────────────────────────

def _safe(text: str) -> str:
    """Escape reportlab XML special chars."""
    return (
        text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
    )


def build_pdf(
    doc_title: str,
    topics: list[dict],
    notebook_notes: list[dict],
    exam_essentials: dict[str, list[dict]],
) -> bytes:
    """
    Returns raw PDF bytes built with reportlab Platypus.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title=doc_title,
        author="Traceable PDF Notes Platform",
    )

    ss = getSampleStyleSheet()

    # ── Custom styles ─────────────────────────────────────────────────────────
    h1 = ParagraphStyle(
        "H1",
        parent=ss["Heading1"],
        fontSize=20,
        spaceAfter=6,
        textColor=colors.HexColor("#1e293b"),
    )
    h2 = ParagraphStyle(
        "H2",
        parent=ss["Heading2"],
        fontSize=14,
        spaceBefore=14,
        spaceAfter=4,
        textColor=colors.HexColor("#334155"),
        borderPad=2,
    )
    h3 = ParagraphStyle(
        "H3",
        parent=ss["Heading3"],
        fontSize=11,
        spaceBefore=10,
        spaceAfter=3,
        textColor=colors.HexColor("#475569"),
    )
    normal = ParagraphStyle(
        "Body",
        parent=ss["Normal"],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#1e293b"),
    )
    meta_style = ParagraphStyle(
        "Meta",
        parent=ss["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#94a3b8"),
        spaceAfter=12,
    )
    orig_style = ParagraphStyle(
        "Orig",
        parent=ss["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#64748b"),
        leftIndent=12,
        fontName="Helvetica-Oblique",
    )
    badge_styles = {
        "definition": ParagraphStyle(
            "BadgeDef", parent=normal, textColor=colors.HexColor("#1d4ed8")
        ),
        "formula": ParagraphStyle(
            "BadgeForm", parent=normal, textColor=colors.HexColor("#7c3aed")
        ),
        "unit": ParagraphStyle(
            "BadgeUnit", parent=normal, textColor=colors.HexColor("#0f766e")
        ),
        "rule": ParagraphStyle(
            "BadgeRule", parent=normal, textColor=colors.HexColor("#b45309")
        ),
        "example": ParagraphStyle(
            "BadgeEx", parent=normal, textColor=colors.HexColor("#15803d")
        ),
        "exception": ParagraphStyle(
            "BadgeExcep", parent=normal, textColor=colors.HexColor("#b91c1c")
        ),
    }

    story: list = []
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # Title + timestamp
    story.append(Paragraph(_safe(doc_title), h1))
    story.append(Paragraph(f"Exported {now}", meta_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0")))
    story.append(Spacer(1, 6))

    # ── Notebook section ─────────────────────────────────────────────────────
    story.append(Paragraph("My Notebook", h2))

    if not notebook_notes:
        story.append(Paragraph("No pinned or edited notes found.", meta_style))
    else:
        topic_map: dict[str | None, dict] = {
            None: {"title": "Unsorted Notes", "order_index": 9999}
        }
        for t in topics:
            topic_map[str(t["_id"])] = t

        grouped: dict[str | None, list[dict]] = {}
        for n in notebook_notes:
            tid = n.get("topic_id")
            grouped.setdefault(tid, []).append(n)

        sorted_keys = sorted(
            grouped.keys(),
            key=lambda k: topic_map.get(k, {}).get("order_index", 9999),
        )

        for tid in sorted_keys:
            group_notes = grouped[tid]
            topic_title = topic_map.get(tid, {}).get("title", "Unsorted Notes")
            story.append(Paragraph(_safe(topic_title), h3))
            items_flowables = []
            for n in group_notes:
                display_text = n.get("edited_text") or n["text"]
                pages = n.get("source_pages", [])
                page_str = f"p.{pages[0]}" if pages else ""
                is_edited = bool(n.get("edited_text"))
                is_pinned = n.get("is_pinned", False)
                flags = []
                if is_edited:
                    flags.append("edited")
                if is_pinned:
                    flags.append("pinned")
                flag_str = f" [{', '.join(flags)}]" if flags else ""
                main_para = Paragraph(
                    f'<font color="#94a3b8">[{_safe(page_str)}]</font> '
                    f"{_safe(display_text)}"
                    f'<font color="#64748b">{_safe(flag_str)}</font>',
                    normal,
                )
                sub_items = [ListItem(main_para, leftIndent=12, value="bullet")]
                if is_edited:
                    orig_para = Paragraph(
                        f"Original AI summary: {_safe(n['text'])}", orig_style
                    )
                    sub_items.append(
                        ListItem(orig_para, leftIndent=24, value="bullet")
                    )
                for si in sub_items:
                    items_flowables.append(si)
            story.append(
                ListFlowable(
                    items_flowables,
                    bulletType="bullet",
                    leftIndent=6,
                    spaceAfter=4,
                )
            )

    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0")))

    # ── Exam Essentials section ───────────────────────────────────────────────
    story.append(Paragraph("Exam Essentials", h2))

    has_any = any(exam_essentials.get(cat) for cat in EXAM_CATEGORY_ORDER)
    if not has_any:
        story.append(Paragraph("No exam essentials extracted yet.", meta_style))
    else:
        for cat in EXAM_CATEGORY_ORDER:
            items = exam_essentials.get(cat, [])
            if not items:
                continue
            label = EXAM_CATEGORY_LABELS[cat]
            story.append(Paragraph(label, h3))
            badge_style = badge_styles.get(cat, normal)
            list_items = []
            for item in items:
                page = item.get("source_page", "?")
                text = item["text"]
                para = Paragraph(
                    f'<font color="#94a3b8">[p.{page}]</font> {_safe(text)}',
                    badge_style,
                )
                list_items.append(ListItem(para, leftIndent=12, value="bullet"))
            story.append(
                ListFlowable(
                    list_items,
                    bulletType="bullet",
                    leftIndent=6,
                    spaceAfter=4,
                )
            )

    doc.build(story)
    buf.seek(0)
    return buf.read()
