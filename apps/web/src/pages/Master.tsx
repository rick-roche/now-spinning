import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DiscogsReleaseIdSchema, type DiscogsMasterVersionsResponse, type PhysicalMediaType } from "@repo/shared";
import { ErrorMessage } from "../components/ErrorMessage";
import { Icon } from "../components/Icon";
import { useApiQuery } from "../hooks/useApiQuery";

const mediaTypes: PhysicalMediaType[] = ["vinyl", "cd", "cassette"];

export function Master() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const parsedId = DiscogsReleaseIdSchema.safeParse(id ?? "");
  const masterId = parsedId.success ? parsedId.data : null;
  const [selectedMedia, setSelectedMedia] = useState<PhysicalMediaType | null>(null);
  const { data, loading, error, refetch } = useApiQuery<DiscogsMasterVersionsResponse>(
    masterId ? `/api/discogs/master/${masterId}/versions` : "",
    { enabled: Boolean(masterId), errorMessage: "Failed to load available pressings", retry: 0 }
  );

  const availableMedia = useMemo(() => mediaTypes.filter((media) => data?.versions.some((version) => version.mediaType === media)), [data]);
  const versions = useMemo(() => data?.versions.filter((version) =>
    selectedMedia ? version.mediaType === selectedMedia : false
  ) ?? [], [data, selectedMedia]);

  if (!masterId) return <ErrorMessage fullPage message="Master ID must be a positive number." onRetry={() => void navigate("/search")} />;
  if (loading) return <div className="p-6 text-center" role="status">Loading pressings...</div>;
  if (error || !data) return <ErrorMessage fullPage message={error ?? "Master release not found"} onRetry={() => void refetch()} />;

  return (
    <div className="mx-auto max-w-2xl p-6 pb-28">
      <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold">Master Release</p>
      <h1 className="mt-2 text-2xl font-bold">Choose a format</h1>
      <p className="mt-2 text-sm text-text-muted">Select the physical medium you are listening to, then choose its pressing.</p>
      {data.hasMore && <p className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-text-muted" role="status">Showing the first set of pressings. Some additional Discogs versions may not be shown.</p>}
      {availableMedia.length === 0 ? (
        <div className="mt-6 rounded-xl border border-white/10 p-5 text-sm text-text-muted">No supported vinyl, CD, or cassette pressings are available for this master release.</div>
      ) : <div className="mt-6 grid grid-cols-3 gap-3">
        {availableMedia.map((media) => (
          <button key={media} type="button" aria-pressed={selectedMedia === media} onClick={() => setSelectedMedia(media)} className={`rounded-xl border p-4 text-sm font-bold capitalize focus-ring ${selectedMedia === media ? "border-primary bg-primary/10 text-primary" : "border-white/10"}`}>
            {media === "cd" ? "CD" : media}
          </button>
        ))}
      </div>}
      {selectedMedia && <div className="mt-8 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider">Choose a pressing</h2>
        {versions.map((version) => (
          <button key={version.releaseId} type="button" onClick={() => void navigate(`/release/${version.releaseId}`)} className="flex w-full items-center gap-4 rounded-xl border border-white/10 p-4 text-left hover:border-primary focus-ring">
            <Icon name="album" className="text-primary" />
            <span className="min-w-0 flex-1"><span className="block truncate font-bold">{version.title}</span><span className="block truncate text-xs text-text-muted">{version.formats.join(" · ")}{version.year ? ` · ${version.year}` : ""}</span></span>
            <Icon name="arrow_forward" />
          </button>
        ))}
      </div>}
    </div>
  );
}
