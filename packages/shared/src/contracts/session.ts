/**
 * Session contracts - shared between Worker and SPA.
 */

import type { Session } from "../domain/session.js";

export interface SessionStartRequest {
  releaseId: string;
}

export interface SessionStartResponse {
  session: Session;
}

export interface SessionActionResponse {
  session: Session;
}

export interface SessionCurrentResponse {
  session: Session | null;
}
