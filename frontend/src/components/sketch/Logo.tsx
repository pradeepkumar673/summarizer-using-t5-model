interface LogoProps {
  className?: string;
  /** Show the icon only (no text) */
  iconOnly?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

const SIZE_MAP = {
  sm: { icon: "h-8 w-8", text: "h-6" },
  md: { icon: "h-10 w-10", text: "h-8" },
  lg: { icon: "h-14 w-14", text: "h-10" },
};

export default function Logo({ className = "", iconOnly = false, size = "md" }: LogoProps) {
  const s = SIZE_MAP[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Logo icon — uses the exported 02-logo.png */}
      <img
        src="/design-reference/stitch/02-logo.png"
        alt="pradeepLLM"
        className={`${s.icon} object-contain hand-drawn-border-thin p-0.5 bg-white`}
      />
      {!iconOnly && (
        <span className="font-marker text-xl md:text-2xl text-on-surface tracking-tight">
          pradeepLLM
        </span>
      )}
    </div>
  );
}
