import { PostHog } from "posthog-node";

/**
 * Server-side PostHog client for API routes.
 *
 * Used by the conversion API routes (subscribe / request / claim) to fire a
 * goal-completion event from the server, where we know the submission actually
 * succeeded — more reliable than trusting a client-side fire-and-hope.
 *
 * Serverless-safe: the client is constructed lazily and flushed on every call
 * so events aren't lost when the function returns. Never throws — analytics
 * failures degrade silently rather than breaking the user's request.
 */

const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (client) return client;
  client = new PostHog(key, {
    host: HOST,
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

export async function captureServer(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const ph = getClient();
  if (!ph) return;
  try {
    ph.capture({ distinctId, event, properties });
    await ph.flush();
  } catch (err) {
    console.log("[posthog:server] capture failed:", err);
  }
}
