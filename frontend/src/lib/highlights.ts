import type { BoundingBox, ChunkPublic, NotePublic } from "../api/documents";
import type { HighlightBox } from "../store/workspaceStore";

export function buildChunkIndex(chunks: ChunkPublic[]): Record<string, ChunkPublic> {
  const map: Record<string, ChunkPublic> = {};
  for (const c of chunks) map[c.id] = c;
  return map;
}

const STOP_WORDS = new Set([
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on",
  "with", "he", "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we",
  "say", "her", "she", "or", "an", "will", "my", "one", "all", "would", "there", "their",
  "what", "so", "up", "out", "if", "about", "who", "get", "which", "go", "me", "when", "make",
  "can", "like", "time", "no", "just", "him", "know", "take", "people", "into", "year", "your",
  "good", "some", "could", "them", "see", "other", "than", "then", "now", "look", "only",
  "come", "its", "over", "think", "also", "back", "after", "use", "two", "how", "our", "work",
  "first", "well", "way", "even", "new", "want", "because", "any", "these", "give", "day",
  "most", "us", "is", "are", "was", "were", "been", "has", "had"
]);

/**
 * Maps a note and its source chunk to clean, continuous yellow highlighter strips
 * covering the EXACT FULL SENTENCES in the document from which the note was created.
 */
export function generateKeywordStrips(
  chunk: ChunkPublic,
  noteText: string,
  fullBox: BoundingBox
): HighlightBox[] {
  const page = chunk.page_number;
  const chunkText = chunk.text.trim();
  if (!chunkText || !noteText) return [];

  const x0 = fullBox.x0;
  const y0 = fullBox.y0;
  const x1 = fullBox.x1;
  const y1 = fullBox.y1;
  const totalHeight = Math.max(1, y1 - y0);
  const totalWidth = Math.max(1, x1 - x0);

  // 1. Split chunkText into full sentences
  const sentenceRegex = /[^.!?]+[.!?]+/g;
  const sentenceMatches: { text: string; start: number; end: number }[] = [];
  let sMatch: RegExpExecArray | null = null;
  while ((sMatch = sentenceRegex.exec(chunkText)) !== null) {
    sentenceMatches.push({
      text: sMatch[0],
      start: sMatch.index,
      end: sMatch.index + sMatch[0].length,
    });
  }

  // Fallback if no period punctuation found: treat whole chunk as one sentence
  if (sentenceMatches.length === 0) {
    sentenceMatches.push({ text: chunkText, start: 0, end: chunkText.length });
  }

  // 2. Identify which full sentence(s) in chunkText contributed to noteText
  const noteLower = noteText.toLowerCase();
  const matchedSentences: { start: number; end: number }[] = [];

  for (const s of sentenceMatches) {
    const sLower = s.text.toLowerCase().trim();
    if (sLower.length < 5) continue;

    const sWords = sLower
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

    if (sWords.length === 0) continue;

    let overlapCount = 0;
    for (const word of sWords) {
      if (noteLower.includes(word)) overlapCount++;
    }

    const overlapRatio = overlapCount / sWords.length;

    if (overlapRatio >= 0.35 || (sLower.length > 10 && noteLower.includes(sLower))) {
      matchedSentences.push({ start: s.start, end: s.end });
    }
  }

  // Fallback to highest overlap sentence if no sentence passed threshold
  if (matchedSentences.length === 0 && sentenceMatches.length > 0) {
    let bestScore = -1;
    let bestSentence = sentenceMatches[0];
    for (const s of sentenceMatches) {
      const sLower = s.text.toLowerCase().trim();
      const sWords = sLower
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
      const score = sWords.filter((w) => noteLower.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        bestSentence = s;
      }
    }
    matchedSentences.push({ start: bestSentence.start, end: bestSentence.end });
  }

  // 3. Convert matched full sentences into continuous line-by-line yellow highlighter strips
  const charsPerLine = 66; // Average characters per line in textbook column layout
  const totalLines = Math.max(1, Math.round(chunkText.length / charsPerLine));
  const lineHeight = totalHeight / totalLines;

  const strips: HighlightBox[] = [];

  for (const s of matchedSentences) {
    const lineStartIdx = Math.floor(s.start / charsPerLine);
    const lineEndIdx = Math.floor(Math.max(s.start, s.end - 1) / charsPerLine);

    for (let l = lineStartIdx; l <= lineEndIdx; l++) {
      const lineCharStart = l * charsPerLine;
      const lineCharEnd = (l + 1) * charsPerLine;

      const sentenceStartInLine = Math.max(s.start, lineCharStart) - lineCharStart;
      const sentenceEndInLine = Math.min(s.end, lineCharEnd) - lineCharStart;

      const leftRatio = sentenceStartInLine <= 2 ? 0 : sentenceStartInLine / charsPerLine;
      const rightRatio = sentenceEndInLine >= charsPerLine - 2 ? 1 : sentenceEndInLine / charsPerLine;

      const stripX0 = x0 + leftRatio * totalWidth;
      const stripX1 = x0 + rightRatio * totalWidth;
      const stripW = Math.max(25, stripX1 - stripX0);

      const stripY0 = y0 + l * lineHeight + lineHeight * 0.08;
      const stripH = lineHeight * 0.82;

      strips.push({
        page,
        box: {
          x0: stripX0,
          y0: stripY0,
          x1: stripX0 + stripW,
          y1: stripY0 + stripH,
        },
        color: "yellow",
      });
    }
  }

  return strips;
}

export function resolveNoteHighlights(
  note: NotePublic,
  chunkIndex: Record<string, ChunkPublic>
): HighlightBox[] {
  const highlights: HighlightBox[] = [];
  note.source_chunk_ids.forEach((chunkId, i) => {
    const chunk = chunkIndex[chunkId];
    const box = note.source_bounding_boxes[i];
    if (chunk && box) {
      const strips = generateKeywordStrips(chunk, note.text, box);
      highlights.push(...strips);
    }
  });
  return highlights;
}
