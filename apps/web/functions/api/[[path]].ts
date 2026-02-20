/**
 * Cloudflare Pages Function to proxy all /api/* requests to the Worker by URL.
 * This avoids requiring a Pages service binding for Worker-to-Worker fetch.
 */

const DEFAULT_API_BASE_URL = "https://now-spinning-api.rickroche.workers.dev";

interface Env {
  API_BASE_URL?: string;
}

interface PagesContext<E = unknown> {
  request: Request;
  env: E;
  params: {
    path?: string | string[];
  };
}

type PagesHandler<E = unknown> = (
  context: PagesContext<E>
) => Response | Promise<Response>;

export const onRequest: PagesHandler<Env> = async (context) => {
  const { request, env, params } = context;

  const path =
    Array.isArray(params.path) ? params.path.join("/") : (params.path ?? "");

  const incomingUrl = new URL(request.url);
  const apiBaseUrl = (env.API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  const upstreamUrl = new URL(`${apiBaseUrl}/api/${path}`);
  upstreamUrl.search = incomingUrl.search;

  const init: RequestInit = {
    method: request.method,
    headers: request.headers,
    redirect: "manual",
  };
  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  return fetch(upstreamUrl, init);
};
