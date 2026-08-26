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

const HEAT_COLOUR: Record<HeatLevel, string> = {
  none: "transparent",
  yellow: "rgba(250, 204, 21, 0.35)",   // yellow-400 35%
  orange: "rgba(249, 115, 22, 0.40)",   // orange-500 40%
  red: "rgba(239, 68, 68, 0.45)",       // red-500 45%
};

const HEAT_RING: Record<HeatLevel, string> = {
  none: "none",
  yellow: "1px solid rgba(234,179,8,0.6)",
  orange: "1px solid rgba(234,88,12,0.7)",
  red: "1px solid rgba(220,38,38,0.8)",
};

export function HeatmapLegend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-slate-600">
      <span className="font-medium">Heat:</span>
      {(["yellow", "orange", "red"] as HeatLevel[]).map((level) => (
        <span key={level} className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-5 rounded-sm"
            style={{ background: HEAT_COLOUR[level], border: HEAT_RING[level] }}
          />
          {level}
        </span>
      ))}
    </div>
  );
}

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
      .catch(() => {
        /* silently ignore */
      })
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
              className="pointer-events-none absolute rounded-sm"
              style={{
                left: x0 * scaleInfo.scale,
                top: y0 * scaleInfo.scale,
                width: (x1 - x0) * scaleInfo.scale,
                height: (y1 - y0) * scaleInfo.scale,
                background: HEAT_COLOUR[level],
                outline: HEAT_RING[level],
              }}
            />
          );
        })}
    </>
  );
}
