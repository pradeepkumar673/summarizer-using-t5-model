"""
STEP 10: Key-Information Extractor using spaCy Matcher / PhraseMatcher.

Detects in each document chunk:
  - definitions : "X is (defined as|defined to be|referred to as|known as|
                   called|means|denotes) Y"
  - formulas    : mathematical expressions using regex (equations, variables,
                  subscripts, operators)
  - units       : SI and common measurement unit phrases
  - rules       : phrases that encode rules / laws / theorems / principles
  - examples    : phrases introduced as examples/illustrations
  - exceptions  : exception / unless / however / caveat phrases

The extractor is intentionally loaded ONCE per process (lazy singleton) so
it does not block startup. Call extract_from_chunks(chunks) from a router.
"""

import re
import logging
from typing import Literal

import spacy
from spacy.matcher import Matcher, PhraseMatcher

logger = logging.getLogger(__name__)

ExamCategory = Literal["definition", "formula", "unit", "rule", "example", "exception"]

# ────────────────────────────────────────────────────────────────────────────
# Lazy singleton
# ────────────────────────────────────────────────────────────────────────────
_nlp: spacy.language.Language | None = None
_matcher: Matcher | None = None
_phrase_matcher: PhraseMatcher | None = None


def _get_nlp():
    global _nlp, _matcher, _phrase_matcher
    if _nlp is not None:
        return _nlp, _matcher, _phrase_matcher

    logger.info("[key_info] Loading spaCy model for key-info extraction…")
    _nlp = spacy.load("en_core_web_sm", disable=["ner", "parser"])
    _nlp.enable_pipe("senter")  # sentence boundaries without full dependency parser

    nlp = _nlp

    # ── Token-pattern Matcher ────────────────────────────────────────────────
    m = Matcher(nlp.vocab)

    # DEFINITION patterns:
    #   "<NOUN/PROPN> is defined as …"
    #   "<NOUN/PROPN> is referred to as …"
    #   "<NOUN/PROPN> is known as …"
    #   "<NOUN/PROPN> is called …"
    #   "<NOUN/PROPN> means …"
    #   "<NOUN/PROPN> denotes …"
    #   "<NOUN/PROPN> refers to …"
    def_trigger_words = [
        ["is", "defined", "as"],
        ["is", "defined", "to", "be"],
        ["is", "referred", "to", "as"],
        ["is", "known", "as"],
        ["is", "also", "known", "as"],
        ["is", "called"],
        ["means"],
        ["denotes"],
        ["refers", "to"],
        ["is", "the", "term", "for"],
        ["is", "an", "example", "of"],
    ]
    for trigger in def_trigger_words:
        pattern = [{"POS": {"IN": ["NOUN", "PROPN", "ADJ"]}, "OP": "+"}]
        pattern += [{"LOWER": w} for w in trigger]
        m.add("DEFINITION", [pattern])

    # RULE patterns: law / theorem / principle / property / corollary / lemma
    rule_trigger_words = [
        "law", "theorem", "principle", "property", "corollary",
        "lemma", "postulate", "axiom", "rule", "constraint",
        "must", "shall", "always", "never",
    ]
    for w in rule_trigger_words:
        m.add("RULE", [[{"LOWER": w}]])

    # EXAMPLE patterns: "for example", "for instance", "e.g.", "such as", "i.e."
    example_triggers = [
        [{"LOWER": "for"}, {"LOWER": "example"}],
        [{"LOWER": "for"}, {"LOWER": "instance"}],
        [{"LOWER": "e.g"}, {"IS_PUNCT": True, "OP": "?"}],
        [{"LOWER": "such"}, {"LOWER": "as"}],
        [{"LOWER": "i.e"}, {"IS_PUNCT": True, "OP": "?"}],
        [{"LOWER": "as"}, {"LOWER": "an"}, {"LOWER": "example"}],
        [{"LOWER": "as"}, {"LOWER": "an"}, {"LOWER": "illustration"}],
        [{"LOWER": "consider"}, {"POS": "DET", "OP": "?"}],
    ]
    for p in example_triggers:
        m.add("EXAMPLE", [p])

    # EXCEPTION patterns: "however", "except", "unless", "but", "although"
    exception_triggers = [
        [{"LOWER": "however"}],
        [{"LOWER": "except"}],
        [{"LOWER": "except", "OP": "?"}, {"LOWER": "when"}],
        [{"LOWER": "unless"}],
        [{"LOWER": "although"}],
        [{"LOWER": "nevertheless"}],
        [{"LOWER": "on"}, {"LOWER": "the"}, {"LOWER": "other"}, {"LOWER": "hand"}],
        [{"LOWER": "but"}, {"LOWER": "not"}],
        [{"LOWER": "provided"}, {"LOWER": "that"}],
        [{"LOWER": "not"}, {"LOWER": "applicable"}],
        [{"LOWER": "caveat"}],
        [{"LOWER": "limitation"}],
    ]
    for p in exception_triggers:
        m.add("EXCEPTION", [p])

    _matcher = m

    # ── PhraseMatcher for UNIT phrases ───────────────────────────────────────
    pm = PhraseMatcher(nlp.vocab, attr="LOWER")
    unit_phrases = [
        # SI base units
        "meter", "metres", "metre", "meters",
        "kilogram", "kilograms", "gram", "grams",
        "second", "seconds",
        "ampere", "amperes",
        "kelvin",
        "mole", "moles",
        "candela",
        # derived units
        "newton", "newtons", "joule", "joules", "watt", "watts",
        "pascal", "pascals", "hertz", "volt", "volts",
        "ohm", "ohms", "farad", "farads", "henry", "henries",
        "tesla", "teslas", "coulomb", "coulombs",
        "liter", "liters", "litre", "litres",
        "meter per second", "meters per second",
        "kilometer per hour", "kilometres per hour",
        "kilowatt hour", "kilowatt hours",
        # imperial
        "inch", "inches", "foot", "feet", "yard", "yards",
        "mile", "miles", "pound", "pounds", "ounce", "ounces",
        "gallon", "gallons",
        # metric prefixes common combos
        "millimeter", "millimeters", "centimeter", "centimeters",
        "kilometer", "kilometers", "micrometer", "micrometers",
        "nanometer", "nanometers", "millisecond", "milliseconds",
        "microsecond", "microseconds", "nanosecond", "nanoseconds",
        "milliamp", "milliamps", "millivolt", "millivolts",
        "kilowatt", "kilowatts", "megawatt", "megawatts",
        "megahertz", "gigahertz",
        # data units
        "bit", "bits", "byte", "bytes", "kilobyte", "kilobytes",
        "megabyte", "megabytes", "gigabyte", "gigabytes",
        "terabyte", "terabytes",
    ]
    patterns = list(nlp.pipe(unit_phrases))
    pm.add("UNIT", patterns)
    _phrase_matcher = pm

    logger.info("[key_info] spaCy extractor ready.")
    return _nlp, _matcher, _phrase_matcher


