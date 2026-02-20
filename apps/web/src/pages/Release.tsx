import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { getApiUrl } from "../lib/api";
import type { APIError, DiscogsReleaseResponse, NormalizedRelease } from "@repo/shared";

export function Release() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [release, setRelease] = useState<NormalizedRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const loadRelease = async () => {
      if (!id) {
        setError("Missing release id.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(getApiUrl(`/api/discogs/release/${id}`));
        if (!response.ok) {
          throw new Error("Failed to load release");
        }

        const data: DiscogsReleaseResponse<NormalizedRelease> = await response.json();
        setRelease(data.release);
      } catch (err) {
         
        const error: unknown = err;
        setError(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    };

    void loadRelease();
  }, [id]);

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

  const formatDuration = (durationSec: number | null) => {
    if (!durationSec && durationSec !== 0) return "—";
    const minutes = Math.floor(durationSec / 60);
    const seconds = durationSec % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const startSession = async () => {
    if (!release) return;

    try {
      setStarting(true);
      setError(null);
      const response = await fetch(getApiUrl("/api/session/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId: release.id }),
      });

      if (!response.ok) {
        const data: APIError = await response.json();
        throw new Error(data.error?.message ?? "Failed to start session");
      }

      void navigate("/session");
    } catch (err) {
       
      const error: unknown = err;
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Icon name="sync" className="text-4xl text-primary animate-spin mb-2" />
          <p className="text-sm text-slate-500">Loading release...</p>
        </div>
      </div>
    );
  }

  if (error && !release) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 text-red-400 mb-4">
            <Icon name="error" className="text-4xl" />
          </div>
          <h2 className="text-xl font-bold mb-2">Couldn&apos;t load release</h2>
          <p className="text-slate-500 mb-6">{error}</p>
          <Link
            to="/collection"
            className="inline-block bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Back to Collection
          </Link>
        </div>
      </div>
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
                  alt={`${release.title} cover`}
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
            onClick={() => void startSession()}
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
                      {formatDuration(track.durationSec)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>{/* end right column */}
        </div>{/* end desktop grid */}
      </main>

      {error && (
        <div className="fixed bottom-24 left-0 right-0 mx-auto max-w-md px-4">
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm">
            {error}
          </div>
        </div>
      )}
    </>
  );
}
