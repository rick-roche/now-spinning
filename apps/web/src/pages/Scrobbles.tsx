import { useState } from "react";
import type { AuthStatusResponse, RecentScrobble, RecentScrobblesResponse } from "@repo/shared";
import { ErrorMessage } from "../components/ErrorMessage";
import { Icon } from "../components/Icon";
import { LoadingState } from "../components/LoadingState";
import { useApiMutation } from "../hooks/useApiMutation";
import { useApiQuery } from "../hooks/useApiQuery";

function localTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function TrackRow({ item }: { item: RecentScrobble }) {
  return (
    <li className="flex gap-4 items-center p-3 rounded-xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark">
      {item.artworkUrl ? <img src={item.artworkUrl} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" /> : <div className="w-16 h-16 rounded-lg bg-accent-dark flex items-center justify-center shrink-0"><Icon name="album" className="text-2xl text-text-muted" /></div>}
      <div className="min-w-0 flex-1">
        <p className="font-bold truncate">{item.track}</p>
        <p className="text-sm text-text-muted truncate">{item.artist}</p>
        <p className="text-xs text-text-muted truncate">{item.album || "Single"}</p>
      </div>
      <time className="text-xs text-text-muted text-right shrink-0" dateTime={new Date(item.timestamp * 1000).toISOString()}>{localTime(item.timestamp)}</time>
    </li>
  );
}

export function Scrobbles() {
  const { data: auth, loading: authLoading, error: authError, refetch: refetchAuth } = useApiQuery<AuthStatusResponse>("/api/auth/status", { retry: 0 });
  const connected = auth?.lastfmConnected === true;
  const { data, loading, error, refetch } = useApiQuery<RecentScrobblesResponse>("/api/scrobbles/recent?page=1&limit=50", { enabled: connected, retry: 0, errorMessage: "Failed to load recent scrobbles" });
  const [moreItems, setMoreItems] = useState<RecentScrobble[]>([]);
  const [page, setPage] = useState(1);
  const [moreError, setMoreError] = useState<string | null>(null);
  const { mutate: fetchMore, loading: loadingMore } = useApiMutation<RecentScrobblesResponse, number>((nextPage) => ({ url: `/api/scrobbles/recent?page=${nextPage}&limit=50`, method: "GET" }));

  const items = data ? [...data.items, ...moreItems] : [];

  const loadMore = async () => {
    setMoreError(null);
    const next = await fetchMore(page + 1);
    if (next) { setMoreItems((current) => [...current, ...next.items]); setPage(next.page); }
    else setMoreError("Failed to load more scrobbles");
  };

  if (authLoading) return <LoadingState fullScreen message="Loading scrobbles..." />;
  if (authError && !auth) return <ErrorMessage fullPage message={authError} onRetry={() => void refetchAuth()} />;
  if (!connected) return <div className="min-h-screen flex items-center justify-center p-6"><div className="text-center max-w-md"><Icon name="radio" className="text-5xl text-primary mb-4" /><h1 className="text-2xl font-bold mb-2">Connect Last.fm</h1><p className="text-text-muted mb-6">Connect Last.fm in Settings to see your recent listening history.</p><a href="/settings" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-white">Connect Last.fm</a></div></div>;
  if (loading) return <LoadingState fullScreen message="Loading recent scrobbles..." />;
  if (error) return <ErrorMessage fullPage message={error} onRetry={() => void refetch()} />;

  return <main className="max-w-2xl mx-auto px-4 py-6 pb-28 md:pb-12 w-full">
    <header className="mb-6"><p className="text-xs uppercase tracking-widest text-primary font-bold">Last.fm history</p><h1 className="text-3xl font-bold">Recent Scrobbles</h1></header>
    {items.length === 0 ? <div className="text-center py-16"><Icon name="music_off" className="text-5xl text-text-muted mb-3" /><p className="text-text-muted">No confirmed scrobbles yet.</p></div> : <>
      <ul className="space-y-3">{items.map((item, index) => <TrackRow key={`${item.timestamp}-${item.artist}-${item.track}-${index}`} item={item} />)}</ul>
      {data && page < data.pages && <div className="mt-6 text-center"><button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="min-h-11 px-5 rounded-lg bg-primary text-white font-semibold disabled:opacity-50">{loadingMore ? "Loading..." : "See more"}</button></div>}
      {moreError && <div className="mt-4"><ErrorMessage message={moreError} onRetry={() => void loadMore()} /></div>}
    </>}
  </main>;
}
