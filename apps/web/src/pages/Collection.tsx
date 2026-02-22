import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { apiFetch } from "../lib/api";
import type {
  AuthStatusResponse,
  DiscogsCollectionItem,
  DiscogsCollectionSortField,
  DiscogsCollectionResponse,
  DiscogsSearchItem,
  DiscogsSearchResponse,
} from "@repo/shared";

type SortField = DiscogsCollectionSortField;
const COLLECTION_QUERY_DEBOUNCE_MS = 300;

export function Collection() {
  const navigate = useNavigate();
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [items, setItems] = useState<DiscogsCollectionItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"collection" | "search">("collection");

  // Global Discogs search state
  const [searchItems, setSearchItems] = useState<DiscogsSearchItem[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchPages, setSearchPages] = useState(1);
  const [searching, setSearching] = useState(false);
  const [searchingMore, setSearchingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [debouncedCollectionQuery, setDebouncedCollectionQuery] = useState("");
  const collectionRequestIdRef = useRef(0);
  const collectionLoadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  const [sortBy, setSortBy] = useState<SortField>("dateAdded");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const loadCollection = useCallback(async (nextPage: number, append: boolean) => {
    const requestId = ++collectionRequestIdRef.current;

    try {
      if (requestId === collectionRequestIdRef.current) {
        setError(null);
        if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }
      }

      const params = new URLSearchParams({
        page: String(nextPage),
        sortBy,
        sortDir,
      });
      const trimmedQuery = debouncedCollectionQuery.trim();
      if (trimmedQuery) {
        params.set("query", trimmedQuery);
      }

      const response = await apiFetch(`/api/discogs/collection?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to load collection");
      }

       
      const data: DiscogsCollectionResponse = await response.json();
      if (requestId === collectionRequestIdRef.current) {
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setPage(data.page);
        setPages(data.pages);
      }
    } catch (err) {
       
      const error: unknown = err;
      if (requestId === collectionRequestIdRef.current) {
        setError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (requestId === collectionRequestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [debouncedCollectionQuery, sortBy, sortDir]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchStatus = async () => {
      try {
        setLoadingStatus(true);
        const response = await apiFetch("/api/auth/status", { signal: controller.signal });
        if (!response.ok) {
          throw new Error("Failed to fetch auth status");
        }
         
        const data: AuthStatusResponse = await response.json();
        setAuthStatus(data);
      } catch (err) {
        if (controller.signal.aborted) return;
        const error: unknown = err;
        setError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!controller.signal.aborted) setLoadingStatus(false);
      }
    };

    void fetchStatus();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (activeFilter !== "collection") {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setDebouncedCollectionQuery(query);
    }, COLLECTION_QUERY_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query, activeFilter]);

  useEffect(() => {
    if (!authStatus?.discogsConnected || activeFilter !== "collection") {
      return;
    }
    void loadCollection(1, false);
  }, [authStatus?.discogsConnected, activeFilter, debouncedCollectionQuery, sortBy, sortDir, loadCollection]);

  useEffect(() => {
    if (activeFilter !== "collection" || loading || loadingMore || page >= pages) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const sentinel = collectionLoadMoreSentinelRef.current;
    if (!sentinel) {
      return;
    }

    let requesting = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (!firstEntry?.isIntersecting || requesting) {
          return;
        }

        requesting = true;
        void loadCollection(page + 1, true).finally(() => {
          requesting = false;
        });
      },
      {
        root: null,
        rootMargin: "300px 0px",
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [activeFilter, loading, loadingMore, page, pages, loadCollection]);

  const runSearch = useCallback(
    async (nextPage: number, append: boolean) => {
      const trimmed = query.trim();
      if (!trimmed) return;

      try {
        setSearchError(null);
        setHasSearched(true);
        if (append) {
          setSearchingMore(true);
        } else {
          setSearching(true);
        }

        const response = await apiFetch(
          `/api/discogs/search?query=${encodeURIComponent(trimmed)}&page=${nextPage}`
        );
        if (!response.ok) {
          throw new Error("Failed to search Discogs");
        }
         
        const data: DiscogsSearchResponse = await response.json();
        setSearchItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setSearchPage(data.page);
        setSearchPages(data.pages);
      } catch (err) {
         
        const error: unknown = err;
        setSearchError(error instanceof Error ? error.message : String(error));
      } finally {
        setSearching(false);
        setSearchingMore(false);
      }
    },
    [query]
  );

  const switchToSearch = () => {
    setActiveFilter("search");
    setQuery("");
    setSearchItems([]);
    setHasSearched(false);
    setSearchError(null);
  };

  const switchToCollection = () => {
    setActiveFilter("collection");
    setQuery("");
  };

  const canLoadMoreCollection = page < pages;
  const canLoadMoreSearch = searchPage < searchPages;

  if (!authStatus?.discogsConnected && !loadingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-4">
            <Icon name="library_music" className="text-4xl" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Connect Discogs</h2>
          <p className="text-slate-500 dark:text-primary/60 mb-6">
            Connect your Discogs account to access your vinyl collection.
          </p>
          <button
            onClick={() => {
              void navigate("/settings");
            }}
            className="bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-lg transition-colors shadow-lg shadow-primary/20"
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header & Search */}
      <header className="sticky top-0 z-30 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-200 dark:border-accent-dark">
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-2">
        {/* Filter Toggle */}
        <div className="flex bg-gray-100 dark:bg-accent-dark p-1 rounded-xl mb-4">
          <button
            onClick={switchToCollection}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeFilter === "collection"
                ? "bg-white dark:bg-background-dark shadow-sm text-primary"
                : "text-text-muted hover:text-white"
            }`}
          >
            My Collection
          </button>
          <button
            onClick={switchToSearch}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeFilter === "search"
                ? "bg-white dark:bg-background-dark shadow-sm text-primary"
                : "text-text-muted hover:text-white"
            }`}
          >
            Global Search
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <label className="flex items-center bg-gray-100 dark:bg-accent-dark rounded-xl px-4 py-3 focus-within:ring-2 focus-within:ring-primary transition-all">
            <Icon name="search" className="text-text-muted mr-3" />
            <input
              className="bg-transparent border-none focus:ring-0 w-full text-base placeholder:text-text-muted p-0 outline-none"
              placeholder={
                activeFilter === "collection" ? "Search collection..." : "Search Discogs..."
              }
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && activeFilter === "search") {
                  void runSearch(1, false);
                }
              }}
            />
            {activeFilter === "search" && query.trim().length > 0 && (
              <button
                onClick={() => void runSearch(1, false)}
                className="ml-2 p-1 rounded-full hover:bg-primary/10 text-primary transition-colors"
                aria-label="Search Discogs"
              >
                <Icon name="arrow_forward" className="text-sm" />
              </button>
            )}
          </label>
        </div>

        {/* Sort controls — collection mode only */}
        {activeFilter === "collection" && (
          <div className="flex items-center gap-2 pb-2 md:pb-3">
            <span className="text-xs text-text-muted shrink-0">Sort:</span>
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar flex-1">
              {(["artist", "title", "year", "dateAdded"] as SortField[]).map((field) => {
                const labels: Record<SortField, string> = {
                  artist: "Artist",
                  title: "Title",
                  year: "Year",
                  dateAdded: "Added",
                };
                return (
                  <button
                    key={field}
                    onClick={() => setSortBy(field)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      sortBy === field
                        ? "bg-primary text-white"
                        : "bg-gray-100 dark:bg-accent-dark text-gray-600 dark:text-white"
                    }`}
                  >
                    {labels[field]}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="shrink-0 p-1.5 rounded-full bg-gray-100 dark:bg-accent-dark text-gray-600 dark:text-white hover:bg-primary/10 hover:text-primary transition-colors"
              aria-label={sortDir === "asc" ? "Sort descending" : "Sort ascending"}
            >
              <Icon name={sortDir === "asc" ? "arrow_upward" : "arrow_downward"} className="text-sm" />
            </button>
          </div>
        )}
        </div>
      </header>

      {/* Collection Grid */}
      <main className="flex-1 py-6 mb-20 md:mb-0">
        <div className="max-w-5xl mx-auto px-4">
        {activeFilter === "collection" ? (
          /* ── My Collection ── */
          loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Icon name="sync" className="text-4xl text-primary animate-spin mb-2" />
                <p className="text-sm text-slate-500">Loading collection...</p>
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-500">{error}</p>
            </div>
          ) : items.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                {items.map((item) => (
                  <div
                    key={item.instanceId}
                    className="group relative cursor-pointer"
                    onClick={() => {
                      void navigate(`/release/${item.releaseId}`);
                    }}
                  >
                    <div className="aspect-square w-full rounded-lg overflow-hidden vinyl-shadow bg-surface-dark mb-3 relative">
                      {item.thumbUrl ? (
                        <img
                          alt={`${item.title} cover`}
                          className="w-full h-full object-cover"
                          src={item.thumbUrl}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-accent-dark/50">
                          <Icon name="album" className="text-4xl text-text-muted" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button className="bg-primary text-white p-3 rounded-full shadow-lg">
                          <Icon name="play_arrow" />
                        </button>
                      </div>
                    </div>
                    <h3 className="font-bold text-sm truncate">{item.title}</h3>
                    <p className="text-text-muted text-xs truncate">{item.artist}</p>
                  </div>
                ))}
              </div>

              {canLoadMoreCollection && !loading && (
                <>
                  <div ref={collectionLoadMoreSentinelRef} data-testid="collection-load-more-sentinel" className="h-1" />
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={() => {
                        void loadCollection(page + 1, true);
                      }}
                      disabled={loadingMore}
                      className="bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-lg transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
                    >
                      {loadingMore ? "Loading..." : "Load more"}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <Icon name="search_off" className="text-4xl text-text-muted mb-2" />
              <p className="text-sm text-slate-500">No matches found</p>
            </div>
          )
        ) : (
          /* ── Global Discogs Search ── */
          <>
            {searching && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Icon name="sync" className="text-4xl text-primary animate-spin mb-2" />
                  <p className="text-sm text-slate-500">Searching Discogs...</p>
                </div>
              </div>
            )}

            {searchError && !searching && (
              <div className="text-center py-12">
                <p className="text-red-500">{searchError}</p>
              </div>
            )}

            {!searching && !hasSearched && (
              <div className="text-center py-12">
                <Icon name="travel_explore" className="text-4xl text-text-muted mb-2" />
                <p className="text-sm text-slate-500">
                  Search the Discogs database for a release.
                </p>
              </div>
            )}

            {!searching && searchItems.length > 0 && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                  {searchItems.map((item) => (
                    <div
                      key={item.instanceId}
                      className="group relative cursor-pointer"
                      onClick={() => {
                        void navigate(`/release/${item.releaseId}`);
                      }}
                    >
                      <div className="aspect-square w-full rounded-lg overflow-hidden vinyl-shadow bg-surface-dark mb-3 relative">
                        {item.thumbUrl ? (
                          <img
                            alt={`${item.title} cover`}
                            className="w-full h-full object-cover"
                            src={item.thumbUrl}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-accent-dark/50">
                            <Icon name="album" className="text-4xl text-text-muted" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button className="bg-primary text-white p-3 rounded-full shadow-lg">
                            <Icon name="play_arrow" />
                          </button>
                        </div>
                      </div>
                      <h3 className="font-bold text-sm truncate">{item.title}</h3>
                      <p className="text-text-muted text-xs truncate">
                        {item.artist}
                        {item.year ? ` · ${item.year}` : ""}
                      </p>
                    </div>
                  ))}
                </div>

                {canLoadMoreSearch && (
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={() => {
                        void runSearch(searchPage + 1, true);
                      }}
                      disabled={searchingMore}
                      className="bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-lg transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
                    >
                      {searchingMore ? "Loading..." : "Load more"}
                    </button>
                  </div>
                )}
              </>
            )}

            {!searching && hasSearched && searchItems.length === 0 && !searchError && (
              <div className="text-center py-12">
                <Icon name="search_off" className="text-4xl text-text-muted mb-2" />
                <p className="text-sm text-slate-500">No results found. Try another search.</p>
              </div>
            )}
          </>
        )}
        </div>
      </main>
    </>
  );
}
