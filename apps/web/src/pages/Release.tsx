import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Button,
  Card,
  Flex,
  Heading,
  Spinner,
  Text,
} from "@radix-ui/themes";
import type { DiscogsReleaseResponse, NormalizedRelease } from "@repo/shared";

export function Release() {
  const { id } = useParams<{ id: string }>();
  const [release, setRelease] = useState<NormalizedRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRelease = async () => {
      if (!id) {
        setError("Missing release id.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/api/discogs/release/${id}`);
        if (!response.ok) {
          throw new Error("Failed to load release");
        }

        const data = (await response.json()) as DiscogsReleaseResponse<NormalizedRelease>;
        setRelease(data.release);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void loadRelease();
  }, [id]);

  const groupedTracks = useMemo(() => {
    if (!release) {
      return [];
    }

    const groups = new Map<string, typeof release.tracks>();
    const order: string[] = [];

    release.tracks.forEach((track) => {
      const key = track.side ?? "Tracks";
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)?.push(track);
    });

    return order.map((key) => ({
      key,
      label: key === "Tracks" ? "Tracks" : `Side ${key}`,
      tracks: groups.get(key) ?? [],
    }));
  }, [release]);

  const formatDuration = (durationSec: number | null) => {
    if (!durationSec && durationSec !== 0) {
      return "—";
    }

    const minutes = Math.floor(durationSec / 60);
    const seconds = durationSec % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <Flex direction="column" gap="4">
      <Button asChild size="2" variant="soft">
        <Link to="/search">Back to Search</Link>
      </Button>

      {loading ? (
        <Flex gap="2" align="center">
          <Spinner />
          <Text size="2">Loading release...</Text>
        </Flex>
      ) : error ? (
        <Card style={{ backgroundColor: "#fee2e2" }}>
          <Text size="2" color="red">
            {error}
          </Text>
        </Card>
      ) : release ? (
        <>
          <Flex direction="column" gap="2">
            <Heading size="6">{release.title}</Heading>
            <Text size="2" color="gray">
              {release.artist}
              {release.year ? ` · ${release.year}` : ""}
            </Text>
          </Flex>

          {release.coverUrl ? (
            <img
              src={release.coverUrl}
              alt={`${release.title} cover`}
              style={{
                width: "100%",
                maxWidth: 320,
                borderRadius: 12,
                objectFit: "cover",
              }}
            />
          ) : null}

          <Card>
            <Flex direction="column" gap="3">
              {groupedTracks.map((group) => (
                <Flex key={group.key} direction="column" gap="2">
                  <Text size="2" weight="bold">
                    {group.label}
                  </Text>
                  {group.tracks.map((track) => (
                    <Flex key={`${group.key}-${track.index}`} justify="between" gap="3">
                      <Flex direction="column" gap="1">
                        <Text size="2">
                          {track.position}. {track.title}
                        </Text>
                        {track.artist !== release.artist ? (
                          <Text size="1" color="gray">
                            {track.artist}
                          </Text>
                        ) : null}
                      </Flex>
                      <Text size="1" color="gray">
                        {formatDuration(track.durationSec)}
                      </Text>
                    </Flex>
                  ))}
                </Flex>
              ))}
            </Flex>
          </Card>

          <Button size="3" disabled>
            Start Session (Coming in M3)
          </Button>
        </>
      ) : null}
    </Flex>
  );
}
