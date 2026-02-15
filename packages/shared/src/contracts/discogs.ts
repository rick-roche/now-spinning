/**
 * Discogs collection contracts - shared between Worker and SPA.
 */

export interface DiscogsCollectionItem {
  releaseId: string;
  title: string;
  artist: string;
  year: number | null;
  thumbUrl: string | null;
  formats: string[];
}

export interface DiscogsCollectionResponse {
  page: number;
  pages: number;
  perPage: number;
  totalItems: number;
  items: DiscogsCollectionItem[];
}

export interface DiscogsSearchItem {
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
