import type { ReactNode } from "react";

interface SketchCardProps {
  children: ReactNode;
  className?: string;
  /** Subtle rotation in degrees, e.g. -1, 1, 2 */
  rotate?: number;
  /** Show torn-paper bottom edge */
  tornEdge?: boolean;
  /** Use thin 2px border instead of 3px */
  thin?: boolean;
  /** Add solid ink offset shadow */
  shadow?: boolean;
  /** Click handler */
  onClick?: () => void;
}

export default function SketchCard({
  children,
  className = "",
  rotate = 0,
  tornEdge = false,
  thin = false,
  shadow = false,
  onClick,
}: SketchCardProps) {
  const borderClass = thin ? "hand-drawn-border-thin" : "hand-drawn-border";
  const shadowClass = shadow ? "shadow-sketch" : "";
  const tornClass = tornEdge ? "torn-edge-bottom pb-8" : "";
  const rotateStyle = rotate !== 0 ? { transform: `rotate(${rotate}deg)` } : {};

  return (
    <div
      className={`relative bg-white ${borderClass} ${shadowClass} ${tornClass} ${className}`}
      style={rotateStyle}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
