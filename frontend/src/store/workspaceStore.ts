import { create } from "zustand";
import type { BoundingBox, NoteLevel } from "../api/documents";

export interface HighlightBox {
  page: number;
  box: BoundingBox;
}

interface FocusSearchResultPayload {
  page: number;
  box: BoundingBox | null;
  noteId?: string | null;
  noteLevel?: NoteLevel | null;
}

interface WorkspaceState {
  activeDocumentId: string | null;
  activeNoteId: string | null;
  activeHighlights: HighlightBox[];
  requestedNoteLevel: NoteLevel | null;

  highlightScrollToken: number;
  noteScrollToken: number;

  setActiveDocument: (docId: string) => void;
  activateNote: (noteId: string, highlights: HighlightBox[]) => void;
  activateChunk: (
    noteId: string,
    level: NoteLevel,
    highlights: HighlightBox[]
  ) => void;
  focusSearchResult: (payload: FocusSearchResultPayload) => void;
  clearSelection: () => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeDocumentId: null,
  activeNoteId: null,
  activeHighlights: [],
  requestedNoteLevel: null,

  highlightScrollToken: 0,
  noteScrollToken: 0,

  setActiveDocument: (docId) =>
    set((state) =>
      state.activeDocumentId === docId
        ? state
        : {
            activeDocumentId: docId,
            activeNoteId: null,
            activeHighlights: [],
            requestedNoteLevel: null,
            highlightScrollToken: 0,
            noteScrollToken: 0,
          }
    ),

  activateNote: (noteId, highlights) =>
    set((state) => ({
      activeNoteId: noteId,
      activeHighlights: highlights,
      highlightScrollToken: state.highlightScrollToken + 1,
    })),

  activateChunk: (noteId, level, highlights) =>
    set((state) => ({
      activeNoteId: noteId,
      activeHighlights: highlights,
      requestedNoteLevel: level,
      noteScrollToken: state.noteScrollToken + 1,
    })),

  focusSearchResult: (payload) =>
    set((state) => ({
      activeHighlights: payload.box ? [{ page: payload.page, box: payload.box }] : [],
      highlightScrollToken: state.highlightScrollToken + 1,
      ...(payload.noteId
        ? {
            activeNoteId: payload.noteId,
            requestedNoteLevel: payload.noteLevel ?? state.requestedNoteLevel,
            noteScrollToken: state.noteScrollToken + 1,
          }
        : {}),
    })),

  clearSelection: () =>
    set({
      activeNoteId: null,
      activeHighlights: [],
    }),

  reset: () =>
    set({
      activeDocumentId: null,
      activeNoteId: null,
      activeHighlights: [],
      requestedNoteLevel: null,
      highlightScrollToken: 0,
      noteScrollToken: 0,
    }),
}));
