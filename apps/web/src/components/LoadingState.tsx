import { LoadingSpinner } from "./LoadingSpinner";

interface LoadingStateProps {
  /** Message to display below spinner */
  message?: string;
  /** Whether to use full viewport height */
  fullScreen?: boolean;
}

/**
 * Full-page or centered loading state with optional message.
 */
export function LoadingState({
  message = "Loading...",
  fullScreen = false,
}: LoadingStateProps) {
  const containerClass = fullScreen
    ? "min-h-screen flex items-center justify-center"
    : "flex items-center justify-center p-8";

  return (
    <div className={containerClass}>
      <div className="text-center">
        <LoadingSpinner size="lg" className="mb-4" />
        <p className="text-sm text-slate-500 dark:text-primary/60">{message}</p>
      </div>
    </div>
  );
}
