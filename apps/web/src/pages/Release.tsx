import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { ErrorMessage } from "../components/ErrorMessage";
import { ReleaseSkeleton } from "../components/ReleaseSkeleton";
import { useApiMutation } from "../hooks/useApiMutation";
import { useApiQuery } from "../hooks/useApiQuery";
import { formatDurationSec } from "../lib/format";
import type { DiscogsReleaseResponse, NormalizedRelease, SessionStartResponse } from "@repo/shared";
import { DiscogsReleaseIdSchema } from "@repo/shared";

export function Release() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const releaseIdResult = DiscogsReleaseIdSchema.safeParse(id ?? "");
  const releaseId = releaseIdResult.success ? releaseIdResult.data : null;

  const { data, loading, error, refetch } = useApiQuery<DiscogsReleaseResponse<NormalizedRelease>>(
    releaseId ? `/api/discogs/release/${releaseId}` : "",
    {
      enabled: Boolean(releaseId),
      errorMessage: "Failed to load release",
      retry: 0,
    }
  );

  const release = data?.release ?? null;

  const {
    mutate: startSession,
    loading: starting,
    error: startError,
    reset: resetStartError,
  } = useApiMutation<SessionStartResponse, { releaseId: string }>(
    (vars) => ({
      url: "/api/session/start",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vars),
    }),
    {
      onSuccess: () => {
        void navigate("/session");
      },
    }
  );

  const groupedTracks = useMemo(() => {
    if (!release) return [];

    const groups = new Map<string, typeof release.tracks>();
    const order: string[] = [];

    release.tracks.forEach((track) => {
      const key = track.side ?? "Tracks";
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)?.push(track);
    });

    return order.map((key) => ({
      key,
      label: key === "Tracks" ? "Tracks" : `Side ${key}`,
      tracks: groups.get(key) ?? [],
    }));
  }, [release]);

  const handleStartSession = async () => {
    if (!release) return;
    resetStartError();
    await startSession({ releaseId: release.id });
  };

  const errorMessage = error ?? startError;
  const releaseIdError = releaseIdResult.success
    ? null
    : releaseIdResult.error.issues[0]?.message ?? "Release id is required.";

  if (releaseIdError) {
    return (
      <ErrorMessage
        fullPage
        message={releaseIdError}
        onRetry={() => {
          void navigate("/collection");
        }}
      />
    );
  }

  if (loading) {
    return <ReleaseSkeleton />;
  }

  if (errorMessage && !release) {
    return (
      <ErrorMessage
        fullPage
        message={errorMessage}
        onRetry={() => void refetch()}
      />
    );
  }

  if (!release) return null;

  return (
    <>
      {/* Header */}
      <header className="flex items-center justify-center px-6 py-4">
        <span className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold">
          Release
        </span>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 pb-32 md:pb-12">
        <div className="md:grid md:grid-cols-[1fr_1fr] md:gap-12 md:max-w-4xl md:mx-auto md:items-start">
        {/* Left column on desktop: album art + info + start button */}
        <div>
        {/* Album Art */}
        <div className="mt-2 flex justify-center">
          <div className="relative aspect-square w-full max-w-[220px] md:max-w-sm">
            <div className="absolute inset-0 bg-black/40 rounded-xl translate-y-3 scale-95 blur-2xl" />
            <div className="relative w-full h-full rounded-xl overflow-hidden border border-white/10 shadow-2xl">
              {release.coverUrl ? (
                <img
                  src={release.coverUrl}
                  alt={`${release.artist} - ${release.title} album cover`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-accent-dark/50">
                  <Icon name="album" className="text-6xl text-text-muted" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Release Info */}
        <div className="mt-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">{release.title}</h1>
          <p className="text-base opacity-60 mt-1 font-medium">
            {release.artist}{release.year ? ` · ${release.year}` : ""}
          </p>
        </div>

        {/* Start Session Button */}
        <div className="mt-6">
          <button
            onClick={() => void handleStartSession()}
            disabled={starting}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-primary text-white font-bold text-sm tracking-widest uppercase shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50"
          >
            <Icon name={starting ? "sync" : "play_arrow"} className={starting ? "animate-spin" : ""} />
            {starting ? "Starting..." : "Start Scrobbling"}
          </button>
        </div>
        </div>{/* end left column */}

        {/* Right column on desktop / continuation on mobile: tracklist */}
        <div className="mt-8 md:mt-4">
          {groupedTracks.map((group) => (
            <div key={group.key} className="mb-6">
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-xs uppercase font-bold tracking-[0.2em] opacity-40">
                  {group.label}
                </h3>
              </div>
              <div className="space-y-1">
                {group.tracks.map((track) => (
                  <div
                    key={`${group.key}-${track.index}`}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <span className="text-xs font-bold opacity-30 w-6 shrink-0">
                      {track.position}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium opacity-80 truncate">{track.title}</p>
                      {track.artist !== release.artist ? (
                        <p className="text-[11px] opacity-40 truncate">{track.artist}</p>
                      ) : null}
                    </div>
                    <span className="text-[10px] opacity-40 shrink-0">
                      {formatDurationSec(track.durationSec)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>{/* end right column */}
        </div>{/* end desktop grid */}
      </main>

      {errorMessage && (
        <div className="fixed bottom-24 left-0 right-0 mx-auto max-w-md px-4">
          <ErrorMessage message={errorMessage} />
        </div>
      )}
    </>
  );
}
