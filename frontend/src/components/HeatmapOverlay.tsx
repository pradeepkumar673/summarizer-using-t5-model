/**
 * STEP 13: Confusion Heatmap Overlay
 *
 * Renders semi-transparent colored overlays on top of the exact bounding boxes
 * of document chunks, coloured by heat level (yellow / orange / red).
 * Wired into PdfPane via an optional prop; toggled by a button in DocumentViewer.
 */
import { useEffect, useState, useCallback } from "react";
import { getHeatmap, type HeatmapResult, type HeatLevel } from "../api/activity";
import type { ChunkPublic } from "../api/documents";

interface PageScale {
  scale: number;
}

interface Props {
  documentId: string;
  chunks: ChunkPublic[];
  pageScales: Record<number, PageScale>;
  /** Visible page numbers currently rendered in the PDF pane. */
  visiblePages: number[];
}

// Marker-wash colours — warm tints matching the sketch palette
const HEAT_COLOUR: Record<HeatLevel, string> = {
  none:   "transparent",
  yellow: "rgba(254, 174, 44, 0.30)",   // marker-yellow 30%
  orange: "rgba(186, 100, 0,  0.35)",   // between yellow & red
  red:    "rgba(186, 26,  26, 0.35)",   // marker-red 35%
};

// Ink border matching each level
const HEAT_BORDER: Record<HeatLevel, string> = {
  none:   "none",
  yellow: "2px solid rgba(131, 85, 0,  0.50)",   // secondary / mustard
  orange: "2px solid rgba(186, 100, 0, 0.60)",
  red:    "2px solid rgba(186, 26,  26, 0.70)",  // error
};

// ── Legend ────────────────────────────────────────────────────────────────────

export function HeatmapLegend() {
  return (
    <div className="flex items-center gap-4">
      <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">
        Confusion Heat:
      </span>
      {(["yellow", "orange", "red"] as HeatLevel[]).map((level) => (
        <span key={level} className="flex items-center gap-1.5">
          <span
            className="inline-block h-3.5 w-6"
            style={{
              background: HEAT_COLOUR[level],
              border: HEAT_BORDER[level],
              borderRadius: "255px 5px 225px 5px / 5px 225px 5px 255px",
            }}
          />
          <span className="font-mono text-source-code text-on-surface-variant capitalize">
            {level}
          </span>
        </span>
      ))}
    </div>
  );
}

// ── Overlay ───────────────────────────────────────────────────────────────────

export default function HeatmapOverlay({
  documentId,
  chunks,
  pageScales,
  visiblePages,
}: Props) {
  const [heatmap, setHeatmap] = useState<HeatmapResult>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getHeatmap(documentId)
      .then(setHeatmap)
      .catch(() => { /* silently ignore */ })
      .finally(() => setLoading(false));
  }, [documentId]);

  useEffect(() => {
    load();
    // Refresh every 60 s so newly logged events surface without a reload
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && Object.keys(heatmap).length === 0) return null;

  return (
    <>
      {chunks
        .filter((c) => {
          const level: HeatLevel = heatmap[String(c.paragraph_id)] ?? "none";
          return level !== "none" && visiblePages.includes(c.page_number);
        })
        .map((chunk) => {
          const level: HeatLevel = heatmap[String(chunk.paragraph_id)] ?? "none";
          const scaleInfo = pageScales[chunk.page_number];
          if (!scaleInfo) return null;
          const { x0, y0, x1, y1 } = chunk.bounding_box;
          return (
            <div
              key={`heat-${chunk.id}`}
              data-heatmap="true"
              title={`Confusion level: ${level} (paragraph ${chunk.paragraph_id})`}
              className="pointer-events-none absolute"
              style={{
                left:   x0 * scaleInfo.scale,
                top:    y0 * scaleInfo.scale,
                width:  (x1 - x0) * scaleInfo.scale,
                height: (y1 - y0) * scaleInfo.scale,
                background: HEAT_COLOUR[level],
                border: HEAT_BORDER[level],
                // Slightly wobbly border radius for marker-wash feel
                borderRadius: "255px 5px 225px 5px / 5px 225px 5px 255px",
              }}
            />
          );
        })}
    </>
  );
}
