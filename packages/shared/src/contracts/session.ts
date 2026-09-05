/**
 * Session contracts shared between the server and SPA.
 */

import type { Session } from "../domain/session.js";

export interface SessionStartRequest {
  releaseId: string;
  thresholdPercent?: number;
  notifyOnSideCompletion?: boolean;
}

export interface SessionStartResponse {
  session: Session;
}

export interface SessionActionResponse {
  session: Session;
}

export type SessionEndMode =
  | "end-without-scrobbling"
  | "scrobble-current-and-remaining"
  | "skip-remaining";

export interface SessionEndRequest {
  mutationId: string;
  expectedRevision: number;
  expectedTrackIndex: number;
  endMode: SessionEndMode;
}

export interface SessionCurrentResponse {
  session: Session | null;
}

export interface SessionSyncResponse {
  session: Session;
  scrobbledCount: number;
}
