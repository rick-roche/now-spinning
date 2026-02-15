import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  Flex,
  Heading,
  Spinner,
  Text,
  TextField,
} from "@radix-ui/themes";
import type { DiscogsSearchItem, DiscogsSearchResponse } from "@repo/shared";
import { Collection } from "./Collection";

type SearchTab = "collection" | "discogs";

export function Search() {
  const [activeTab, setActiveTab] = useState<SearchTab>("collection");

  return (
    <Flex direction="column" gap="4">
      <Heading size="6">Search</Heading>

      <Flex gap="2" wrap="wrap">
        <Button
          size="2"
          variant={activeTab === "collection" ? "solid" : "soft"}
          onClick={() => setActiveTab("collection")}
        >
          Collection
        </Button>
        <Button
          size="2"
          variant={activeTab === "discogs" ? "solid" : "soft"}
          onClick={() => setActiveTab("discogs")}
        >
          Discogs Search
        </Button>
      </Flex>

      {activeTab === "collection" ? <Collection /> : <DiscogsSearchPanel />}
    </Flex>
  );
}

function DiscogsSearchPanel() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<DiscogsSearchItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const canLoadMore = page < pages;
  const isQueryEmpty = query.trim().length === 0;

  const runSearch = useCallback(
    async (nextPage: number, append: boolean) => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        setError("Enter a search term first.");
        return;
      }

      try {
        setError(null);
        setHasSearched(true);
        if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }

        const response = await fetch(
          `/api/discogs/search?query=${encodeURIComponent(trimmedQuery)}&page=${nextPage}`
        );
        if (!response.ok) {
          throw new Error("Failed to search Discogs");
        }

        const data = (await response.json()) as DiscogsSearchResponse;
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setPage(data.page);
        setPages(data.pages);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [query]
  );

  const emptyState = useMemo(() => {
    if (loading || loadingMore) {
      return null;
    }

    if (!hasSearched) {
      return "Search Discogs for a release.";
    }

    return items.length === 0 ? "No results yet. Try another search." : null;
  }, [hasSearched, items.length, loading, loadingMore]);

  return (
    <Flex direction="column" gap="3">
      <TextField.Root
        placeholder="Search Discogs releases"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            void runSearch(1, false);
          }
        }}
      />

      <Button
        size="2"
        onClick={() => void runSearch(1, false)}
        disabled={loading || isQueryEmpty}
      >
        {loading ? "Searching..." : "Search"}
      </Button>

      {error && (
        <Card style={{ backgroundColor: "#fee2e2" }}>
          <Text size="2" color="red">
            {error}
          </Text>
        </Card>
      )}

      {loading && (
        <Flex gap="2" align="center">
          <Spinner />
          <Text size="2">Searching Discogs...</Text>
        </Flex>
      )}

      {items.length > 0 && (
        <Flex direction="column" gap="3">
          {items.map((item) => (
            <Card key={item.releaseId}>
              <Flex gap="3" align="center">
                {item.thumbUrl ? (
                  <img
                    src={item.thumbUrl}
                    alt={`${item.title} cover`}
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 6,
                      objectFit: "cover",
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 6,
                      backgroundColor: "#e5e5e5",
                      flexShrink: 0,
                    }}
                  />
                )}

                <Flex direction="column" gap="1" style={{ flex: 1 }}>
                  <Text size="3" weight="bold">
                    {item.title}
                  </Text>
                  <Text size="2" color="gray">
                    {item.artist}
                    {item.year ? ` - ${item.year}` : ""}
                  </Text>
                  {item.formats.length > 0 ? (
                    <Text size="1" color="gray">
                      {item.formats.join(" · ")}
                    </Text>
                  ) : null}
                </Flex>

                <Button asChild size="1" variant="soft">
                  <Link to={`/release/${item.releaseId}`}>Details</Link>
                </Button>
              </Flex>
            </Card>
          ))}
        </Flex>
      )}

      {emptyState && (
        <Text size="2" color="gray">
          {emptyState}
        </Text>
      )}

      {canLoadMore && items.length > 0 && (
        <Button
          size="2"
          variant="soft"
          onClick={() => void runSearch(page + 1, true)}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading..." : "Load more"}
        </Button>
      )}
    </Flex>
  );
}