# ────────────────────────────────────────────────────────────────────────────
# Regex helpers
# ────────────────────────────────────────────────────────────────────────────

# Formula detection: looks for strings with mathematical operators/symbols
FORMULA_PATTERN = re.compile(
    r"""
    (?:
        # Equation with = or ≡ or ≈ or ∝
        [A-Za-zα-ωΑ-Ω0-9_\(\)\[\]\.]+          # LHS variable/expression
        \s*(?:=|≡|≈|∝|:=|≤|≥|<|>|∈|⊆|⊂)\s*   # operator
        [A-Za-zα-ωΑ-Ω0-9_\(\)\[\]\+\-\*/\^\.\,\s]+  # RHS
    )
    |
    (?:
        # Subscript/superscript patterns like "F_net", "v^2", "m_1 + m_2"
        [A-Za-z][A-Za-zα-ωΑ-Ω]*[_\^][0-9A-Za-z]+
        (?:\s*[\+\-\*\/]\s*[A-Za-z][A-Za-zα-ωΑ-Ω]*[_\^][0-9A-Za-z]+)*
    )
    |
    (?:
        # Greek letter variable expressions: λ = 2πr, Δx, Σ, ∫, ∂
        [λμσπτφψωΔΣΩ∫∂∇][A-Za-z0-9_\s\+\-\*\/\^\(\)=]*
    )
    |
    (?:
        # Fraction-like expressions: "a / b", "N/m^2"
        [A-Za-z0-9_]+\s*/\s*[A-Za-z0-9_\^]+
    )
    """,
    re.VERBOSE,
)

