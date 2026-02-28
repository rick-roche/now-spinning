import { Icon } from "./Icon";
import type { NormalizedRelease, NormalizedTrack } from "@repo/shared";

interface SessionTrackInfoProps {
  track: NormalizedTrack;
  release: NormalizedRelease;
}

export function SessionTrackInfo({ track, release }: SessionTrackInfoProps) {
  return (
    <div className="space-y-4">
      {/* Album Art */}
      <div className="mt-4 flex justify-center">
        <div className="relative group aspect-square w-full max-w-55 md:max-w-sm">
          <div className="absolute inset-0 bg-black/40 rounded-xl translate-y-4 scale-95 blur-2xl" aria-hidden="true"></div>
          <div className="relative w-full h-full rounded-xl overflow-hidden border border-white/10 shadow-2xl">
            {release.coverUrl ? (
              <img
                alt={`${release.artist} - ${release.title} album cover`}
                className="w-full h-full object-cover"
                src={release.coverUrl}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-accent-dark/50">
                <Icon name="album" className="text-6xl text-text-muted" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Track Details */}
      <div className="mt-8 text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          {track.side && (
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded bg-white/10 opacity-60">
              Side {track.side}
            </span>
          )}
          {track.position && (
            <span className="text-xs opacity-40 font-mono">{track.position}</span>
          )}
        </div>
        <h2 className="text-2xl font-bold tracking-tight leading-snug px-4">
          {track.title}
        </h2>
        <p className="text-base opacity-60">{track.artist || release.artist}</p>
        <p className="text-sm opacity-40">{release.title}</p>
      </div>
    </div>
  );
}
