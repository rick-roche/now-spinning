import { useEffect, useState } from "react";
import { Button, Card, Flex, Heading, Text, Spinner } from "@radix-ui/themes";
import type { AuthStatusResponse } from "@repo/shared";

interface OAuthStartResponse {
  redirectUrl: string;
}

export function Settings() {
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch auth status on mount and when URL params change
  useEffect(() => {
    const fetchAuthStatus = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/auth/status");
        if (!response.ok) {
          throw new Error("Failed to fetch auth status");
        }
        const data = (await response.json()) as AuthStatusResponse;
        setAuthStatus(data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void fetchAuthStatus();
  }, []);

  const handleConnectLastFm = async () => {
    try {
      const response = await fetch("/api/auth/lastfm/start");
      const data = (await response.json()) as OAuthStartResponse;
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleConnectDiscogs = async () => {
    try {
      const response = await fetch("/api/auth/discogs/start", {
        method: "POST",
      });
      const data = (await response.json()) as OAuthStartResponse;
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDisconnectLastFm = async () => {
    try {
      await fetch("/api/auth/lastfm/disconnect", { method: "POST" });
      setAuthStatus((prev) =>
        prev ? { ...prev, lastfmConnected: false } : null
      );
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDisconnectDiscogs = async () => {
    try {
      await fetch("/api/auth/discogs/disconnect", { method: "POST" });
      setAuthStatus((prev) =>
        prev ? { ...prev, discogsConnected: false } : null
      );
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Flex direction="column" gap="4">
      <Heading size="6">Settings</Heading>

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
          <Text size="2">Loading auth status...</Text>
        </Flex>
      ) : authStatus ? (
        <>
          <Card>
            <Flex direction="column" gap="3">
              <Text size="3" weight="bold">
                Authentication
              </Text>

              {/* Last.fm Section */}
              <Flex direction="column" gap="2">
                <Flex justify="between" align="center">
                  <Flex direction="column" gap="1">
                    <Text size="2" weight="medium">
                      Last.fm
                    </Text>
                    <Text size="1" color="gray">
                      {authStatus.lastfmConnected
                        ? "✓ Connected"
                        : "Not connected"}
                    </Text>
                  </Flex>
                  <Button
                    size="1"
                    color={authStatus.lastfmConnected ? "red" : "blue"}
                    onClick={() => void (authStatus.lastfmConnected ? handleDisconnectLastFm() : handleConnectLastFm())}
                  >
                    {authStatus.lastfmConnected ? "Disconnect" : "Connect"}
                  </Button>
                </Flex>
              </Flex>

              {/* Discogs Section */}
              <Flex direction="column" gap="2">
                <Flex justify="between" align="center">
                  <Flex direction="column" gap="1">
                    <Text size="2" weight="medium">
                      Discogs
                    </Text>
                    <Text size="1" color="gray">
                      {authStatus.discogsConnected
                        ? "✓ Connected"
                        : "Not connected"}
                    </Text>
                  </Flex>
                  <Button
                    size="1"
                    color={authStatus.discogsConnected ? "red" : "blue"}
                    onClick={() => void (authStatus.discogsConnected ? handleDisconnectDiscogs() : handleConnectDiscogs())}
                  >
                    {authStatus.discogsConnected ? "Disconnect" : "Connect"}
                  </Button>
                </Flex>
              </Flex>

              <Text size="1" color="gray">
                Last.fm is required for scrobbling. Discogs is optional for
                browsing your collection.
              </Text>
            </Flex>
          </Card>

          <Card>
            <Flex direction="column" gap="3">
              <Text size="3" weight="bold">
                Scrobble Behavior
              </Text>
              <Text size="2" color="gray">
                Configuration will be available in a future update.
              </Text>
            </Flex>
          </Card>
        </>
      ) : null}
    </Flex>
  );
}
