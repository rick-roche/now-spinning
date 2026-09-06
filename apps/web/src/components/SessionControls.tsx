import { Icon } from "./Icon";
import type { SessionEndMode } from "@repo/shared";
import { useState } from "react";

interface SessionControlsProps {
  isPaused: boolean;
  canSkipBack: boolean;
  canSkipForward: boolean;
  onPlayPause: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onScrobbleNow: () => void;
  onEnd: (mode: SessionEndMode) => void;
  disabled?: boolean;
}

export function SessionControls({
  isPaused,
  canSkipBack,
  canSkipForward,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onScrobbleNow,
  onEnd,
  disabled = false,
}: SessionControlsProps) {
  const [showEndModes, setShowEndModes] = useState(false);
  const endModes: Array<{ mode: SessionEndMode; label: string }> = [
    { mode: "end-without-scrobbling", label: "End without scrobbling" },
    { mode: "scrobble-current-and-remaining", label: "Scrobble current and remaining" },
    { mode: "skip-remaining", label: "Mark remaining as skipped" },
  ];
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
        <button onClick={onScrobbleNow} disabled={disabled} className="px-4 py-2 text-sm font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 active:bg-primary/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-ring">
          Scrobble now (manual override)
        </button>
      </div>
      <div className="flex items-center justify-center gap-2">
        {!showEndModes ? (
          <button onClick={() => setShowEndModes(true)} disabled={disabled} className="px-4 py-2 text-sm font-medium rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-ring">
            End Session
          </button>
        ) : endModes.map(({ mode, label }) => (
          <button key={mode} onClick={() => onEnd(mode)} disabled={disabled} className="px-4 py-2 text-sm font-medium rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-ring">
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
