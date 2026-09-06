export interface RecentScrobble {
  artist: string;
  track: string;
  album: string;
  artworkUrl: string | null;
  timestamp: number;
}

export interface RecentScrobblesResponse {
  page: number;
  limit: number;
  pages: number;
  total: number;
  items: RecentScrobble[];
}
