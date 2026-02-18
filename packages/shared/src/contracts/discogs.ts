/**
 * Discogs collection contracts - shared between Worker and SPA.
 */

export interface DiscogsCollectionItem {
  instanceId: string;
  releaseId: string;
  title: string;
  artist: string;
  year: number | null;
  thumbUrl: string | null;
  formats: string[];
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
