/**
 * Cloudflare Pages Function to proxy all /api/* requests to the Worker
 */

interface Env {
  API: {
    fetch: (request: Request) => Promise<Response>;
  };
}

interface PagesContext<E = unknown> {
  request: Request;
  env: E;
  params: Record<string, string>;
  waitUntil: (promise: Promise<unknown>) => void;
  next: () => Promise<Response>;
  data: Record<string, unknown>;
}

type PagesHandler<E = unknown> = (
  context: PagesContext<E>
) => Response | Promise<Response>;

export const onRequest: PagesHandler<Env> = async (context) => {
  const { request, env } = context;

  // Forward the request to the Worker service
  // The Worker will receive the full URL path including /api
  return env.API.fetch(request);
};
