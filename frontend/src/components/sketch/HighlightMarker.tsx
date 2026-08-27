import type { ReactNode } from "react";

interface HighlightMarkerProps {
  children: ReactNode;
  /** Highlight color */
  color?: "yellow" | "blue";
  className?: string;
}

export default function HighlightMarker({
  children,
  color = "yellow",
  className = "",
}: HighlightMarkerProps) {
  const highlightClass = color === "yellow" ? "highlight-yellow" : "highlight-blue";

  return (
    <span className={`${highlightClass} ${className}`}>
      {children}
    </span>
  );
}
