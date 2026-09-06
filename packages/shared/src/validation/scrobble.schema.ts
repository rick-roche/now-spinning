import { z } from "zod";
import { DiscogsReleaseIdSchema } from "./discogs.schema.js";

export const DirectScrobbleRequestSchema = z.object({
  operationId: z.uuid("Operation ID must be a UUID"),
  releaseId: DiscogsReleaseIdSchema,
  trackIndices: z.array(z.number().int().min(0)).min(1).max(1000)
    .refine((indices) => new Set(indices).size === indices.length, "Track indices must be unique"),
}).strict();

export type DirectScrobbleRequestInput = z.infer<typeof DirectScrobbleRequestSchema>;
