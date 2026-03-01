import { useState } from "react";
import { Icon } from "../components/Icon";
import { ErrorMessage } from "../components/ErrorMessage";
import { LoadingState } from "../components/LoadingState";
import { useApiMutation } from "../hooks/useApiMutation";
import { useApiQuery } from "../hooks/useApiQuery";
import {
  getScrobbleDelay,
  setScrobbleDelay,
  getNotifyOnSideCompletion,
  setNotifyOnSideCompletion,
} from "../lib/settings";
import type { AuthStatusResponse } from "@repo/shared";

export function Settings() {
  // Use authData directly instead of syncing to local state
  const [optimisticAuthStatus, setOptimisticAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [scrobbleDelayPercent, setScrobbleDelayPercent] = useState(() => getScrobbleDelay());
  const [notifyOnSideCompletion, setNotifyOnSideCompletionState] = useState(() =>
    getNotifyOnSideCompletion()
  );

  const {
    data: authData,
    loading,
    error: authError,
    refetch: refetchAuth,
  } = useApiQuery<AuthStatusResponse>("/api/auth/status", {
    errorMessage: "Failed to fetch auth status",
    retry: 0,
  });

  // Use optimistic updates for auth status, fall back to API data
  const authStatus = optimisticAuthStatus ?? authData;

  const {
    mutate: connectLastFm,
    loading: connectingLastFm,
    error: connectLastFmError,
    reset: resetConnectLastFmError,
  } = useApiMutation<{ redirectUrl?: string }, void>(
    () => ({ url: "/api/auth/lastfm/start", method: "GET" }),
    {
      onSuccess: (data) => {
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
        } else {
          setActionError("Last.fm redirect was not provided.");
        }
      },
    }
  );

  const {
    mutate: connectDiscogs,
    loading: connectingDiscogs,
    error: connectDiscogsError,
    reset: resetConnectDiscogsError,
  } = useApiMutation<{ redirectUrl?: string }, void>(
    () => ({ url: "/api/auth/discogs/start", method: "POST" }),
    {
      onSuccess: (data) => {
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
        } else {
          setActionError("Discogs redirect was not provided.");
        }
      },
    }
  );

  const {
    mutate: disconnectLastFm,
    loading: disconnectingLastFm,
    error: disconnectLastFmError,
    reset: resetDisconnectLastFmError,
  } = useApiMutation<{ success: boolean }, void>(
    () => ({ url: "/api/auth/lastfm/disconnect", method: "POST" }),
    {
      onSuccess: () => {
        setOptimisticAuthStatus((prev) => {
          const base = prev ?? authData ?? { lastfmConnected: false, discogsConnected: false };
          return { ...base, lastfmConnected: false };
        });
      },
    }
  );

  const {
    mutate: disconnectDiscogs,
    loading: disconnectingDiscogs,
    error: disconnectDiscogsError,
    reset: resetDisconnectDiscogsError,
  } = useApiMutation<{ success: boolean }, void>(
    () => ({ url: "/api/auth/discogs/disconnect", method: "POST" }),
    {
      onSuccess: () => {
        setOptimisticAuthStatus((prev) => {
          const base = prev ?? authData ?? { lastfmConnected: false, discogsConnected: false };
          return { ...base, discogsConnected: false };
        });
      },
    }
  );

  const handleConnectLastFm = async () => {
    setActionError(null);
    resetConnectLastFmError();
    await connectLastFm(undefined);
  };

  const handleConnectDiscogs = async () => {
    setActionError(null);
    resetConnectDiscogsError();
    await connectDiscogs(undefined);
  };

  const handleDisconnectLastFm = async () => {
    setActionError(null);
    resetDisconnectLastFmError();
    await disconnectLastFm(undefined);
  };

  const handleDisconnectDiscogs = async () => {
    setActionError(null);
    resetDisconnectDiscogsError();
    await disconnectDiscogs(undefined);
  };

  const error =
    actionError ??
    authError ??
    connectLastFmError ??
    connectDiscogsError ??
    disconnectLastFmError ??
    disconnectDiscogsError;

  if (loading) {
    return <LoadingState fullScreen message="Loading settings..." />;
  }

  if (authError && !authStatus) {
    return (
      <ErrorMessage
        fullPage
        message={authError}
        onRetry={() => void refetchAuth()}
      />
    );
  }


  return (
    <>
      <main className="flex-1 overflow-y-auto pb-24 md:pb-12">
        <div className="max-w-2xl mx-auto">
        <div className="px-4 pt-6 pb-2">
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        </div>

        {error && (
          <div className="px-4 mt-4">
            <ErrorMessage message={error} />
          </div>
        )}

        {/* Scrobbling Section */}
        <section className="mt-6 px-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3 px-1">
            Scrobbling
          </h2>
          <div className="bg-white dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-border-dark overflow-hidden">
            {/* Scrobble Delay Slider */}
            <div className="p-4 border-b border-slate-100 dark:border-border-dark">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-medium">Scrobble Delay</span>
                <span className="text-primary font-bold">{scrobbleDelayPercent}%</span>
              </div>
              <div className="relative w-full h-6 flex items-center">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={scrobbleDelayPercent}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    setScrobbleDelayPercent(value);
                    setScrobbleDelay(value);
                  }}
                  className="absolute w-full h-1 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, rgb(var(--color-primary)) 0%, rgb(var(--color-primary)) ${scrobbleDelayPercent}%, rgb(226, 232, 240) ${scrobbleDelayPercent}%, rgb(226, 232, 240) 100%)`
                  }}
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Scrobble will be sent after {scrobbleDelayPercent}% of track duration.
              </p>
            </div>

            {/* Toggles */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-border-dark">
              <div>
                <p className="text-sm font-medium">Auto-advance tracks</p>
                <p className="text-xs text-slate-500">Automatically move to the next track</p>
              </div>
              <label className="relative inline-flex items-center">
                <input defaultChecked disabled className="sr-only peer" type="checkbox" />
                <div className="w-11 h-6 bg-slate-200 dark:bg-border-dark rounded-full peer peer-checked:after:translate-x-full peer-checked:rtl:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium">Notify on side completion</p>
                <p className="text-xs text-slate-500">Alert when the record side finishes</p>
              </div>
              <label className="relative inline-flex items-center">
                <input
                  checked={notifyOnSideCompletion}
                  onChange={(e) => {
                    const value = e.target.checked;
                    setNotifyOnSideCompletionState(value);
                    setNotifyOnSideCompletion(value);
                  }}
                  className="sr-only peer"
                  type="checkbox"
                />
                <div className="w-11 h-6 bg-slate-200 dark:bg-border-dark rounded-full peer peer-checked:after:translate-x-full peer-checked:rtl:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>
        </section>

        {/* Accounts Section */}
        <section className="mt-8 px-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3 px-1">
            Accounts
          </h2>
          <div className="space-y-3">
            {/* Discogs Account */}
            <div className="bg-white dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-border-dark p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center">
                  <Icon name="album" className="text-white text-xl" />
                </div>
                <div>
                  <p className="text-sm font-bold">Discogs</p>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        authStatus?.discogsConnected ? "bg-green-500" : "bg-slate-400"
                      }`}
                    ></span>
                    <p className="text-xs text-slate-500">
                      {authStatus?.discogsConnected ? "Connected" : "Not connected"}
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() =>
                  void (authStatus?.discogsConnected
                    ? handleDisconnectDiscogs()
                    : handleConnectDiscogs())
                }
                aria-label={authStatus?.discogsConnected ? "Disconnect Discogs" : "Connect Discogs"}
                disabled={loading || connectingDiscogs || disconnectingDiscogs}
                className="text-xs font-semibold text-primary/80 hover:text-primary transition-colors disabled:opacity-50"
              >
                {authStatus?.discogsConnected
                  ? "Disconnect"
                  : connectingDiscogs || disconnectingDiscogs
                    ? "Connecting..."
                    : "Connect"}
              </button>
            </div>

            {/* Last.fm Account */}
            <div className="bg-white dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-border-dark p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#d51007] flex items-center justify-center">
                  <Icon name="radio" className="text-white text-xl" />
                </div>
                <div>
                  <p className="text-sm font-bold">Last.fm</p>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        authStatus?.lastfmConnected ? "bg-green-500" : "bg-slate-400"
                      }`}
                    ></span>
                    <p className="text-xs text-slate-500">
                      {authStatus?.lastfmConnected ? "Connected" : "Not connected"}
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() =>
                  void (authStatus?.lastfmConnected
                    ? handleDisconnectLastFm()
                    : handleConnectLastFm())
                }
                aria-label={authStatus?.lastfmConnected ? "Disconnect Last.fm" : "Connect Last.fm"}
                disabled={loading || connectingLastFm || disconnectingLastFm}
                className="text-xs font-semibold text-primary/80 hover:text-primary transition-colors disabled:opacity-50"
              >
                {authStatus?.lastfmConnected
                  ? "Disconnect"
                  : connectingLastFm || disconnectingLastFm
                    ? "Connecting..."
                    : "Connect"}
              </button>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section className="mt-8 px-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3 px-1">
            About
          </h2>
          <div className="bg-white dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-border-dark overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-border-dark">
              <span className="text-sm font-medium">Version</span>
              <span className="text-sm text-slate-500">{__APP_VERSION__}</span>
            </div>
            <a
              className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              href="https://github.com/rick-roche/now-spinning"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="flex items-center gap-2">
                <Icon name="code" className="text-sm" />
                <span className="text-sm font-medium">View on GitHub</span>
              </div>
              <Icon name="open_in_new" className="text-slate-400 text-sm" />
            </a>
          </div>
          <p className="text-center text-[10px] text-slate-500 mt-6 leading-relaxed">
            Designed for vinyl enthusiasts.
          </p>
        </section>

        {error && (
          <div className="mt-4 mx-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm">
            {error}
          </div>
        )}
        </div>{/* end max-width wrapper */}
      </main>
    </>
  );
}
