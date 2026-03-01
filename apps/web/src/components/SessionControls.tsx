import { Icon } from "./Icon";

interface SessionControlsProps {
  isPaused: boolean;
  canSkipBack: boolean;
  canSkipForward: boolean;
  onPlayPause: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onEnd: () => void;
  disabled?: boolean;
}

export function SessionControls({
  isPaused,
  canSkipBack,
  canSkipForward,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onEnd,
  disabled = false,
}: SessionControlsProps) {
  return (
    <div className="space-y-4">
      {/* Primary Controls */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={onSkipBack}
          disabled={!canSkipBack || disabled}
          className="flex items-center justify-center w-14 h-14 rounded-full bg-white/5 hover:bg-white/10 active:bg-white/15 transition-all disabled:opacity-30 disabled:cursor-not-allowed focus-ring"
          aria-label="Previous track"
        >
          <Icon name="skip_previous" className="text-3xl" />
        </button>

        <button
          onClick={onPlayPause}
          disabled={disabled}
          className="flex items-center justify-center w-16 h-16 rounded-full bg-primary hover:opacity-90 active:opacity-80 text-white shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-ring"
          aria-label={isPaused ? "Play" : "Pause"}
        >
          <Icon name={isPaused ? "play_arrow" : "pause"} className="text-4xl" />
        </button>

        <button
          onClick={onSkipForward}
          disabled={!canSkipForward || disabled}
          className="flex items-center justify-center w-14 h-14 rounded-full bg-white/5 hover:bg-white/10 active:bg-white/15 transition-all disabled:opacity-30 disabled:cursor-not-allowed focus-ring"
          aria-label="Next track"
        >
          <Icon name="skip_next" className="text-3xl" />
        </button>
      </div>

      {/* Secondary Controls */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={onEnd}
          disabled={disabled}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-ring"
        >
          End Session
        </button>
      </div>
    </div>
  );
}
