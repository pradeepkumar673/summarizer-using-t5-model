import type { ButtonHTMLAttributes, ReactNode } from "react";

interface SketchButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

const VARIANT_CLASSES: Record<string, string> = {
  primary:   "bg-white hover:bg-primary/10 text-on-surface",
  secondary: "bg-secondary-container hover:bg-secondary-container/80 text-on-secondary-container",
  ghost:     "bg-transparent hover:bg-surface-container text-on-surface border-transparent",
  danger:    "bg-error-container hover:bg-error-container/80 text-on-error-container",
};

const SIZE_CLASSES: Record<string, string> = {
  sm: "px-4 py-1.5 text-source-code",
  md: "px-6 py-2.5 text-label-caps",
  lg: "px-8 py-3 text-label-caps",
};

export default function SketchButton({
  children,
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  ...rest
}: SketchButtonProps) {
  return (
    <button
      className={`
        hand-drawn-border font-label-caps uppercase tracking-wider
        transition-colors active:scale-95
        disabled:opacity-50 disabled:cursor-not-allowed
        ${VARIANT_CLASSES[variant]}
        ${SIZE_CLASSES[size]}
        ${className}
      `}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
