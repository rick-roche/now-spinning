import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CollectionSkeleton } from "../components/CollectionSkeleton";
import { ErrorMessage } from "../components/ErrorMessage";
import { Icon } from "../components/Icon";
import { useApiMutation } from "../hooks/useApiMutation";
import { useApiQuery } from "../hooks/useApiQuery";
import type {
  AuthStatusResponse,
  DiscogsCollectionItem,
  DiscogsCollectionSortField,
  DiscogsCollectionResponse,
  DiscogsSearchItem,
  DiscogsSearchResponse,
} from "@repo/shared";
import { DiscogsCollectionQuerySchema, DiscogsSearchQuerySchema } from "@repo/shared";

type SortField = DiscogsCollectionSortField;
const DEFAULT_SORT_BY: SortField = "dateAdded";
const DEFAULT_SORT_DIR: "asc" | "desc" = "desc";
const SORT_FIELDS: SortField[] = ["artist", "title", "year", "dateAdded"];

export function Collection() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialFilter: "collection" | "search" =
    searchParams.get("filter") === "search" || location.pathname === "/search"
      ? "search"
      : "collection";
  const initialQuery = searchParams.get("query") ?? "";
  const initialSortByParam = searchParams.get("sortBy");
  const initialSortBy = SORT_FIELDS.includes(initialSortByParam as SortField)
    ? (initialSortByParam as SortField)
    : DEFAULT_SORT_BY;
  const initialSortDir = searchParams.get("sortDir") === "asc" ? "asc" : DEFAULT_SORT_DIR;
  const {
    data: authStatus,
    loading: loadingStatus,
    error: authError,
    refetch: refetchAuth,
  } = useApiQuery<AuthStatusResponse>("/api/auth/status", {
    errorMessage: "Failed to fetch auth status",
    retry: 0,
  });
  const [items, setItems] = useState<DiscogsCollectionItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [submittedCollectionQuery, setSubmittedCollectionQuery] = useState(
    initialFilter === "collection" ? initialQuery : ""
  );
  const [activeFilter, setActiveFilter] = useState<"collection" | "search">(initialFilter);

  // Global Discogs search state
  const [searchItems, setSearchItems] = useState<DiscogsSearchItem[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchPages, setSearchPages] = useState(1);
  const [searching, setSearching] = useState(false);
  const [searchingMore, setSearchingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(initialFilter === "search" && initialQuery.length > 0);
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState(
    initialFilter === "search" ? initialQuery : ""
  );
  const collectionRequestIdRef = useRef(0);
  const searchRequestIdRef = useRef(0);
  const collectionLoadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const lastParamsKeyRef = useRef<string | null>(null);

  const [sortBy, setSortBy] = useState<SortField>(initialSortBy);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initialSortDir);

  const syncSearchParams = useCallback(
    (
      nextFilter: "collection" | "search",
      nextQuery: string,
      nextSortBy: SortField,
      nextSortDir: "asc" | "desc"
    ) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        params.set("filter", nextFilter);

        if (nextQuery) {
          params.set("query", nextQuery);
        } else {
          params.delete("query");
        }

        if (nextSortBy !== DEFAULT_SORT_BY) {
          params.set("sortBy", nextSortBy);
        } else {
          params.delete("sortBy");
        }

        if (nextSortDir !== DEFAULT_SORT_DIR) {
          params.set("sortDir", nextSortDir);
        } else {
          params.delete("sortDir");
        }

        return params.toString() === prev.toString() ? prev : params;
      }, { replace: true });
    },
    [setSearchParams]
  );

  const collectionRequestConfig = useCallback(
    (vars: { page: number; query: string; sortBy: SortField; sortDir: "asc" | "desc" }) => {
      const params = new URLSearchParams({
        page: String(vars.page),
        sortBy: vars.sortBy,
        sortDir: vars.sortDir,
      });

      if (vars.query) {
        params.set("query", vars.query);
      }

      return {
        url: `/api/discogs/collection?${params.toString()}`,
        method: "GET",
      };
    },
    []
  );

  const { mutate: fetchCollection } = useApiMutation<
    DiscogsCollectionResponse,
    { page: number; query: string; sortBy: SortField; sortDir: "asc" | "desc" }
  >(collectionRequestConfig);

  const searchRequestConfig = useCallback(
    (vars: { page: number; query: string }) => ({
      url: `/api/discogs/search?query=${encodeURIComponent(vars.query)}&page=${vars.page}`,
      method: "GET",
    }),
    []
  );

  const { mutate: fetchSearch } = useApiMutation<
    DiscogsSearchResponse,
    { page: number; query: string }
  >(searchRequestConfig);

  const loadCollection = useCallback(
    async (nextPage: number, append: boolean, collectionQuery: string, collectionSortBy: SortField, collectionSortDir: "asc" | "desc") => {
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

        const trimmedQuery = collectionQuery.trim();
        const queryResult = DiscogsCollectionQuerySchema.safeParse({
          page: nextPage,
          query: trimmedQuery,
          sortBy: collectionSortBy,
          sortDir: collectionSortDir,
        });

        if (!queryResult.success) {
          throw new Error("Invalid collection filter settings");
        }

        const data = await fetchCollection({
          page: queryResult.data.page,
          query: queryResult.data.query,
          sortBy: queryResult.data.sortBy,
          sortDir: queryResult.data.sortDir,
        });

        if (!data) {
          throw new Error("Failed to load collection");
        }

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
  }, [fetchCollection]);

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
        void loadCollection(page + 1, true, submittedCollectionQuery, sortBy, sortDir).finally(() => {
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
  }, [activeFilter, loading, loadingMore, page, pages, loadCollection, submittedCollectionQuery, sortBy, sortDir]);

  const runSearch = useCallback(
    async (nextPage: number, append: boolean, searchQuery: string) => {
      const trimmed = searchQuery.trim();
      if (!trimmed) return;

      const requestId = ++searchRequestIdRef.current;

      try {
        if (requestId === searchRequestIdRef.current) {
          setSearchError(null);
          setHasSearched(true);
          if (append) {
            setSearchingMore(true);
          } else {
            setSearching(true);
          }
        }

        const queryResult = DiscogsSearchQuerySchema.safeParse({
          query: trimmed,
          page: nextPage,
        });

        if (!queryResult.success) {
          if (requestId === searchRequestIdRef.current) {
            setSearchError(queryResult.error.issues[0]?.message ?? "Search query is required");
            setSearching(false);
            setSearchingMore(false);
          }
          return;
        }

        const data = await fetchSearch({
          query: queryResult.data.query,
          page: queryResult.data.page ?? nextPage,
        });
        if (!data) {
          throw new Error("Failed to search Discogs");
        }

        if (requestId === searchRequestIdRef.current) {
          setSearchItems((prev) => (append ? [...prev, ...data.items] : data.items));
          setSearchPage(data.page);
          setSearchPages(data.pages);
        }
      } catch (err) {
        const error: unknown = err;
        if (requestId === searchRequestIdRef.current) {
          setSearchError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setSearching(false);
          setSearchingMore(false);
        }
      }
    },
    [fetchSearch]
  );

  const clearGlobalSearch = useCallback(
    (nextSortBy: SortField, nextSortDir: "asc" | "desc") => {
      setQuery("");
      setSubmittedSearchQuery("");
      setSearchItems([]);
      setSearchPage(1);
      setSearchPages(1);
      setSearchError(null);
      setHasSearched(false);
      syncSearchParams("search", "", nextSortBy, nextSortDir);
    },
    [syncSearchParams]
  );

  const submitSearch = useCallback(
    (overrides?: { sortBy?: SortField; sortDir?: "asc" | "desc" }) => {
      const nextSortBy = overrides?.sortBy ?? sortBy;
      const nextSortDir = overrides?.sortDir ?? sortDir;
      const trimmedQuery = query.trim();

      if (activeFilter === "search" && !trimmedQuery) {
        clearGlobalSearch(nextSortBy, nextSortDir);
        return;
      }

      if (activeFilter === "collection") {
        setSubmittedCollectionQuery(trimmedQuery);
        if (nextSortBy !== sortBy) setSortBy(nextSortBy);
        if (nextSortDir !== sortDir) setSortDir(nextSortDir);
        syncSearchParams("collection", trimmedQuery, nextSortBy, nextSortDir);
      } else {
        setSubmittedSearchQuery(trimmedQuery);
        syncSearchParams("search", trimmedQuery, nextSortBy, nextSortDir);
      }
    },
    [activeFilter, clearGlobalSearch, query, sortBy, sortDir, syncSearchParams]
  );

  useEffect(() => {
    const paramsKey = searchParams.toString();
    if (lastParamsKeyRef.current === paramsKey) {
      return;
    }
    lastParamsKeyRef.current = paramsKey;

    const paramFilter = searchParams.get("filter");
    const pathnameFilter = location.pathname === "/search" ? "search" : null;
    const nextFilter: "collection" | "search" =
      paramFilter === "search" || pathnameFilter === "search" ? "search" : "collection";
    const nextQuery = searchParams.get("query") ?? "";
    const paramSortBy = searchParams.get("sortBy");
    const nextSortBy = SORT_FIELDS.includes(paramSortBy as SortField)
      ? (paramSortBy as SortField)
      : DEFAULT_SORT_BY;
    const nextSortDir = searchParams.get("sortDir") === "asc" ? "asc" : DEFAULT_SORT_DIR;

    if (!paramFilter && pathnameFilter === "search") {
      syncSearchParams("search", nextQuery, nextSortBy, nextSortDir);
    }

    if (nextFilter !== activeFilter) {
      setActiveFilter(nextFilter);
    }
    if (nextQuery !== query) {
      setQuery(nextQuery);
    }
    if (nextFilter === "collection" && nextQuery !== submittedCollectionQuery) {
      setSubmittedCollectionQuery(nextQuery);
    }
    if (nextFilter === "search" && nextQuery !== submittedSearchQuery) {
      setSubmittedSearchQuery(nextQuery);
    }
    if (nextSortBy !== sortBy) {
      setSortBy(nextSortBy);
    }
    if (nextSortDir !== sortDir) {
      setSortDir(nextSortDir);
    }
    if (nextFilter === "search") {
      setHasSearched(nextQuery.trim().length > 0);
      if (!nextQuery.trim()) {
        setSearchItems([]);
        setSearchPage(1);
        setSearchPages(1);
        setSearchError(null);
      }
    } else {
      if (submittedSearchQuery) {
        setSubmittedSearchQuery("");
      }
      if (hasSearched) {
        setHasSearched(false);
      }
      if (searchItems.length) {
        setSearchItems([]);
      }
      if (searchPage !== 1) {
        setSearchPage(1);
      }
      if (searchPages !== 1) {
        setSearchPages(1);
      }
      if (searchError) {
        setSearchError(null);
      }
    }
  }, [activeFilter, hasSearched, location.pathname, query, searchError, searchItems.length, searchPage, searchPages, searchParams, sortBy, sortDir, submittedCollectionQuery, submittedSearchQuery, syncSearchParams]);

  useEffect(() => {
    if (!authStatus?.discogsConnected || activeFilter !== "collection") {
      return;
    }
    void loadCollection(1, false, submittedCollectionQuery, sortBy, sortDir);
  }, [authStatus?.discogsConnected, activeFilter, loadCollection, submittedCollectionQuery, sortBy, sortDir]);

  useEffect(() => {
    if (!authStatus?.discogsConnected || activeFilter !== "search") {
      return;
    }
    if (!submittedSearchQuery.trim()) {
      return;
    }
    void runSearch(1, false, submittedSearchQuery);
  }, [authStatus?.discogsConnected, activeFilter, runSearch, submittedSearchQuery]);

  const switchToCollection = () => {
    setActiveFilter("collection");
    setQuery("");
    setSubmittedCollectionQuery("");
    setSubmittedSearchQuery("");
    setSearchItems([]);
    setSearchPage(1);
    setSearchPages(1);
    setSearchError(null);
    setHasSearched(false);
    syncSearchParams("collection", "", sortBy, sortDir);
  };

  const switchToSearch = () => {
    setActiveFilter("search");
    setQuery("");
    setSubmittedCollectionQuery("");
    setSubmittedSearchQuery("");
    setSearchItems([]);
    setSearchPage(1);
    setSearchPages(1);
    setSearchError(null);
    setHasSearched(false);
    syncSearchParams("search", "", sortBy, sortDir);
  };

  const canLoadMoreCollection = page < pages;
  const canLoadMoreSearch = searchPage < searchPages;

  if (loadingStatus) {
    return <CollectionSkeleton />;
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

  if (!authStatus?.discogsConnected) {
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
            <Icon name="search" className="text-text-muted mr-3" aria-hidden="true" />
            <span className="sr-only">
              {activeFilter === "collection" ? "Search your collection" : "Search Discogs database"}
            </span>
            <input
              className="bg-transparent border-none focus:ring-0 w-full text-base placeholder:text-text-muted p-0 outline-none"
              placeholder={
                activeFilter === "collection" ? "Search collection..." : "Search Discogs..."
              }
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  submitSearch();
                }
              }}
            />
            <button
              onClick={() => submitSearch()}
              className="ml-2 p-1 rounded-full hover:bg-primary/10 text-primary transition-colors"
              aria-label={activeFilter === "collection" ? "Search collection" : "Search Discogs"}
            >
              <Icon name="arrow_forward" className="text-sm" />
            </button>
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
                    onClick={() => {
                      setSortBy(field);
                      submitSearch({ sortBy: field });
                    }}
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
              onClick={() => {
                const nextDir = sortDir === "asc" ? "desc" : "asc";
                setSortDir(nextDir);
                submitSearch({ sortDir: nextDir });
              }}
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
            <div className="py-12">
              <ErrorMessage message={error} />
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
                          alt={`${item.artist} - ${item.title} album cover`}
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
                        void loadCollection(page + 1, true, submittedCollectionQuery, sortBy, sortDir);
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
              <p className="text-sm text-slate-500">No matches found.</p>
              {query.trim() && (
                <button
                  onClick={() => setQuery("")}
                  className="mt-4 text-sm font-semibold text-primary hover:underline focus-ring"
                >
                  Clear search
                </button>
              )}
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
              <div className="py-12">
                <ErrorMessage message={searchError} />
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
                            alt={`${item.artist} - ${item.title} album cover`}
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
                        void runSearch(searchPage + 1, true, submittedSearchQuery);
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
                <button
                  onClick={() => clearGlobalSearch(sortBy, sortDir)}
                  className="mt-4 text-sm font-semibold text-primary hover:underline focus-ring"
                >
                  Clear search
                </button>
              </div>
            )}
          </>
        )}
        </div>
      </main>
    </>
  );
}
