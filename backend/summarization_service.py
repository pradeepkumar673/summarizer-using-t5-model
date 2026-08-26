"""
Loads a pretrained T5 model ONCE (call load_model() at app startup) and
exposes summarize_text() for real, non-mocked abstractive summarization.
CPU-friendly: t5-small, beam search, capped input/output lengths.
"""

import torch
from transformers import T5ForConditionalGeneration, T5Tokenizer

MODEL_NAME = "t5-small"
MAX_INPUT_TOKENS = 512

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


def summarize_text(text: str, max_length: int = 60, min_length: int = 10) -> str:
    """
    Runs real T5 generation on `text`. Prefixes with "summarize: " as T5 requires.
    Truncates the input to MAX_INPUT_TOKENS tokens (t5-small's practical context window)
    so a long paragraph doesn't error out - it just summarizes what fits.
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
