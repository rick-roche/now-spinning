/**
 * Discogs API validation schemas.
 * Validates collection/search query parameters and release IDs.
 */

import { z } from "zod";

export const DiscogsCollectionSortFieldSchema = z.enum(["dateAdded", "title", "artist", "year"]);

export const DiscogsCollectionSortDirSchema = z.enum(["asc", "desc"]);

/**
 * Collection query parameters.
 * Validates pagination and filtering.
 */
export const DiscogsCollectionQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(5).max(100).default(25),
  query: z.string().trim().optional().default(""),
  sortBy: DiscogsCollectionSortFieldSchema.default("dateAdded"),
  sortDir: DiscogsCollectionSortDirSchema.default("desc"),
});

export type DiscogsCollectionQuery = z.infer<typeof DiscogsCollectionQuerySchema>;

/**
 * Search query parameters.
 * Validates search query and pagination.
 */
export const DiscogsSearchQuerySchema = z.object({
  query: z.string().trim().min(1, "Search query is required"),
  page: z.coerce.number().int().positive().default(1).optional(),
  perPage: z.coerce.number().int().min(5).max(100).default(25).optional(),
});

export type DiscogsSearchQuery = z.infer<typeof DiscogsSearchQuerySchema>;

/**
 * Release ID parameter validation.
 * Must be a non-empty string (release ID from Discogs).
 */
export const DiscogsReleaseIdSchema = z.string().trim().min(1, "Release ID is required");

export type DiscogsReleaseId = z.infer<typeof DiscogsReleaseIdSchema>;

/**
 * Release ID path parameter.
 * Used for routes like /discogs/release/:id
 */
export const DiscogsReleaseParamSchema = z.object({
  id: DiscogsReleaseIdSchema,
});

export type DiscogsReleaseParam = z.infer<typeof DiscogsReleaseParamSchema>;
