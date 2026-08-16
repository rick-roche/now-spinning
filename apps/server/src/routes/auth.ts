/**
 * Auth router - combines all auth endpoints.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { AuthStatusResponse } from "@repo/shared";
import {
  getOrCreateSessionId,
  setSessionCookie,
  loadStoredTokens,
} from "../middleware/auth.js";
import { lastfmRoutes } from "./auth/lastfm.js";
import { discogsRoutes } from "./auth/discogs.js";
import type { AppEnvironment } from "../types.js";

type HonoContext = Context<{ Bindings: AppEnvironment }>;

const router = new Hono<{ Bindings: AppEnvironment }>();

router.get("/status", async (c: HonoContext) => {
  const storage = c.env.NOW_SPINNING_STORAGE;
  const sessionId = getOrCreateSessionId(c);
  setSessionCookie(c, sessionId);

  const tokens = await loadStoredTokens(storage, sessionId);

  const response: AuthStatusResponse = {
    lastfmConnected: !!tokens.lastfm,
    discogsConnected: !!tokens.discogs,
  };

  return c.json(response);
});

router.route("/lastfm", lastfmRoutes);
router.route("/discogs", discogsRoutes);

export const authRoutes = router;
