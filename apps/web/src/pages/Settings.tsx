import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { apiFetch } from "../lib/api";
import { getApiErrorMessage } from "../lib/errors";
import type { AuthStatusResponse } from "@repo/shared";

export function Settings() {
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectingDiscogs, setConnectingDiscogs] = useState(false);
  const [connectingLastFm, setConnectingLastFm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAuthStatus = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiFetch("/api/auth/status");
        if (!response.ok) {
          throw new Error("Failed to fetch auth status");
        }
         
        const data: AuthStatusResponse = await response.json();
         
        setAuthStatus(data);
      } catch (err) {
         
        const error: unknown = err;
        setError(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    };

    void fetchAuthStatus();
  }, []);

  const handleConnectLastFm = async () => {
    try {
      setConnectingLastFm(true);
      setError(null);
      const response = await apiFetch("/api/auth/lastfm/start");
      if (!response.ok) {
        const message = await getApiErrorMessage(response, "Failed to start Last.fm authentication");
        throw new Error(message);
      }
      const data: { redirectUrl?: string } = await response.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } catch (err) {
      const error: unknown = err;
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setConnectingLastFm(false);
    }
  };

  const handleConnectDiscogs = async () => {
    try {
      setConnectingDiscogs(true);
      setError(null);
      const response = await apiFetch("/api/auth/discogs/start", {
        method: "POST",
      });
      if (!response.ok) {
        const message = await getApiErrorMessage(response, "Failed to start Discogs authentication");
        throw new Error(message);
      }
      const data: { redirectUrl?: string } = await response.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } catch (err) {
      const error: unknown = err;
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setConnectingDiscogs(false);
    }
  };

  const handleDisconnectLastFm = async () => {
    try {
      await apiFetch("/api/auth/lastfm/disconnect", { method: "POST" });
      setAuthStatus((prev) => (prev ? { ...prev, lastfmConnected: false } : null));
    } catch (err) {
       
      const error: unknown = err;
      setError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleDisconnectDiscogs = async () => {
    try {
      await apiFetch("/api/auth/discogs/disconnect", { method: "POST" });
      setAuthStatus((prev) => (prev ? { ...prev, discogsConnected: false } : null));
    } catch (err) {
       
      const error: unknown = err;
      setError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      {/* Header */}
      {/* <header className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-border-dark px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon name="arrow_back" className="text-primary cursor-pointer invisible" />
          <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        </div>
        <button className="text-primary font-medium text-sm invisible">Save</button>
      </header> */}

      <main className="flex-1 overflow-y-auto pb-24 md:pb-12">
        <div className="max-w-2xl mx-auto">
        <div className="px-4 pt-6 pb-2">
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        </div>

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
                <span className="text-primary font-bold">50%</span>
              </div>
              <div className="relative w-full h-6 flex items-center">
                <div className="absolute w-full h-1 bg-slate-200 dark:bg-border-dark rounded-full"></div>
                <div className="absolute w-1/2 h-1 bg-primary rounded-full"></div>
                <div className="absolute left-1/2 -translate-x-1/2 w-5 h-5 bg-white border-2 border-primary rounded-full shadow-lg cursor-pointer"></div>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Scrobble will be sent after half the track duration.
              </p>
            </div>

            {/* Toggles */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-border-dark">
              <div>
                <p className="text-sm font-medium">Auto-advance tracks</p>
                <p className="text-xs text-slate-500">Automatically move to the next track</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input defaultChecked className="sr-only peer" type="checkbox" />
                <div className="w-11 h-6 bg-slate-200 dark:bg-border-dark peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium">Notify on side completion</p>
                <p className="text-xs text-slate-500">Alert when the record side finishes</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input className="sr-only peer" type="checkbox" />
                <div className="w-11 h-6 bg-slate-200 dark:bg-border-dark peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
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
                disabled={loading || connectingDiscogs}
                className="text-xs font-semibold text-primary/80 hover:text-primary transition-colors disabled:opacity-50"
              >
                {authStatus?.discogsConnected
                  ? "Disconnect"
                  : connectingDiscogs
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
                disabled={loading || connectingLastFm}
                className="text-xs font-semibold text-primary/80 hover:text-primary transition-colors disabled:opacity-50"
              >
                {authStatus?.lastfmConnected
                  ? "Disconnect"
                  : connectingLastFm
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
              <span className="text-sm text-slate-500">v1.2.0</span>
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
            <br />
            Handcrafted with passion for analog sound.
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
