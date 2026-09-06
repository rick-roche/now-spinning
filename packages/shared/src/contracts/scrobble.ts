import type { NormalizedRelease } from "../domain/release.js";

export type DirectScrobbleTrackStatus =
  | "delivered"
  | "already-delivered"
  | "ignored"
  | "unconfirmed"
  | "failed";

export type DirectScrobbleOperationStatus = "pending" | "completed" | "failed";

export interface DirectScrobbleRequest {
  operationId: string;
  releaseId: string;
  trackIndices: number[];
}

export interface DirectScrobbleTrackResult {
  trackIndex: number;
  title: string;
  timestamp: number;
  status: DirectScrobbleTrackStatus;
  message?: string;
  retryable?: boolean;
}

export interface DirectScrobbleOperation {
  operationId: string;
  releaseId: string;
  trackIndices: number[];
  createdAt: number;
  updatedAt: number;
  status: DirectScrobbleOperationStatus;
  activeSessionWarning: boolean;
  tracks: DirectScrobbleTrackResult[];
}

export interface DirectScrobbleResponse {
  operation: DirectScrobbleOperation;
  release: Pick<NormalizedRelease, "id" | "title" | "artist">;
}

/** Assigns the selected tracks ascending timestamps, with the last track at now. */
export function createDirectScrobbleTimestamps(trackCount: number, now: number): number[] {
  return Array.from({ length: trackCount }, (_, index) => now - (trackCount - index - 1));
}
