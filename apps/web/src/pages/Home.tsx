import { useEffect, useState } from "react";
import { Card, Flex, Heading, Text, Button } from "@radix-ui/themes";

export function Home() {
  const [healthStatus, setHealthStatus] = useState<string | null>(null);

  useEffect(() => {
    // Test the /api/health endpoint
    fetch("/api/health")
      .then((res) => res.json())
      .then((data: { status: string }) => {
        setHealthStatus(data.status === "ok" ? "✓ API connected" : "⚠ API issue");
      })
      .catch(() => {
        setHealthStatus("✗ API unavailable");
      });
  }, []);

  return (
    <Flex direction="column" gap="4">
      <Heading size="6">Welcome to Now Spinning</Heading>

      <Card>
        <Flex direction="column" gap="3">
          <Text size="3" weight="bold">
            🎵 Scrobble your vinyl listening to Last.fm
          </Text>
          <Text size="2" color="gray">
            Pick a record from your Discogs collection, tap &quot;Now Playing&quot;, and
            let the app scrobble each track as you listen.
          </Text>
          <Text size="1" color="gray">
            {healthStatus || "Checking API..."}
          </Text>
        </Flex>
      </Card>

      <Button size="3" disabled>
        Start Session (Coming in M3)
      </Button>

      <Text size="2" color="gray">
        <strong>M0 (Skeleton):</strong> Basic monorepo structure with working local dev.
        <br />
        <strong>Next:</strong> M1 will add Discogs and Last.fm authentication.
      </Text>
    </Flex>
  );
}
