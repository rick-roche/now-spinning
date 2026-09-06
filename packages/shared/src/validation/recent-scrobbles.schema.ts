import { z } from "zod";

export const RecentScrobblesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type RecentScrobblesQuery = z.infer<typeof RecentScrobblesQuerySchema>;
