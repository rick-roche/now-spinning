/**
 * Shared validation utilities for worker routes.
 */

interface ZodIssue {
  path: PropertyKey[];
  message: string;
}

/**
 * Convert a Zod-style error into a details object mapping field paths to error messages.
 */
export function formatZodErrors(error: { issues: ZodIssue[] }): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!details[path]) details[path] = [];
    details[path].push(issue.message);
  }
  return details;
}
