"""
Loads a pretrained T5 model ONCE (call load_model() at app startup) and
exposes:
  - summarize_text(): single-pass T5 generation for text that already fits
    the model's input window.
  - summarize_long_text(): map-reduce summarization for arbitrarily long
    text (topic/page/chapter roll-ups) that respects T5's max input token
    length by chunking + batch-summarizing + recursively re-summarizing,
    instead of silently truncating.
"""

import logging
import re

import torch
from transformers import T5ForConditionalGeneration, T5Tokenizer

logger = logging.getLogger(__name__)

MODEL_NAME = "t5-small"
MAX_INPUT_TOKENS = 512
SAFE_INPUT_TOKENS = MAX_INPUT_TOKENS - 10  # headroom for "summarize: " prefix + special tokens
MAX_ROLLUP_DEPTH = 4  # hard ceiling so batch-of-batches can never loop forever

_tokenizer: T5Tokenizer | None = None
_model: T5ForConditionalGeneration | None = None
_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def load_model() -> None:
    """Loads the T5 tokenizer + model once per process. Safe to call multiple times."""
    global _tokenizer, _model
    if _model is not None and _tokenizer is not None:
        return

    print(f"[summarization_service] Loading '{MODEL_NAME}' on device={_device}...")
    _tokenizer = T5Tokenizer.from_pretrained(MODEL_NAME)
    _model = T5ForConditionalGeneration.from_pretrained(MODEL_NAME)
    _model.to(_device)
    _model.eval()
    print("[summarization_service] Model loaded and ready for inference.")


def is_ready() -> bool:
    return _model is not None and _tokenizer is not None


def _token_count(text: str) -> int:
    return len(_tokenizer(text, truncation=False)["input_ids"])


def summarize_text(text: str, max_length: int = 60, min_length: int = 10) -> str:
    """
    Runs real T5 generation on `text`. Prefixes with "summarize: " as T5 requires.
    Truncates the input to MAX_INPUT_TOKENS tokens as a safety net (should only
    ever bite here since summarize_long_text pre-chunks anything bigger).
    """
    if not is_ready():
        raise RuntimeError("Summarization model is not loaded yet. Call load_model() first.")

    text = text.strip()
    if not text:
        return ""

    input_text = "summarize: " + text
    inputs = _tokenizer(
        input_text,
        return_tensors="pt",
        max_length=MAX_INPUT_TOKENS,
        truncation=True,
    ).to(_device)

    with torch.no_grad():
        output_ids = _model.generate(
            **inputs,
            max_length=max_length,
            min_length=min_length,
            num_beams=4,
            length_penalty=2.0,
            no_repeat_ngram_size=3,
            early_stopping=True,
        )

    return _tokenizer.decode(output_ids[0], skip_special_tokens=True).strip()


def _split_into_token_chunks(text: str, max_tokens: int) -> list[str]:
    """
    Splits `text` into chunks of at most `max_tokens` T5 tokens each, breaking on
    sentence boundaries where possible so we don't cut a thought in half. Falls
    back to a hard word-level split for any single sentence that alone exceeds
    max_tokens (rare, but real long run-on sentences happen).
    """
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks: list[str] = []
    current: list[str] = []
    current_tokens = 0

    def flush():
        nonlocal current, current_tokens
        if current:
            chunks.append(" ".join(current))
            current = []
            current_tokens = 0

    for sentence in sentences:
        if not sentence:
            continue
        sentence_tokens = _token_count(sentence)

        if sentence_tokens > max_tokens:
            # A single sentence is itself too long -- hard-split on words.
            flush()
            words = sentence.split()
            sub: list[str] = []
            sub_tokens = 0
            for word in words:
                word_tokens = _token_count(word)
                if sub_tokens + word_tokens > max_tokens and sub:
                    chunks.append(" ".join(sub))
                    sub, sub_tokens = [], 0
                sub.append(word)
                sub_tokens += word_tokens
            if sub:
                chunks.append(" ".join(sub))
            continue

        if current_tokens + sentence_tokens > max_tokens:
            flush()
        current.append(sentence)
        current_tokens += sentence_tokens

    flush()
    return chunks


def summarize_long_text(text: str, max_length: int = 100, min_length: int = 20, _depth: int = 0) -> str:
    """
    Summarizes arbitrarily long text with T5 while respecting the model's max
    input token length. If the text already fits in one pass, summarizes it
    directly. If it doesn't, this performs REAL chunk-and-batch summarization:
    splits the text into token-bounded chunks (see _split_into_token_chunks),
    summarizes each chunk individually, concatenates those intermediate
    summaries, and recursively re-summarizes the result until it fits in a
    single final pass. Nothing is silently dropped -- every chunk gets
    summarized and folded into the next pass. A warning is logged every time
    batching kicks in, and again if we ever hit the recursion safety ceiling
    (at which point summarize_text's own truncation is the last resort).
    """
    if not is_ready():
        raise RuntimeError("Summarization model is not loaded yet.")

    text = text.strip()
    if not text:
        return ""

    token_count = _token_count("summarize: " + text)
    if token_count <= SAFE_INPUT_TOKENS:
        return summarize_text(text, max_length=max_length, min_length=min_length)

    if _depth >= MAX_ROLLUP_DEPTH:
        logger.warning(
            "summarize_long_text: hit MAX_ROLLUP_DEPTH=%d with %d tokens still "
            "remaining after %d rounds of batching -- falling back to "
            "summarize_text's built-in truncation for this final pass.",
            MAX_ROLLUP_DEPTH, token_count, _depth,
        )
        return summarize_text(text, max_length=max_length, min_length=min_length)

    chunk_token_budget = SAFE_INPUT_TOKENS - 15  # extra headroom for "summarize: " on each chunk
    chunks = _split_into_token_chunks(text, chunk_token_budget)

    logger.warning(
        "summarize_long_text: input is %d tokens (limit %d) at depth %d -- "
        "splitting into %d chunk(s) and summarizing in batches before the "
        "final roll-up pass so no content is silently truncated.",
        token_count, SAFE_INPUT_TOKENS, _depth, len(chunks),
    )

    chunk_summaries = [
        summarize_text(chunk, max_length=max_length, min_length=min(min_length, 15))
        for chunk in chunks
        if chunk.strip()
    ]
    combined = " ".join(chunk_summaries)

    return summarize_long_text(combined, max_length=max_length, min_length=min_length, _depth=_depth + 1)
