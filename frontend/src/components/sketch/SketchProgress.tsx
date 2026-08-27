interface SketchProgressProps {
  /** 0–100 */
  value: number;
  /** Label text */
  label?: string;
  className?: string;
}

export default function SketchProgress({
  value,
  label,
  className = "",
}: SketchProgressProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {label && (
        <span className="font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">
          {label}
        </span>
      )}
      <div className="flex-1 h-4 hand-drawn-border-thin bg-surface-container-lowest relative overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{
            width: `${Math.min(100, Math.max(0, value))}%`,
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 3px,
              rgba(255,255,255,0.3) 3px,
              rgba(255,255,255,0.3) 6px
            )`,
          }}
        />
      </div>
      <span className="font-mono text-source-code text-on-surface-variant w-10 text-right">
        {Math.round(value)}%
      </span>
    </div>
  );
}
