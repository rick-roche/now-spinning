interface SessionProgressProps {
  elapsedMs: number;
  durationMs: number | null;
  progressPercent: number;
  formatTime: (ms: number | null) => string;
}

export function SessionProgress({
  elapsedMs,
  durationMs,
  progressPercent,
  formatTime,
}: SessionProgressProps) {
  return (
    <div className="space-y-3">
      {/* Progress Bar */}
      <div className="relative h-1 bg-white/10 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Track progress"
        />
      </div>

      {/* Time Display */}
      <div className="flex items-center justify-between text-xs opacity-60">
        <span>{formatTime(elapsedMs)}</span>
        <span>{formatTime(durationMs)}</span>
      </div>
    </div>
  );
}
