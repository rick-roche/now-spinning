import { Icon } from "./Icon";

interface ErrorMessageProps {
  /** Error message to display */
  message: string;
  /** Optional retry callback */
  onRetry?: () => void;
  /** Whether to show as full-page error or inline */
  fullPage?: boolean;
}

/**
 * Error message component with optional retry button.
 */
export function ErrorMessage({
  message,
  onRetry,
  fullPage = false,
}: ErrorMessageProps) {
  if (fullPage) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 text-red-400 mb-4">
            <Icon name="error" className="text-4xl" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
          <p className="text-slate-500 dark:text-primary/60 mb-6">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-block bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-lg transition-colors shadow-lg shadow-primary/20 focus-ring"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg flex items-start gap-3"
      role="alert"
      aria-live="assertive"
    >
      <Icon name="error" className="text-xl shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 text-sm font-semibold underline hover:no-underline focus-ring"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
