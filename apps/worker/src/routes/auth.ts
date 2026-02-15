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
import type { CloudflareBinding } from "../types.js";

type HonoContext = Context<{ Bindings: CloudflareBinding }>;

const router = new Hono<{ Bindings: CloudflareBinding }>();

router.get("/status", async (c: HonoContext) => {
  const kv = c.env.NOW_SPINNING_KV;
  const sessionId = getOrCreateSessionId(c);
  setSessionCookie(c, sessionId);

  const tokens = await loadStoredTokens(kv, sessionId);

  const response: AuthStatusResponse = {
    lastfmConnected: !!tokens.lastfm,
    discogsConnected: !!tokens.discogs,
  };

  return c.json(response);
});

router.route("/lastfm", lastfmRoutes);
router.route("/discogs", discogsRoutes);

export const authRoutes = router;
