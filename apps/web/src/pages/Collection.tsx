import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  Flex,
  Heading,
  Spinner,
  Text,
  TextField,
} from "@radix-ui/themes";
import type {
  AuthStatusResponse,
  DiscogsCollectionItem,
  DiscogsCollectionResponse,
} from "@repo/shared";

export function Collection() {
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [items, setItems] = useState<DiscogsCollectionItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const loadCollection = useCallback(async (nextPage: number, append: boolean) => {
    try {
      setError(null);
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const response = await fetch(`/api/discogs/collection?page=${nextPage}`);
      if (!response.ok) {
        throw new Error("Failed to load collection");
      }

      const data = (await response.json()) as DiscogsCollectionResponse;
      setItems((prev) => (append ? [...prev, ...data.items] : data.items));
      setPage(data.page);
      setPages(data.pages);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        setLoadingStatus(true);
        const response = await fetch("/api/auth/status");
        if (!response.ok) {
          throw new Error("Failed to fetch auth status");
        }
        const data = (await response.json()) as AuthStatusResponse;
        setAuthStatus(data);
        if (data.discogsConnected) {
          await loadCollection(1, false);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoadingStatus(false);
      }
    };

    void fetchStatus();
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }
    return items.filter((item) => {
      return (
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.artist.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [items, query]);

  const canLoadMore = page < pages;

  return (
    <Flex direction="column" gap="4">
      <Heading size="6">Collection</Heading>

      {loadingStatus ? (
        <Flex gap="2" align="center">
          <Spinner />
          <Text size="2">Checking Discogs connection...</Text>
        </Flex>
      ) : authStatus?.discogsConnected ? (
        <>
          <TextField.Root
            placeholder="Search your collection"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          {error && (
            <Card style={{ backgroundColor: "#fee2e2" }}>
              <Text size="2" color="red">
                {error}
              </Text>
            </Card>
          )}

          {loading ? (
            <Flex gap="2" align="center">
              <Spinner />
              <Text size="2">Loading collection...</Text>
            </Flex>
          ) : filteredItems.length > 0 ? (
            <Flex direction="column" gap="3">
              {filteredItems.map((item) => (
                <Card key={item.instanceId}>
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
                        <Flex gap="2" wrap="wrap">
                          {item.formats.map((format) => (
                            <Badge key={`${item.instanceId}-${format}`} size="1">
                              {format}
                            </Badge>
                          ))}
                        </Flex>
                      ) : null}
                    </Flex>

                    <Button asChild size="1" variant="soft">
                      <Link to={`/release/${item.releaseId}`}>Details</Link>
                    </Button>
                  </Flex>
                </Card>
              ))}
            </Flex>
          ) : (
            <Text size="2" color="gray">
              No matches yet. Try another search.
            </Text>
          )}

          {canLoadMore && !loading && (
            <Button
              size="2"
              variant="soft"
              onClick={() => void loadCollection(page + 1, true)}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading..." : "Load more"}
            </Button>
          )}
        </>
      ) : (
        <Card>
          <Flex direction="column" gap="3">
            <Text size="2" weight="medium">
              Connect Discogs to see your collection.
            </Text>
            <Button asChild size="2">
              <Link to="/settings">Go to Settings</Link>
            </Button>
          </Flex>
        </Card>
      )}
    </Flex>
  );
}
