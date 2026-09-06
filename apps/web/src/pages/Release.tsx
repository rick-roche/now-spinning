import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { ErrorMessage } from "../components/ErrorMessage";
import { ReleaseSkeleton } from "../components/ReleaseSkeleton";
import { useApiMutation } from "../hooks/useApiMutation";
import { useApiQuery } from "../hooks/useApiQuery";
import { formatDurationSec } from "../lib/format";
import { getScrobbleDelay, getNotifyOnSideCompletion } from "../lib/settings";
import { enqueueDirectScrobble } from "../lib/direct-scrobble-queue";
import type { DiscogsReleaseResponse, DirectScrobbleResponse, NormalizedRelease, SessionStartResponse } from "@repo/shared";
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
  const [selectedTracks, setSelectedTracks] = useState<number[]>([]);
  const [directOperationId, setDirectOperationId] = useState(() => crypto.randomUUID());

  const {
    mutate: startSession,
    loading: starting,
    error: startError,
    reset: resetStartError,
  } = useApiMutation<SessionStartResponse, { releaseId: string; thresholdPercent: number; notifyOnSideCompletion: boolean }>(
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

  const {
    mutate: directScrobble,
    loading: directScrobbling,
    data: directResult,
    error: directError,
    reset: resetDirectResult,
  } = useApiMutation<DirectScrobbleResponse, { operationId: string; releaseId: string; trackIndices: number[] }>(
    (vars) => ({
      url: "/api/scrobbles",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vars),
    }),
  );

  useEffect(() => {
    // Reset release-local selection when React Router reuses this page instance.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedTracks([]);
    setDirectOperationId(crypto.randomUUID());
    resetDirectResult();
  }, [releaseId, resetDirectResult]);

  const groupedTracks = useMemo(() => {
    if (!release) return [];

    const groups = new Map<string, typeof release.tracks>();
    const order: string[] = [];

    release.tracks.forEach((track) => {
      const key = release.mediaType === "cd" && track.discNumber ? `Disc ${track.discNumber}` : track.side ? `Side ${track.side}` : "Tracks";
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)?.push(track);
    });

    return order.map((key) => ({
      key,
      label: key,
      tracks: groups.get(key) ?? [],
    }));
  }, [release]);

  const handleStartSession = async () => {
    if (!release) return;
    resetStartError();
    await startSession({ releaseId: release.id, thresholdPercent: getScrobbleDelay(), notifyOnSideCompletion: getNotifyOnSideCompletion() });
  };

  const handleDirectScrobble = async () => {
    if (!release || selectedTracks.length === 0) return;
    const request = { operationId: directOperationId, releaseId: release.id, trackIndices: selectedTracks };
    const result = await directScrobble(request);
    if (!result && !navigator.onLine) enqueueDirectScrobble(request);
  };

  const handleDirectAlbumScrobble = async () => {
    if (!release || release.tracks.length === 0) return;
    const indices = release.tracks.map((track) => track.index);
    const operationId = crypto.randomUUID();
    setSelectedTracks(indices);
    setDirectOperationId(operationId);
    resetDirectResult();
    const request = { operationId, releaseId: release.id, trackIndices: indices };
    const result = await directScrobble(request);
    if (!result && !navigator.onLine) enqueueDirectScrobble(request);
  };

  const toggleTrack = (index: number) => {
    setSelectedTracks((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index].sort((a, b) => a - b));
    setDirectOperationId(crypto.randomUUID());
    resetDirectResult();
  };

  const errorMessage = error ?? startError ?? directError;
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
  const hasTracks = release.tracks.length > 0;
  const hasCompleteTimings = hasTracks && release.tracks.every((track) => track.durationSec !== null);
  const directTracks = directResult?.operation.tracks ?? [];

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
          {release.formats && release.formats.length > 0 && (
            <p className="text-xs text-primary mt-2">{release.formats.join(" · ")}</p>
          )}
          <a
            href={`https://www.discogs.com/release/${release.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary/10 focus-ring"
          >
            View on Discogs
            <Icon name="open_in_new" className="text-base" />
          </a>
        </div>

        {hasCompleteTimings ? (
          <div className="mt-6">
            <button
              onClick={() => void handleStartSession()}
              disabled={starting || !hasTracks}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-primary text-white font-bold text-sm tracking-widest uppercase shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50"
            >
              <Icon name={starting ? "sync" : "play_arrow"} className={starting ? "animate-spin" : ""} />
              {starting ? "Starting..." : "Start Scrobbling"}
            </button>
          </div>
        ) : hasTracks ? (
          <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
            <p className="text-sm font-semibold">Timed playback unavailable</p>
            <p className="mt-1 text-xs text-text-muted">Some track durations are unavailable, so use direct scrobbling instead.</p>
            <button
              type="button"
              onClick={() => void handleDirectAlbumScrobble()}
              disabled={directScrobbling}
              className="mt-3 w-full min-h-11 rounded-lg bg-primary px-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {directScrobbling ? "Scrobbling..." : "Scrobble album"}
            </button>
          </div>
        ) : null}
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold">Direct scrobble</p>
          <p className="mt-1 text-xs text-text-muted">Explicitly scrobbles tracks now. This does not start or change a listening session. If one is active, it will continue unchanged.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
               onClick={() => { setSelectedTracks(release.tracks.map((track) => track.index)); setDirectOperationId(crypto.randomUUID()); resetDirectResult(); }}
              className="min-h-11 flex-1 rounded-lg border border-white/20 px-3 text-sm font-semibold"
            >
              Select all
            </button>
            <button
              type="button"
               onClick={() => { setSelectedTracks([]); setDirectOperationId(crypto.randomUUID()); resetDirectResult(); }}
              className="min-h-11 flex-1 rounded-lg border border-white/20 px-3 text-sm font-semibold"
            >
              Clear
            </button>
          </div>
          <button
            onClick={() => void handleDirectScrobble()}
            disabled={directScrobbling || selectedTracks.length === 0}
            className="mt-3 w-full min-h-11 rounded-lg border border-primary/60 px-3 text-sm font-bold text-primary disabled:opacity-40"
          >
            {directScrobbling ? "Scrobbling..." : `Scrobble ${selectedTracks.length} selected`}
          </button>
          {directResult?.operation.activeSessionWarning && <p className="mt-2 text-xs text-amber-300">An active session is running. Direct scrobbling is allowed and will not change it.</p>}
          {directTracks.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs" aria-label="Direct scrobble results">
              {directTracks.map((track) => <li key={track.trackIndex} className="flex justify-between gap-2"><span>{track.title}</span><span className="text-text-muted">{track.status}</span></li>)}
            </ul>
          )}
          {directResult?.operation.status === "pending" && <button className="mt-3 min-h-11 text-sm font-semibold text-primary underline" onClick={() => void handleDirectScrobble()}>Retry transient failures</button>}
          {directResult && directResult.operation.status === "completed" && <p className="mt-2 text-xs text-emerald-300">Direct scrobble complete.</p>}
        </div>
        </div>{/* end left column */}

        {/* Right column on desktop / continuation on mobile: tracklist */}
        <div className="mt-8 md:mt-4">
          {!hasTracks && <p className="text-sm text-text-muted">Discogs does not provide a playable tracklist for this release.</p>}
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
                    <input
                      type="checkbox"
                      aria-label={`Select ${track.title}`}
                      checked={selectedTracks.includes(track.index)}
                      onChange={() => toggleTrack(track.index)}
                      className="size-5 shrink-0 accent-primary"
                    />
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
