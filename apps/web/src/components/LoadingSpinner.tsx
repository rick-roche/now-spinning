import { Icon } from "./Icon";

interface LoadingSpinnerProps {
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Optional className for additional styling */
  className?: string;
}

/**
 * Animated loading spinner with ARIA support.
 */
export function LoadingSpinner({ size = "md", className = "" }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "text-2xl",
    md: "text-4xl",
    lg: "text-6xl",
  };

  return (
    <div className={`flex items-center justify-center ${className}`} role="status" aria-live="polite">
      <Icon
        name="sync"
        className={`${sizeClasses[size]} text-primary animate-spin`}
        aria-hidden="true"
      />
      <span className="sr-only">Loading...</span>
    </div>
  );
}
