import type { ChunkPublic, NotePublic } from "../api/documents";
import type { HighlightBox } from "../store/workspaceStore";

export function buildChunkIndex(chunks: ChunkPublic[]): Record<string, ChunkPublic> {
  const map: Record<string, ChunkPublic> = {};
  for (const c of chunks) map[c.id] = c;
  return map;
}

/**
 * Resolves a note's source_bounding_boxes to the page each box actually
 * lives on. source_bounding_boxes[i] pairs with source_chunk_ids[i] (both
 * built in lockstep in hierarchy_service.py). source_pages is a *separate*
 * de-duplicated summary and is NOT guaranteed to align by index for
 * multi-page roll-up notes -- so we resolve each box's page via the
 * chunk's own page_number instead of zipping against source_pages.
 */
export function resolveNoteHighlights(
  note: NotePublic,
  chunkIndex: Record<string, ChunkPublic>
): HighlightBox[] {
  const highlights: HighlightBox[] = [];
  note.source_chunk_ids.forEach((chunkId, i) => {
    const chunk = chunkIndex[chunkId];
    const box = note.source_bounding_boxes[i];
    if (chunk && box) {
      highlights.push({ page: chunk.page_number, box });
    }
  });
  return highlights;
}
