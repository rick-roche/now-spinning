import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import { formatDurationMs, formatDurationSec } from "../lib/format";
import type { Session } from "@repo/shared";

interface SessionCompleteProps {
  session: Session;
  onDismiss: () => void;
}

export function SessionComplete({ session, onDismiss }: SessionCompleteProps) {
  const { release, tracks, startedAt } = session;

  const scrobbledTracks = tracks.filter((t) => t.status === "scrobbled");
  const skippedTracks = tracks.filter((t) => t.status === "skipped");

  const lastScrobbleAt = scrobbledTracks.reduce(
    (latest, t) => (t.scrobbledAt && t.scrobbledAt > latest ? t.scrobbledAt : latest),
    0
  );
  const sessionDurationMs = lastScrobbleAt > 0 ? lastScrobbleAt - startedAt : 0;

  const totalPlaybackSec = release.tracks.reduce(
    (sum, t) => sum + (t.durationSec ?? 0),
    0
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="w-10" aria-hidden="true" />
        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold">
            Session Complete
          </span>
        </div>
        <div className="w-10" aria-hidden="true" />
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 pb-32 md:pb-12">
        <div className="md:grid md:grid-cols-[1fr_1fr] md:gap-12 md:max-w-4xl md:mx-auto md:items-start">
          {/* Left column: album art + stats */}
          <div>
            {/* Album Art */}
            <div className="mt-4 flex justify-center">
              <div className="relative group aspect-square w-full max-w-55 md:max-w-sm">
                <div className="absolute inset-0 bg-black/40 rounded-xl translate-y-4 scale-95 blur-2xl" aria-hidden="true" />
                <div className="relative w-full h-full rounded-xl overflow-hidden border border-white/10 shadow-2xl">
                  {release.coverUrl ? (
                    <img
                      alt={`${release.artist} - ${release.title} album cover`}
                      className="w-full h-full object-cover"
                      src={release.coverUrl}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-accent-dark/50">
                      <Icon name="album" className="text-6xl text-text-muted" aria-hidden="true" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Release info */}
            <div className="mt-8 text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight leading-snug px-4">
                {release.title}
              </h2>
              <p className="text-base opacity-60">{release.artist}</p>
            </div>

            {/* Stats summary */}
            <div className="mt-6 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                <p className="text-2xl font-bold text-primary">{scrobbledTracks.length}</p>
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-50 mt-1">Scrobbled</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                <p className="text-2xl font-bold">{tracks.length}</p>
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-50 mt-1">Tracks</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                <p className="text-2xl font-bold">
                  {totalPlaybackSec > 0 ? formatDurationSec(totalPlaybackSec) : formatDurationMs(sessionDurationMs)}
                </p>
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-50 mt-1">Duration</p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-8 flex flex-col gap-3">
              <Link
                to="/collection"
                className="block text-center bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-lg transition-colors shadow-lg shadow-primary/20 focus-ring"
              >
                Browse Collection
              </Link>
              <button
                type="button"
                onClick={onDismiss}
                className="text-center text-sm opacity-60 hover:opacity-100 transition-opacity py-2"
              >
                Dismiss
              </button>
            </div>
          </div>

          {/* Right column: track list */}
          <div className="mt-12 md:mt-4">
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="text-xs uppercase font-bold tracking-[0.2em] opacity-40">
                Tracklist
              </h3>
              {skippedTracks.length > 0 && (
                <span className="text-[10px] opacity-40">
                  {skippedTracks.length} skipped
                </span>
              )}
            </div>
            <div className="space-y-1">
              {release.tracks.map((track) => {
                const trackState = tracks[track.index];
                const isScrobbled = trackState?.status === "scrobbled";
                const isSkipped = trackState?.status === "skipped";

                return (
                  <div
                    key={track.index}
                    className={`flex items-center gap-4 p-3 rounded-lg ${
                      isScrobbled
                        ? "border border-primary/20 bg-primary/5"
                        : isSkipped
                          ? "opacity-40"
                          : ""
                    }`}
                  >
                    <span className="text-xs font-bold w-6 shrink-0 opacity-30">
                      {track.position}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${isScrobbled ? "font-medium" : "font-medium opacity-60"}`}>
                        {track.title}
                      </p>
                      <p className="text-[10px] opacity-40 truncate">
                        {track.artist || release.artist}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {track.durationSec ? (
                        <span className="text-[10px] opacity-30">
                          {formatDurationSec(track.durationSec)}
                        </span>
                      ) : null}
                      {isScrobbled ? (
                        <Icon
                          name="check_circle"
                          className="text-primary text-lg"
                          aria-label="Scrobbled track"
                        />
                      ) : isSkipped ? (
                        <Icon
                          name="skip_next"
                          className="text-sm opacity-40"
                          aria-label="Skipped track"
                        />
                      ) : (
                        <span className="w-[18px]" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
