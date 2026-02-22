import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { getErrorMessage, getApiErrorMessage } from "../lib/errors";
import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import type { AuthStatusResponse } from "@repo/shared";

export function Home() {
  const navigate = useNavigate();
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectingDiscogs, setConnectingDiscogs] = useState(false);
  const [connectingLastFm, setConnectingLastFm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const fetchStatus = async () => {
      try {
        setError(null);
        const response = await apiFetch("/api/auth/status", { signal: controller.signal });
        if (!response.ok) throw new Error("Failed to fetch auth status");
         
        const data: AuthStatusResponse = await response.json();
        setAuthStatus(data);
        if (data.discogsConnected) {
          void navigate("/collection");
          return;
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const error: unknown = err;
        console.error(getErrorMessage(error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void fetchStatus();
    return () => controller.abort();
  }, [navigate]);

  const handleConnectDiscogs = async () => {
    try {
      setConnectingDiscogs(true);
      setError(null);
      const response = await apiFetch("/api/auth/discogs/start", { method: "POST" });
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
      setError(getErrorMessage(error));
    } finally {
      setConnectingDiscogs(false);
    }
  };

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
      setError(getErrorMessage(error));
    } finally {
      setConnectingLastFm(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="sync" className="text-4xl text-primary animate-spin" />
      </div>
    );
  }

  // Navigation to /collection has been triggered; render nothing while redirect resolves
  if (authStatus?.discogsConnected) {
    return null;
  }

  return (
    <>
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-primary/10 bg-background-light dark:bg-background-dark/50 backdrop-blur-md sticky top-0 z-10">
        <button className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-primary/10 transition-colors invisible">
          <Icon name="arrow_back" className="text-2xl" />
        </button>
        <h1 className="text-lg font-bold tracking-tight">Get Started</h1>
        <div className="w-10" /> {/* Spacer */}
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-8">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-4">
            <Icon name="album" className="text-4xl" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">Connect your music services</h2>
          <p className="text-slate-500 dark:text-primary/60 text-base">
            To start scrobbling, we need to link your favorite music platforms.
          </p>
        </div>

        {/* Service Cards */}
        <div className="space-y-4">
          {/* Discogs Card */}
          <div className="group relative overflow-hidden flex flex-col items-stretch justify-start rounded-xl border border-primary/10 bg-white dark:bg-white/5 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="aspect-[21/9] w-full bg-primary/5 overflow-hidden">
              <div
                className="w-full h-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                style={{
                  backgroundImage:
                    "url('https://lh3.googleusercontent.com/aida-public/AB6AXuC1UQE9jj9HfqVCokd_yBTJ4BFRf_A0_CagVHhSDyLcdnigvz4pTyqNHjm1lUXHHjwPr0J0Sld8ZeL_orcvBQZ7hjZhbg1T-B-oMMCVoz3aH2n5Ajr5IoOgju6FJpfBGm6uxDEwJxJhjWohhaVNNFZsqTNZYh71wozKjTCK87I2iDNGF9lZQMHjkK7v0ZljpI4kTtbvdZPvyq5okrfHJX_YaxYo0GbNzIi54NGm4T4C7XApkvFjsrypVCCpuPNBp7AngbFFmGVzu4KN')",
                }}
              />
            </div>
            <div className="p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon name="database" className="text-primary text-xl" />
                    <h3 className="text-xl font-bold tracking-tight">Connect Discogs</h3>
                  </div>
                  <p className="text-slate-600 dark:text-primary/40 leading-relaxed text-sm">
                    Access your vinyl collection and search the global database for accurate
                    metadata and cover art.
                  </p>
                </div>
              </div>
              <button
                onClick={() => void handleConnectDiscogs()}
                disabled={loading || connectingDiscogs}
                className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-lg transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                <span className="truncate">
                  {authStatus?.discogsConnected
                    ? "✓ Connected"
                    : connectingDiscogs
                      ? "Connecting Discogs..."
                      : "Connect Discogs"}
                </span>
                <Icon name="open_in_new" className="text-sm" />
              </button>
            </div>
          </div>

          {/* Last.fm Card */}
          <div className="group relative overflow-hidden flex flex-col items-stretch justify-start rounded-xl border border-primary/10 bg-white dark:bg-white/5 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="aspect-[21/9] w-full bg-primary/5 overflow-hidden">
              <div
                className="w-full h-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                style={{
                  backgroundImage:
                    "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDOQHUkv4cO9sK58bvG1TFAhCoaM3HvVEY3Ajgr-nY3hifc4eK0StmHyPO3K-L7aEv6mTwAE64N3nsKzMqpj2pHaE31sX7eRIYW1kAdePg84gOJfUzYdAUAvr-iM__ZTaFI6M-8vC9lpQpInbmHxyVkE9N7yexE8FT_fcNeabUDwqwlKH3GrHxw5dWo-lZyQEkIHt2p-r0xzH1UGDtCgCfkI9bpwyY6Dcl9eB6AC0BkkQdLiQ9yHt_LGIBny9AsBPGJPtRsJoCw1D_i')",
                }}
              />
            </div>
            <div className="p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon name="bar_chart" className="text-primary text-xl" />
                    <h3 className="text-xl font-bold tracking-tight">Connect Last.fm</h3>
                  </div>
                  <p className="text-slate-600 dark:text-primary/40 leading-relaxed text-sm">
                    Enable scrobbling to track your listening habits, build your music profile,
                    and get recommendations.
                  </p>
                </div>
              </div>
              <button
                onClick={() => void handleConnectLastFm()}
                disabled={loading || connectingLastFm}
                className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-lg transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                <span className="truncate">
                  {authStatus?.lastfmConnected
                    ? "✓ Connected"
                    : connectingLastFm
                      ? "Connecting Last.fm..."
                      : "Connect Last.fm"}
                </span>
                <Icon name="open_in_new" className="text-sm" />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-6 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Privacy Note */}
        <footer className="mt-12 mb-8 text-center px-6">
          <div className="flex items-center justify-center gap-2 text-primary/40 mb-2">
            <Icon name="lock" className="text-sm" />
            <span className="text-xs font-medium uppercase tracking-widest">Privacy First</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-primary/30 leading-relaxed max-w-sm mx-auto">
            We value your privacy. Your login credentials are never stored; we use secure OAuth
            tokens to communicate with services.
          </p>
        </footer>
      </main>
    </>
  );
}