# Numbered / bulleted list item: line starting with 1. 2. / (a) (b) / • – ·
LIST_LINE_PATTERN = re.compile(
    r"""
    (?:
        ^\s*\d+[\.\)]\s+          # 1. or 1)
        | ^\s*[a-z][\.\)]\s+      # a. or a)
        | ^\s*[ivxIVX]+[\.\)]\s+  # roman numerals
        | ^\s*[•\-–—·]\s+         # bullet symbols
    )
    """,
    re.VERBOSE | re.MULTILINE,
)


def _is_formula_sentence(text: str) -> bool:
    """True if the text looks like it encodes a mathematical relationship."""
    # Must have at least one alphabetic char plus an operator / symbol
    if not re.search(r"[A-Za-zα-ωΑ-Ω]", text):
        return False
    return bool(FORMULA_PATTERN.search(text))


def _list_items(text: str) -> list[str]:
    """Extract individual bullet/numbered items from a chunk of text."""
    items = []
    # Split on list markers
    parts = LIST_LINE_PATTERN.split(text)
    for part in parts:
        part = part.strip()
        if len(part.split()) >= 3:
            items.append(part)
    return items


# ────────────────────────────────────────────────────────────────────────────
# Main extractor
# ────────────────────────────────────────────────────────────────────────────

def extract_from_chunks(chunks: list[dict]) -> list[dict]:
    """
    Accepts a list of chunk dicts (each with _id, text, page_number,
    bounding_box, paragraph_id).

    Returns a list of raw ExamEssential dicts (without _id / document_id,
    to be added by the router).
    """
    nlp, matcher, phrase_matcher = _get_nlp()

    results: list[dict] = []

    for chunk in chunks:
        text: str = (chunk.get("text") or "").strip()
        if not text:
            continue

        page: int = chunk.get("page_number", 0)
        bbox: dict = chunk.get("bounding_box", {})

        def _entry(category: str, entry_text: str) -> dict:
            entry_text = entry_text.strip()
            if not entry_text:
                return {}
            return {
                "category": category,
                "text": entry_text,
                "source_page": page,
                "source_bounding_box": bbox,
            }

        doc = nlp(text)

        # ── Sentence-level matcher hits ───────────────────────────────────
        # Map span start → sentence for quick lookup
        sent_map: dict[int, str] = {}
        for sent in doc.sents:
            for tok in sent:
                sent_map[tok.i] = sent.text.strip()

        seen_sents: set[str] = set()

        token_matches = matcher(doc)
        for match_id, start, _end in token_matches:
            label = nlp.vocab.strings[match_id]
            sent_text = sent_map.get(start, "")
            if sent_text and sent_text not in seen_sents:
                seen_sents.add(sent_text)
                if label == "DEFINITION":
                    e = _entry("definition", sent_text)
                elif label == "RULE":
                    e = _entry("rule", sent_text)
                elif label == "EXAMPLE":
                    e = _entry("example", sent_text)
                elif label == "EXCEPTION":
                    e = _entry("exception", sent_text)
                else:
                    continue
                if e:
                    results.append(e)

        # ── PhraseMatcher UNIT hits ────────────────────────────────────────
        phrase_matches = phrase_matcher(doc)
        unit_seen_sents: set[str] = set()
        for _match_id, start, _end in phrase_matches:
            sent_text = sent_map.get(start, "")
            if sent_text and sent_text not in unit_seen_sents:
                unit_seen_sents.add(sent_text)
                e = _entry("unit", sent_text)
                if e:
                    results.append(e)

        # ── Regex: formulas ────────────────────────────────────────────────
        for sent in doc.sents:
            s = sent.text.strip()
            if _is_formula_sentence(s) and s not in seen_sents:
                seen_sents.add(s)
                e = _entry("formula", s)
                if e:
                    results.append(e)

        # ── Regex: numbered / bulleted list items ─────────────────────────
        # Only if the chunk text itself has multiple list markers
        if LIST_LINE_PATTERN.search(text):
            items = _list_items(text)
            for item in items:
                if item not in seen_sents:
                    seen_sents.add(item)
                    # Classify sub-items: if they look like formulas → formula
                    # else → rule (enumerated rules are common in textbooks)
                    if _is_formula_sentence(item):
                        cat = "formula"
                    else:
                        cat = "rule"
                    e = _entry(cat, item)
                    if e:
                        results.append(e)

    # Deduplicate by (category, text)
    seen: set[tuple] = set()
    deduped = []
    for r in results:
        key = (r["category"], r["text"][:120])
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    return deduped
