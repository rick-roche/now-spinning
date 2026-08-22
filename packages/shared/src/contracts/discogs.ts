/**
 * Discogs collection contracts shared between the server and SPA.
 */

export type DiscogsCollectionSortField = "dateAdded" | "title" | "artist" | "year";
export type DiscogsCollectionSortDir = "asc" | "desc";

export interface DiscogsCollectionItem {
  instanceId: string;
  releaseId: string;
  title: string;
  artist: string;
  year: number | null;
  thumbUrl: string | null;
  formats: string[];
  mediaType?: import("../domain/release.js").PhysicalMediaType;
  dateAdded?: string | null;
}

export interface DiscogsCollectionResponse {
  page: number;
  pages: number;
  perPage: number;
  totalItems: number;
  items: DiscogsCollectionItem[];
}

export interface DiscogsSearchItem {
  instanceId: string;
  releaseId: string;
  title: string;
  artist: string;
  year: number | null;
  thumbUrl: string | null;
  formats: string[];
  mediaType?: import("../domain/release.js").PhysicalMediaType;
  /** True when the result is a Discogs master release, not a playable pressing. */
  isMaster?: boolean;
}

export interface DiscogsMasterVersion {
  releaseId: string;
  title: string;
  year: number | null;
  thumbUrl: string | null;
  formats: string[];
  mediaType: import("../domain/release.js").PhysicalMediaType;
}

export interface DiscogsMasterVersionsResponse {
  masterId: string;
  versions: DiscogsMasterVersion[];
}

export interface DiscogsSearchResponse {
  query: string;
  page: number;
  pages: number;
  perPage: number;
  totalItems: number;
  items: DiscogsSearchItem[];
}

export interface DiscogsReleaseResponse<TRelease> {
  release: TRelease;
}
